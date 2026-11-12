pub mod config_store;
pub mod tray_manager;
pub mod window_manager;

use config_store::load_launch_state;
use tauri::{Manager, WindowEvent};
use tray_manager::setup_system_tray;
use window_manager::{
    launch_main_window_with_config, open_configurator_window, tauri_get_launch_state,
    tauri_launch_game, tauri_open_configurator, tauri_open_vault_folder,
    tauri_open_workspace_folder, tauri_reset_launch_config, tauri_save_launch_config,
    tauri_set_display_window_mode,
};

fn should_start_tray_only_from_env() -> bool {
    if std::env::var("RC_TRAY_ONLY")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
    {
        return true;
    }
    std::env::args().any(|arg| arg == "--tray-only" || arg == "--silent-tray")
}

fn should_force_configurator_from_args() -> bool {
    std::env::args().any(|arg| arg == "--configurator" || arg == "--configure")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            tauri_get_launch_state,
            tauri_save_launch_config,
            tauri_launch_game,
            tauri_reset_launch_config,
            tauri_open_configurator,
            tauri_set_display_window_mode,
            tauri_open_workspace_folder,
            tauri_open_vault_folder,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "main" || label == "configurator" {
                    // Close-to-tray: hide window instead of terminating the process
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle();
            setup_system_tray(handle)?;

            let state = load_launch_state(handle);
            let tray_only = should_start_tray_only_from_env() || state.config.tray_only_mode;
            let force_cfg = should_force_configurator_from_args();

            if tray_only && !force_cfg {
                log::info!(
                    "[RocketCompanion] Started in silent tray-only mode. Use the Crossbar tray icon to Launch or open Configurator."
                );
            } else if !force_cfg
                && state.has_valid_default
                && !state.config.launch_configurator_every_time
            {
                let _ = launch_main_window_with_config(handle, &state.config);
            } else {
                if let Some(cfg_win) = handle.get_webview_window("configurator") {
                    let _ = cfg_win.center();
                }
                let _ = open_configurator_window(handle);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
