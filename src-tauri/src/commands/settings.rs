use serde::{Deserialize, Serialize};
use parking_lot::Mutex;

use super::error::AppError;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    pub id: String,
    pub name: String,
    pub agent_id: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPrefs {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_approve: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symlink_directories: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tight_sandbox: Option<bool>,
    /// Icon override set by the user (framework, file, or emoji).
    /// Stored as opaque JSON to avoid replicating the TypeScript union type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_override: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_kiro_bin")]
    pub kiro_bin: String,
    #[serde(default)]
    pub agent_profiles: Vec<AgentProfile>,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(default)]
    pub auto_approve: bool,
    #[serde(default = "default_true")]
    pub respect_gitignore: bool,
    #[serde(default = "default_true")]
    pub co_author: bool,
    #[serde(default)]
    pub co_author_json_report: bool,
    #[serde(default = "default_true")]
    pub notifications: bool,
    #[serde(default = "default_true")]
    pub sound_notifications: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_prefs: Option<std::collections::HashMap<String, ProjectPrefs>>,
    #[serde(default)]
    pub has_onboarded_v2: bool,
    /// Flag for anonymous product analytics. Defaults to true; the user
    /// can turn it off via Settings → Advanced.
    #[serde(default = "default_true")]
    pub analytics_enabled: bool,
    /// Random UUID created on first opt-in and cleared on opt-out. Used as the
    /// PostHog `distinct_id` — never tied to OS identity, email, or machine ID.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analytics_anon_id: Option<String>,
    /// Theme mode: "dark", "light", or "system". Default: "dark".
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Base64 data URL for a user-supplied app icon (About dialog + dock).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_app_icon: Option<String>,
}

fn default_kiro_bin() -> String {
    "kiro-cli".to_string()
}
fn default_font_size() -> u32 {
    13
}
fn default_theme() -> String {
    "dark".to_string()
}
fn default_true() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            kiro_bin: default_kiro_bin(),
            agent_profiles: vec![],
            font_size: default_font_size(),
            default_model: None,
            auto_approve: false,
            respect_gitignore: true,
            co_author: true,
            co_author_json_report: true,
            notifications: true,
            sound_notifications: true,
            project_prefs: None,
            has_onboarded_v2: false,
            analytics_enabled: true,
            analytics_anon_id: None,
            theme: default_theme(),
            custom_app_icon: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoreData {
    pub settings: AppSettings,
    #[serde(default)]
    pub recent_projects: Vec<String>,
}

/// Maximum number of recent projects to keep.
const MAX_RECENT_PROJECTS: usize = 10;

pub struct SettingsState(pub Mutex<StoreData>);

const APP_NAME: &str = "kirodex";

impl Default for SettingsState {
    fn default() -> Self {
        let data = confy::load::<StoreData>(APP_NAME, None).unwrap_or_default();
        Self(Mutex::new(data))
    }
}

pub fn persist_store(data: &StoreData) -> Result<(), AppError> {
    confy::store(APP_NAME, None, data)?;
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, SettingsState>) -> Result<AppSettings, AppError> {
    let store = state.0.lock();
    Ok(store.settings.clone())
}

#[tauri::command]
pub fn save_settings(
    state: tauri::State<'_, SettingsState>,
    settings: AppSettings,
) -> Result<(), AppError> {
    let mut store = state.0.lock();
    store.settings = settings;
    persist_store(&store)
}

#[tauri::command]
pub fn get_recent_projects(state: tauri::State<'_, SettingsState>) -> Result<Vec<String>, AppError> {
    let store = state.0.lock();
    Ok(store.recent_projects.clone())
}

#[tauri::command]
pub fn add_recent_project(
    state: tauri::State<'_, SettingsState>,
    path: String,
) -> Result<(), AppError> {
    let mut store = state.0.lock();
    if store.recent_projects.first() == Some(&path) {
        return Ok(());
    }
    store.recent_projects.retain(|p| p != &path);
    store.recent_projects.insert(0, path);
    store.recent_projects.truncate(MAX_RECENT_PROJECTS);
    persist_store(&store)
}

#[tauri::command]
pub fn clear_recent_projects(state: tauri::State<'_, SettingsState>) -> Result<(), AppError> {
    let mut store = state.0.lock();
    store.recent_projects.clear();
    persist_store(&store)
}

