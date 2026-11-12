use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TauriLaunchConfig {
    #[serde(default = "default_window_mode")]
    pub window_mode: String,
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default)]
    pub additional_params_enabled: bool,
    #[serde(default)]
    pub additional_params: String,
    #[serde(default)]
    pub use_as_default: bool,
    #[serde(default)]
    pub launch_configurator_every_time: bool,
    #[serde(default)]
    pub tray_only_mode: bool,
}

fn default_window_mode() -> String {
    "windowed".to_string()
}

fn default_theme_mode() -> String {
    "dark".to_string()
}

impl Default for TauriLaunchConfig {
    fn default() -> Self {
        Self {
            window_mode: default_window_mode(),
            theme_mode: default_theme_mode(),
            additional_params_enabled: false,
            additional_params: String::new(),
            use_as_default: false,
            launch_configurator_every_time: false,
            tray_only_mode: false,
        }
    }
}

pub fn has_dev_param_flag(raw: &str) -> bool {
    raw.contains("dev=1")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TauriLaunchStatePayload {
    pub config: TauriLaunchConfig,
    pub config_file_exists: bool,
    pub has_valid_default: bool,
    pub platform: String,
    pub workspace_dir: String,
    pub vault_dir: String,
    pub config_file_path: String,
}

pub fn current_platform_tag() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

/// Resolves the public user workspace directory (`<app_data_dir>/workspace`),
/// where `launch-config.json`, `replays/`, and `training_packs/` live together.
pub fn resolve_workspace_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    base.join("workspace")
}

/// Resolves the machine-bound private vault directory (`<app_local_data_dir>/.vault`),
/// isolated outside `workspace/` so workspace exports never leak `.rctbnspib` credentials.
pub fn resolve_vault_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    base.join(".vault")
}

pub fn resolve_config_file_path(app: &AppHandle) -> PathBuf {
    resolve_workspace_dir(app).join("launch-config.json")
}

pub fn ensure_storage_directories(app: &AppHandle) -> Result<(), String> {
    let workspace = resolve_workspace_dir(app);
    let vault = resolve_vault_dir(app);
    for dir in [
        workspace.clone(),
        workspace.join("replays"),
        workspace.join("training_packs"),
        vault,
    ] {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {:?}: {}", dir, e))?;
    }
    Ok(())
}

pub fn load_launch_state(app: &AppHandle) -> TauriLaunchStatePayload {
    let _ = ensure_storage_directories(app);
    let workspace_dir = resolve_workspace_dir(app);
    let vault_dir = resolve_vault_dir(app);
    let config_path = resolve_config_file_path(app);

    let mut config_file_exists = false;
    let mut config = TauriLaunchConfig::default();

    if config_path.is_file() {
        if let Ok(raw) = fs::read_to_string(&config_path) {
            if let Ok(parsed) = serde_json::from_str::<TauriLaunchConfig>(&raw) {
                config_file_exists = true;
                config = sanitize_config_for_platform(parsed);
            }
        }
    }

    let has_valid_default = config_file_exists && config.use_as_default;

    TauriLaunchStatePayload {
        config,
        config_file_exists,
        has_valid_default,
        platform: current_platform_tag().to_string(),
        workspace_dir: workspace_dir.to_string_lossy().to_string(),
        vault_dir: vault_dir.to_string_lossy().to_string(),
        config_file_path: config_path.to_string_lossy().to_string(),
    }
}

pub fn sanitize_config_for_platform(mut config: TauriLaunchConfig) -> TauriLaunchConfig {
    let mode = config.window_mode.trim().to_lowercase();
    config.window_mode = match mode.as_str() {
        "fullscreen" => "fullscreen".to_string(),
        "borderless" => {
            if cfg!(target_os = "macos") {
                "windowed".to_string()
            } else {
                "borderless".to_string()
            }
        }
        _ => "windowed".to_string(),
    };
    let theme = config.theme_mode.trim().to_lowercase();
    config.theme_mode = if theme == "light" {
        "light".to_string()
    } else {
        "dark".to_string()
    };
    config.additional_params = config.additional_params.trim().to_string();
    config
}

pub fn is_dev_console_unlocked(config: &TauriLaunchConfig) -> bool {
    config.additional_params_enabled && has_dev_param_flag(&config.additional_params)
}

pub fn save_launch_config(
    app: &AppHandle,
    config: TauriLaunchConfig,
) -> Result<TauriLaunchStatePayload, String> {
    ensure_storage_directories(app)?;
    let sanitized = sanitize_config_for_platform(config);
    let config_path = resolve_config_file_path(app);
    let serialized = serde_json::to_string_pretty(&sanitized)
        .map_err(|e| format!("Failed to serialize launch config: {}", e))?;
    fs::write(&config_path, serialized)
        .map_err(|e| format!("Failed to write {:?}: {}", config_path, e))?;
    Ok(load_launch_state(app))
}

pub fn delete_launch_config(app: &AppHandle) -> Result<TauriLaunchStatePayload, String> {
    let config_path = resolve_config_file_path(app);
    if config_path.exists() {
        fs::remove_file(&config_path)
            .map_err(|e| format!("Failed to remove {:?}: {}", config_path, e))?;
    }
    Ok(load_launch_state(app))
}
