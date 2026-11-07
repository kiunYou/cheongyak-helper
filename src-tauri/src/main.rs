// 릴리스 빌드에서 콘솔 창이 뜨지 않게 합니다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod crypto;
mod dpapi;
mod error;
mod profile;
mod recovery;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(commands::AppState::new(profile::Store::new(dir)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_profiles,
            commands::current_profile,
            commands::create_profile,
            commands::unlock,
            commands::lock,
            commands::change_password,
            commands::recovery_request,
            commands::recovery_apply,
            commands::load_personal_data,
            commands::save_personal_data,
            commands::get_settings,
            commands::set_settings,
            commands::prepare_update,
            commands::export_backup,
            commands::import_backup,
        ])
        .run(tauri::generate_context!())
        .expect("청약 도우미를 시작하지 못했습니다");
}