/// Set the macOS dock / app icon at runtime from a base64-encoded PNG.
/// On non-macOS platforms this is a no-op.
#[tauri::command]
pub fn set_dock_icon(icon_base64: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use base64::Engine;
        use cocoa::base::{id, nil};
        use objc::{msg_send, sel, sel_impl, class};

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&icon_base64)
            .map_err(|e| format!("Invalid base64: {e}"))?;

        unsafe {
            let ns_data: id = msg_send![class!(NSData), alloc];
            let ns_data: id = msg_send![ns_data, initWithBytes:bytes.as_ptr() length:bytes.len()];
            if ns_data == nil {
                return Err("Failed to create NSData".into());
            }
            let ns_image: id = msg_send![class!(NSImage), alloc];
            let ns_image: id = msg_send![ns_image, initWithData:ns_data];
            if ns_image == nil {
                let _: () = msg_send![ns_data, release];
                return Err("Failed to create NSImage from data".into());
            }
            let app: id = msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![app, setApplicationIconImage:ns_image];
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = icon_base64;
    Ok(())
}

/// Reset the macOS dock / app icon to the default bundle icon.
#[tauri::command]
pub fn reset_dock_icon() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use cocoa::base::{id, nil};
        use objc::{msg_send, sel, sel_impl, class};

        unsafe {
            let app: id = msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![app, setApplicationIconImage:nil];
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_values() {
        let s = AppSettings::default();
        assert_eq!(s.kiro_bin, "kiro-cli");
        assert_eq!(s.font_size, 13);
        assert!(!s.auto_approve);
        assert!(s.respect_gitignore);
        assert!(s.co_author);
        assert!(!s.has_onboarded_v2);
        assert!(s.agent_profiles.is_empty());
        assert!(s.project_prefs.is_none());
        assert!(s.analytics_enabled);
        assert!(s.analytics_anon_id.is_none());
    }

    #[test]
    fn serde_roundtrip_preserves_all_fields() {
        let mut prefs = std::collections::HashMap::new();
        prefs.insert(
            "proj".to_string(),
            ProjectPrefs {
                model_id: Some("claude-4".to_string()),
                auto_approve: Some(true),
                worktree_enabled: Some(true),
                symlink_directories: Some(vec!["node_modules".to_string(), ".next".to_string()]),
                tight_sandbox: Some(true),
                icon_override: Some(serde_json::json!({"type": "emoji", "emoji": "🚀"})),
            },
        );
        let settings = AppSettings {
            kiro_bin: "/usr/local/bin/kiro-cli".to_string(),
            font_size: 16,
            auto_approve: true,
            has_onboarded_v2: true,
            respect_gitignore: false,
            co_author: false,
            project_prefs: Some(prefs),
            ..Default::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        let restored: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.kiro_bin, "/usr/local/bin/kiro-cli");
        assert_eq!(restored.font_size, 16);
        assert!(restored.auto_approve);
        assert!(restored.has_onboarded_v2);
        assert!(!restored.respect_gitignore);
        assert!(!restored.co_author);
        let pp = restored.project_prefs.unwrap();
        assert_eq!(pp["proj"].model_id.as_deref(), Some("claude-4"));
        assert_eq!(pp["proj"].worktree_enabled, Some(true));
        assert_eq!(pp["proj"].symlink_directories.as_deref(), Some(vec!["node_modules".to_string(), ".next".to_string()]).as_deref());
        assert_eq!(pp["proj"].tight_sandbox, Some(true));
        assert_eq!(pp["proj"].icon_override, Some(serde_json::json!({"type": "emoji", "emoji": "🚀"})));
    }

    #[test]
    fn icon_override_roundtrips_all_variants() {
        let framework = serde_json::json!({"type": "framework", "id": "react"});
        let prefs = ProjectPrefs { icon_override: Some(framework.clone()), ..Default::default() };
        let json = serde_json::to_string(&prefs).unwrap();
        let restored: ProjectPrefs = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.icon_override, Some(framework));
    }

    #[test]
    fn icon_override_defaults_to_none_when_missing() {
        let prefs: ProjectPrefs = serde_json::from_str(r#"{}"#).unwrap();
        assert!(prefs.icon_override.is_none());
    }

    #[test]
    fn tight_sandbox_defaults_to_none_when_missing() {
        let json = r#"{}"#;
        let prefs: ProjectPrefs = serde_json::from_str(json).unwrap();
        assert!(prefs.tight_sandbox.is_none());
    }

    #[test]
    fn deserialize_with_missing_fields_uses_defaults() {
        let json = r#"{"kiroBin": "/bin/kiro"}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.kiro_bin, "/bin/kiro");
        assert_eq!(settings.font_size, 13);
        assert!(settings.respect_gitignore);
        assert!(settings.co_author);
        assert!(!settings.has_onboarded_v2);
    }

    #[test]
    fn camel_case_serialization() {
        let settings = AppSettings::default();
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("kiroBin"));
        assert!(json.contains("fontSize"));
        assert!(json.contains("autoApprove"));
        assert!(json.contains("hasOnboardedV2"));
        assert!(!json.contains("kiro_bin"));
    }
}
