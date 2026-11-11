use crate::config_store::{
    delete_launch_config, ensure_storage_directories, has_dev_param_flag, is_dev_console_unlocked,
    load_launch_state, resolve_vault_dir, resolve_workspace_dir, sanitize_config_for_platform,
    save_launch_config, TauriLaunchConfig, TauriLaunchStatePayload,
};
use crate::tray_manager::{sync_tray_devtools_enabled, sync_tray_launch_enabled};
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Manager, PhysicalPosition, Position, WebviewWindow};

pub fn normalize_query_string(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with('?') {
        trimmed.to_string()
    } else if let Some(stripped) = trimmed.strip_prefix('&') {
        if stripped.is_empty() {
            String::new()
        } else {
            format!("?{}", stripped)
        }
    } else {
        format!("?{}", trimmed)
    }
}

pub fn apply_window_mode_to_webview(win: &WebviewWindow, requested_mode: &str) {
    let mode = if cfg!(target_os = "macos") && requested_mode.eq_ignore_ascii_case("borderless") {
        "windowed"
    } else {
        requested_mode
    };

    match mode {
        "fullscreen" => {
            let _ = win.set_decorations(true);
            let _ = win.set_fullscreen(true);
        }
        "borderless" => {
            let _ = win.set_fullscreen(false);
            let _ = win.set_decorations(false);
            // Offset slightly toward the top-left so Windows DWM does not misclassify
            // a borderless window as exclusive fullscreen or clip the shadow frame.
            let _ = win.set_position(Position::Physical(PhysicalPosition::new(16, 16)));
        }
        _ => {
            let _ = win.set_fullscreen(false);
            let _ = win.set_decorations(true);
            let _ = win.center();
        }
    }
}

pub fn launch_main_window_with_config(
    app: &AppHandle,
    raw_config: &TauriLaunchConfig,
) -> Result<(), String> {
    let config = sanitize_config_for_platform(raw_config.clone());
    let main_win = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window handle not found".to_string())?;

    apply_window_mode_to_webview(&main_win, &config.window_mode);

    let effective_params = if config.additional_params_enabled {
        config.additional_params.as_str()
    } else {
        ""
    };
    let normalized_query = normalize_query_string(effective_params);
    let query_json =
        serde_json::to_string(&normalized_query).unwrap_or_else(|_| "\"\"".to_string());
    let theme_json =
        serde_json::to_string(&config.theme_mode).unwrap_or_else(|_| "\"dark\"".to_string());
    let has_clean = normalized_query.contains("clean=1")
        || normalized_query.contains("clean=true")
        || normalized_query.contains("cleanStartup=1")
        || normalized_query.contains("clean_startup=1");

    let js_script = format!(
        r#"(function() {{
            try {{
                var targetTheme = {theme_json};
                localStorage.setItem("rc_theme", targetTheme);
                document.documentElement.classList.toggle("dark", targetTheme === "dark");
                document.documentElement.classList.toggle("light", targetTheme === "light");
                document.documentElement.dataset.theme = targetTheme;
            }} catch (_) {{}}
            var targetSearch = {query_json};
            var currentSearch = window.location.search || "";
            if (currentSearch !== targetSearch) {{
                window.location.search = targetSearch;
            }} else if ({has_clean}) {{
                window.location.reload();
            }}
        }})();"#,
        theme_json = theme_json,
        query_json = query_json,
        has_clean = if has_clean { "true" } else { "false" }
    );
    let _ = main_win.eval(&js_script);

    if let Some(cfg_win) = app.get_webview_window("configurator") {
        let _ = cfg_win.hide();
    }

    let _ = main_win.show();
    let _ = main_win.set_focus();
    Ok(())
}

pub fn open_configurator_window(app: &AppHandle) -> Result<(), String> {
    let cfg_win = app
        .get_webview_window("configurator")
        .ok_or_else(|| "Configurator window handle not found".to_string())?;
    let _ = cfg_win.eval("window.dispatchEvent(new CustomEvent('rc-tauri-config-updated'));");
    let _ = cfg_win.show();
    let _ = cfg_win.set_focus();
    Ok(())
}

fn open_directory_in_os_shell(dir: &Path) -> Result<String, String> {
    let path_str = dir.to_string_lossy().to_string();
    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(dir).spawn();
    #[cfg(target_os = "windows")]
    let status = Command::new("explorer").arg(dir).spawn();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let status = Command::new("xdg-open").arg(dir).spawn();

    status
        .map(|_| path_str)
        .map_err(|e| format!("Failed to open directory {:?}: {}", dir, e))
}

#[tauri::command]
pub fn tauri_get_launch_state(app: AppHandle) -> TauriLaunchStatePayload {
    let state = load_launch_state(&app);
    sync_tray_launch_enabled(&app, state.has_valid_default);
    sync_tray_devtools_enabled(&app, is_dev_console_unlocked(&state.config));
    state
}

#[tauri::command]
pub fn tauri_save_launch_config(
    app: AppHandle,
    config: TauriLaunchConfig,
) -> Result<TauriLaunchStatePayload, String> {
    let state = save_launch_config(&app, config)?;
    sync_tray_launch_enabled(&app, state.has_valid_default);
    sync_tray_devtools_enabled(&app, is_dev_console_unlocked(&state.config));
    Ok(state)
}

#[tauri::command]
pub fn tauri_launch_game(
    app: AppHandle,
    config: TauriLaunchConfig,
) -> Result<TauriLaunchStatePayload, String> {
    let state = save_launch_config(&app, config)?;
    sync_tray_launch_enabled(&app, state.has_valid_default);
    sync_tray_devtools_enabled(&app, is_dev_console_unlocked(&state.config));
    launch_main_window_with_config(&app, &state.config)?;
    Ok(state)
}

#[tauri::command]
pub fn tauri_reset_launch_config(app: AppHandle) -> Result<TauriLaunchStatePayload, String> {
    let state = delete_launch_config(&app)?;
    sync_tray_launch_enabled(&app, false);
    sync_tray_devtools_enabled(&app, false);
    Ok(state)
}

#[tauri::command]
pub fn tauri_open_configurator(app: AppHandle) -> Result<(), String> {
    open_configurator_window(&app)
}

#[tauri::command]
pub fn tauri_set_display_window_mode(
    app: AppHandle,
    window_mode: String,
) -> Result<String, String> {
    let mut state = load_launch_state(&app);
    state.config.window_mode = window_mode;
    let sanitized = sanitize_config_for_platform(state.config.clone());
    if state.config_file_exists {
        let _ = save_launch_config(&app, sanitized.clone());
    }
    if let Some(main_win) = app.get_webview_window("main") {
        apply_window_mode_to_webview(&main_win, &sanitized.window_mode);
    }
    Ok(sanitized.window_mode)
}

#[tauri::command]
pub fn tauri_open_workspace_folder(app: AppHandle) -> Result<String, String> {
    ensure_storage_directories(&app)?;
    let dir = resolve_workspace_dir(&app);
    open_directory_in_os_shell(&dir)
}

#[tauri::command]
pub fn tauri_open_vault_folder(
    app: AppHandle,
    additional_params: String,
) -> Result<String, String> {
    let state = load_launch_state(&app);
    if !has_dev_param_flag(&additional_params) && !is_dev_console_unlocked(&state.config) {
        return Err("Private vault access requires active developer parameters.".to_string());
    }
    ensure_storage_directories(&app)?;
    let dir = resolve_vault_dir(&app);
    open_directory_in_os_shell(&dir)
}
