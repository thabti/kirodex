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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_prefs: Option<std::collections::HashMap<String, ProjectPrefs>>,
}

fn default_kiro_bin() -> String { "kiro-cli".to_string() }
fn default_font_size() -> u32 { 13 }
fn default_true() -> bool { true }

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
            project_prefs: None,
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
