use crate::config_store::{delete_launch_config, is_dev_console_unlocked, load_launch_state};
use crate::window_manager::{launch_main_window_with_config, open_configurator_window};
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

const TRAY_ICON_MACOS_RGBA: &[u8] = include_bytes!("../icons/tray-icon-macos-64x64.rgba");
const TRAY_ICON_WIN_RGBA: &[u8] = include_bytes!("../icons/tray-icon-win-64x64.rgba");

pub struct TrayMenuState {
    pub launch_item: MenuItem<Wry>,
    pub devtools_item: MenuItem<Wry>,
    pub lock_1: CheckMenuItem<Wry>,
    pub lock_2: CheckMenuItem<Wry>,
    pub lock_3: CheckMenuItem<Wry>,
    pub lock_guard: Mutex<()>,
}

pub fn sync_tray_launch_enabled(app: &AppHandle, enabled: bool) {
    if let Some(tray_state) = app.try_state::<TrayMenuState>() {
        let _ = tray_state.launch_item.set_enabled(enabled);
    }
}

pub fn sync_tray_devtools_enabled(app: &AppHandle, enabled: bool) {
    if let Some(tray_state) = app.try_state::<TrayMenuState>() {
        let _ = tray_state.devtools_item.set_enabled(enabled);
        let _ = tray_state.devtools_item.set_text(if enabled {
            "Open Developer Console"
        } else {
            "Developer Console (Locked)"
        });
    }
}

pub fn setup_system_tray(app: &AppHandle) -> tauri::Result<()> {
    let initial_state = load_launch_state(app);
    let dev_unlocked = is_dev_console_unlocked(&initial_state.config);

    let launch_item = MenuItem::with_id(
        app,
        "tray_launch",
        "Launch",
        initial_state.has_valid_default,
        None::<&str>,
    )?;
    let configurator_item = MenuItem::with_id(
        app,
        "tray_configurator",
        "Configurator...",
        true,
        None::<&str>,
    )?;
    let devtools_item = MenuItem::with_id(
        app,
        "tray_devtools",
        if dev_unlocked {
            "Open Developer Console"
        } else {
            "Developer Console (Locked)"
        },
        dev_unlocked,
        None::<&str>,
    )?;

    let lock_1 = CheckMenuItem::with_id(
        app,
        "restore_lock_1",
        "#1 Unlock Safety Latch A",
        true,
        false,
        None::<&str>,
    )?;
    let lock_2 = CheckMenuItem::with_id(
        app,
        "restore_lock_2",
        "#2 Unlock Safety Latch B",
        true,
        false,
        None::<&str>,
    )?;
    let lock_3 = CheckMenuItem::with_id(
        app,
        "restore_lock_3",
        "#3 Unlock Safety Latch C (Execute Reset)",
        true,
        false,
        None::<&str>,
    )?;

    let restore_submenu = Submenu::with_items(
        app,
        "Restore to Default (Check All 3)",
        true,
        &[&lock_1, &lock_2, &lock_3],
    )?;

    let sep_1 = PredefinedMenuItem::separator(app)?;
    let sep_2 = PredefinedMenuItem::separator(app)?;
    let quit_item =
        MenuItem::with_id(app, "tray_quit", "Quit Rocket Companion", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &launch_item,
            &configurator_item,
            &devtools_item,
            &sep_1,
            &restore_submenu,
            &sep_2,
            &quit_item,
        ],
    )?;

    app.manage(TrayMenuState {
        launch_item,
        devtools_item,
        lock_1,
        lock_2,
        lock_3,
        lock_guard: Mutex::new(()),
    });

    let is_macos = cfg!(target_os = "macos");
    let icon_bytes = if is_macos {
        TRAY_ICON_MACOS_RGBA
    } else {
        TRAY_ICON_WIN_RGBA
    };
    let tray_image = Image::new(icon_bytes, 64, 64);

    TrayIconBuilder::with_id("rc-crossbar-tray")
        .icon(tray_image)
        .icon_as_template(is_macos)
        .tooltip("Rocket Companion")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app_handle, event| {
            handle_tray_menu_event(app_handle, event.id().as_ref());
        })
        .build(app)?;

    Ok(())
}

fn open_inspector_devtools_for_active_window(app: &AppHandle) {
    if let Some(main_win) = app.get_webview_window("main") {
        if main_win.is_visible().unwrap_or(false) {
            main_win.open_devtools();
            return;
        }
    }
    if let Some(cfg_win) = app.get_webview_window("configurator") {
        if cfg_win.is_visible().unwrap_or(false) {
            cfg_win.open_devtools();
            return;
        }
    }
    if let Some(main_win) = app.get_webview_window("main") {
        main_win.open_devtools();
    }
}

fn handle_tray_menu_event(app: &AppHandle, menu_id: &str) {
    match menu_id {
        "tray_launch" => {
            let state = load_launch_state(app);
            if state.has_valid_default {
                let _ = launch_main_window_with_config(app, &state.config);
            } else {
                sync_tray_launch_enabled(app, false);
                let _ = open_configurator_window(app);
            }
        }
        "tray_configurator" => {
            let _ = open_configurator_window(app);
        }
        "tray_devtools" => {
            let state = load_launch_state(app);
            if is_dev_console_unlocked(&state.config) {
                open_inspector_devtools_for_active_window(app);
            } else {
                sync_tray_devtools_enabled(app, false);
            }
        }
        "restore_lock_1" | "restore_lock_2" | "restore_lock_3" => {
            if let Some(tray_state) = app.try_state::<TrayMenuState>() {
                let _guard = tray_state.lock_guard.lock().ok();
                let c1 = tray_state.lock_1.is_checked().unwrap_or(false);
                let c2 = tray_state.lock_2.is_checked().unwrap_or(false);
                let c3 = tray_state.lock_3.is_checked().unwrap_or(false);
                if c1 && c2 && c3 {
                    let _ = tray_state.lock_1.set_checked(false);
                    let _ = tray_state.lock_2.set_checked(false);
                    let _ = tray_state.lock_3.set_checked(false);
                    let _ = delete_launch_config(app);
                    sync_tray_launch_enabled(app, false);
                    sync_tray_devtools_enabled(app, false);
                    if let Some(main_win) = app.get_webview_window("main") {
                        let _ = main_win.eval(
                            "try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}",
                        );
                        let _ = main_win.hide();
                    }
                    let _ = open_configurator_window(app);
                }
            }
        }
        "tray_quit" => {
            app.exit(0);
        }
        _ => {}
    }
}
