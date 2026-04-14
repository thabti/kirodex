use serde::{Deserialize, Serialize};
use std::sync::Mutex;

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
    pub has_onboarded: bool,
    /// Flag for anonymous product analytics. Defaults to true; the user
    /// must turn it on via Settings → Advanced.
    #[serde(default)]
    pub analytics_enabled: bool,
    /// Random UUID created on first opt-in and cleared on opt-out. Used as the
    /// PostHog `distinct_id` — never tied to OS identity, email, or machine ID.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analytics_anon_id: Option<String>,
}

fn default_kiro_bin() -> String {
    "kiro-cli".to_string()
}
fn default_font_size() -> u32 {
    13
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
            has_onboarded: false,
            analytics_enabled: true,
            analytics_anon_id: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoreData {
    pub settings: AppSettings,
}

pub struct SettingsState(pub Mutex<StoreData>);

const APP_NAME: &str = "kirodex";

impl Default for SettingsState {
    fn default() -> Self {
        let data = confy::load::<StoreData>(APP_NAME, None).unwrap_or_default();
        Self(Mutex::new(data))
    }
}

fn persist_store(data: &StoreData) -> Result<(), AppError> {
    confy::store(APP_NAME, None, data)?;
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, SettingsState>) -> Result<AppSettings, AppError> {
    let store = state.0.lock()?;
    Ok(store.settings.clone())
}

#[tauri::command]
pub fn save_settings(
    state: tauri::State<'_, SettingsState>,
    settings: AppSettings,
) -> Result<(), AppError> {
    let mut store = state.0.lock()?;
    store.settings = settings;
    persist_store(&store)
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
        assert!(!s.has_onboarded);
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
            },
        );
        let settings = AppSettings {
            kiro_bin: "/usr/local/bin/kiro-cli".to_string(),
            font_size: 16,
            auto_approve: true,
            has_onboarded: true,
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
        assert!(restored.has_onboarded);
        assert!(!restored.respect_gitignore);
        assert!(!restored.co_author);
        let pp = restored.project_prefs.unwrap();
        assert_eq!(pp["proj"].model_id.as_deref(), Some("claude-4"));
    }

    #[test]
    fn deserialize_with_missing_fields_uses_defaults() {
        let json = r#"{"kiroBin": "/bin/kiro"}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.kiro_bin, "/bin/kiro");
        assert_eq!(settings.font_size, 13);
        assert!(settings.respect_gitignore);
        assert!(settings.co_author);
        assert!(!settings.has_onboarded);
    }

    #[test]
    fn camel_case_serialization() {
        let settings = AppSettings::default();
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("kiroBin"));
        assert!(json.contains("fontSize"));
        assert!(json.contains("autoApprove"));
        assert!(json.contains("hasOnboarded"));
        assert!(!json.contains("kiro_bin"));
    }
}
