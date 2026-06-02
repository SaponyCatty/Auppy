mod commands;
mod db;
mod errors;
mod folders;
mod models;
mod python;
mod runner;
mod safety;
mod settings;
mod workspaces;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = db::initialize(app.handle())?;
            app.manage(state);

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = commands::run_startup_scripts(app_handle).await {
                    eprintln!("Could not run startup scripts: {error}");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_scripts,
            commands::list_workspaces,
            commands::create_workspace,
            commands::delete_workspace,
            commands::list_folders,
            commands::create_folder,
            commands::delete_folder,
            commands::rename_folder,
            commands::get_script,
            commands::create_script,
            commands::update_script,
            commands::delete_script,
            commands::bulk_delete_scripts,
            commands::bulk_update_scripts,
            commands::duplicate_script,
            commands::run_script,
            commands::cancel_script,
            commands::list_runs,
            commands::list_script_versions,
            commands::restore_script_version,
            commands::export_library,
            commands::export_selected_library,
            commands::export_library_to_path,
            commands::export_selected_library_to_path,
            commands::import_library,
            commands::import_library_from_path,
            commands::save_setting,
            commands::get_setting,
            commands::detect_python_interpreters,
            commands::get_default_python_interpreter
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
