use std::collections::HashSet;
use std::fs;
use std::time::Instant;

use chrono::Utc;
use rusqlite::{params, OptionalExtension, Row};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::db::AppState;
use crate::errors::{AppError, AppResult};
use crate::models::{
    BackupScript, BulkUpdateScriptsInput, CreateFolderInput, CreateScriptInput,
    CreateWorkspaceInput, DeleteFolderInput, DeleteWorkspaceInput, ExportSelectedInput,
    FolderRecord, ImportLibraryInput, ImportLibraryResult, LibraryBackup, PythonInterpreter,
    RenameFolderInput, ScriptDetail, ScriptRecord, ScriptRun, ScriptVersion, UpdateScriptInput,
    WorkspaceRecord, DEFAULT_OUTPUT_LIMIT_BYTES, DEFAULT_TIMEOUT_SECONDS,
};
use crate::runner;
use crate::safety;

const MIN_TIMEOUT_SECONDS: i64 = 1;
const MAX_TIMEOUT_SECONDS: i64 = 3_600;
const MIN_OUTPUT_LIMIT_BYTES: i64 = 1_024;
const MAX_OUTPUT_LIMIT_BYTES: i64 = 1_048_576;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScriptOutputEvent {
    script_id: String,
    run_id: String,
    stream: String,
    content: String,
}

#[tauri::command]
pub fn list_scripts(state: State<'_, AppState>) -> AppResult<Vec<ScriptRecord>> {
    list_scripts_from_db(state.inner())
}

#[tauri::command]
pub fn list_workspaces(state: State<'_, AppState>) -> AppResult<Vec<WorkspaceRecord>> {
    crate::workspaces::list(state.inner())
}

#[tauri::command]
pub fn create_workspace(
    state: State<'_, AppState>,
    input: CreateWorkspaceInput,
) -> AppResult<WorkspaceRecord> {
    crate::workspaces::create(state.inner(), input)
}

#[tauri::command]
pub fn delete_workspace(
    state: State<'_, AppState>,
    input: DeleteWorkspaceInput,
) -> AppResult<usize> {
    delete_workspace_by_name(state.inner(), &input.name)
}

#[tauri::command]
pub fn list_folders(state: State<'_, AppState>) -> AppResult<Vec<FolderRecord>> {
    crate::folders::list(state.inner())
}

#[tauri::command]
pub fn create_folder(
    state: State<'_, AppState>,
    input: CreateFolderInput,
) -> AppResult<FolderRecord> {
    crate::folders::create(state.inner(), input)
}

#[tauri::command]
pub fn delete_folder(state: State<'_, AppState>, input: DeleteFolderInput) -> AppResult<usize> {
    delete_folder_by_name(state.inner(), &input.workspace, &input.name)
}

#[tauri::command]
pub fn rename_folder(
    state: State<'_, AppState>,
    input: RenameFolderInput,
) -> AppResult<FolderRecord> {
    crate::folders::rename(state.inner(), input)
}

#[tauri::command]
pub fn get_script(state: State<'_, AppState>, script_id: String) -> AppResult<ScriptDetail> {
    let script = get_script_by_id(state.inner(), &script_id)?;
    let content = fs::read_to_string(&script.file_path)?;

    Ok(ScriptDetail {
        id: script.id,
        name: script.name,
        workspace: script.workspace,
        file_path: script.file_path,
        interpreter_path: script.interpreter_path,
        working_directory: script.working_directory,
        run_on_app_start: script.run_on_app_start,
        is_enabled: script.is_enabled,
        timeout_seconds: script.timeout_seconds,
        output_limit_bytes: script.output_limit_bytes,
        is_trusted: script.is_trusted,
        category: script.category,
        tags: script.tags,
        is_favorite: script.is_favorite,
        safety_level: script.safety_level,
        safety_warnings: script.safety_warnings,
        created_at: script.created_at,
        updated_at: script.updated_at,
        content,
    })
}

#[tauri::command]
pub fn create_script(
    state: State<'_, AppState>,
    input: CreateScriptInput,
) -> AppResult<ScriptRecord> {
    let interpreter_path = validate_script_input(
        &input.name,
        &input.interpreter_path,
        input.timeout_seconds,
        input.output_limit_bytes,
    )?;

    let id = Uuid::new_v4().to_string();
    let now = now();
    let script_dir = state.script_dir(&id);
    let file_path = state.script_file(&id);
    let workspace = crate::workspaces::normalize_name(&input.workspace)?;
    crate::workspaces::create_named(state.inner(), &workspace)?;
    let working_directory = normalize_optional(input.working_directory);
    let category = normalize_optional(input.category);
    let tags = normalize_tags(input.tags);
    let safety_report = safety::scan_script(&input.content);

    fs::create_dir_all(&script_dir)?;
    fs::write(&file_path, &input.content)?;

    let script = ScriptRecord {
        id,
        name: input.name.trim().to_string(),
        workspace,
        file_path: file_path.to_string_lossy().to_string(),
        interpreter_path,
        working_directory,
        run_on_app_start: input.run_on_app_start,
        is_enabled: input.is_enabled,
        timeout_seconds: normalize_timeout(input.timeout_seconds),
        output_limit_bytes: normalize_output_limit(input.output_limit_bytes),
        is_trusted: input.is_trusted,
        category,
        tags,
        is_favorite: input.is_favorite,
        safety_level: safety_report.level,
        safety_warnings: safety_report.warnings,
        created_at: now.clone(),
        updated_at: now,
    };

    {
        let conn = state.connection()?;
        conn.execute(
            "INSERT INTO scripts (
              id, name, workspace, file_path, interpreter_path, working_directory,
              run_on_app_start, is_enabled, timeout_seconds, output_limit_bytes,
              is_trusted, category, tags, is_favorite, safety_level, safety_warnings,
              created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                script.id,
                script.name,
                script.workspace,
                script.file_path,
                script.interpreter_path,
                script.working_directory,
                bool_to_i64(script.run_on_app_start),
                bool_to_i64(script.is_enabled),
                script.timeout_seconds,
                script.output_limit_bytes,
                bool_to_i64(script.is_trusted),
                script.category,
                tags_to_json(&script.tags)?,
                bool_to_i64(script.is_favorite),
                script.safety_level,
                warnings_to_json(&script.safety_warnings)?,
                script.created_at,
                script.updated_at
            ],
        )?;
    }

    save_version_snapshot(state.inner(), &script, &input.content, "Created")?;

    Ok(script)
}

#[tauri::command]
pub fn update_script(
    state: State<'_, AppState>,
    script_id: String,
    input: UpdateScriptInput,
) -> AppResult<ScriptRecord> {
    let interpreter_path = validate_script_input(
        &input.name,
        &input.interpreter_path,
        input.timeout_seconds,
        input.output_limit_bytes,
    )?;

    let existing = get_script_by_id(state.inner(), &script_id)?;
    let previous_content = fs::read_to_string(&existing.file_path)?;
    let name = input.name.trim().to_string();
    let workspace = crate::workspaces::normalize_name(&input.workspace)?;
    crate::workspaces::create_named(state.inner(), &workspace)?;
    let working_directory = normalize_optional(input.working_directory);
    let category = normalize_optional(input.category);
    let tags = normalize_tags(input.tags);
    let timeout_seconds = normalize_timeout(input.timeout_seconds);
    let output_limit_bytes = normalize_output_limit(input.output_limit_bytes);
    let has_changes = previous_content != input.content
        || existing.name != name
        || existing.workspace != workspace
        || existing.interpreter_path != interpreter_path
        || existing.working_directory != working_directory
        || existing.run_on_app_start != input.run_on_app_start
        || existing.is_enabled != input.is_enabled
        || existing.timeout_seconds != timeout_seconds
        || existing.output_limit_bytes != output_limit_bytes
        || existing.is_trusted != input.is_trusted
        || existing.category != category
        || existing.tags != tags
        || existing.is_favorite != input.is_favorite;

    if !has_changes {
        return Ok(existing);
    }

    save_version_snapshot(state.inner(), &existing, &previous_content, "Before update")?;

    let safety_report = safety::scan_script(&input.content);
    fs::write(&existing.file_path, input.content)?;

    let updated_at = now();
    let script = ScriptRecord {
        id: existing.id,
        name,
        workspace,
        file_path: existing.file_path,
        interpreter_path,
        working_directory,
        run_on_app_start: input.run_on_app_start,
        is_enabled: input.is_enabled,
        timeout_seconds,
        output_limit_bytes,
        is_trusted: input.is_trusted,
        category,
        tags,
        is_favorite: input.is_favorite,
        safety_level: safety_report.level,
        safety_warnings: safety_report.warnings,
        created_at: existing.created_at,
        updated_at,
    };

    let conn = state.connection()?;
    conn.execute(
        "UPDATE scripts
         SET name = ?2,
             workspace = ?3,
             interpreter_path = ?4,
             working_directory = ?5,
             run_on_app_start = ?6,
             is_enabled = ?7,
             timeout_seconds = ?8,
             output_limit_bytes = ?9,
             is_trusted = ?10,
             category = ?11,
             tags = ?12,
             is_favorite = ?13,
             safety_level = ?14,
             safety_warnings = ?15,
             updated_at = ?16
         WHERE id = ?1",
        params![
            script.id,
            script.name,
            script.workspace,
            script.interpreter_path,
            script.working_directory,
            bool_to_i64(script.run_on_app_start),
            bool_to_i64(script.is_enabled),
            script.timeout_seconds,
            script.output_limit_bytes,
            bool_to_i64(script.is_trusted),
            script.category,
            tags_to_json(&script.tags)?,
            bool_to_i64(script.is_favorite),
            script.safety_level,
            warnings_to_json(&script.safety_warnings)?,
            script.updated_at
        ],
    )?;

    Ok(script)
}

#[tauri::command]
pub fn delete_script(state: State<'_, AppState>, script_id: String) -> AppResult<()> {
    get_script_by_id(state.inner(), &script_id)?;
    delete_scripts_by_ids(
        state.inner(),
        &[script_id],
        "Stop the running script before deleting it",
    )?;
    Ok(())
}

#[tauri::command]
pub fn bulk_delete_scripts(
    state: State<'_, AppState>,
    script_ids: Vec<String>,
) -> AppResult<usize> {
    delete_scripts_by_ids(
        state.inner(),
        &script_ids,
        "Stop running scripts before deleting selected commands",
    )
}

#[tauri::command]
pub fn bulk_update_scripts(
    state: State<'_, AppState>,
    input: BulkUpdateScriptsInput,
) -> AppResult<usize> {
    let update_workspace = input.workspace.is_some();
    let update_category = input.category.is_some();
    let update_tags = input.tags.is_some();

    if !update_workspace && !update_category && !update_tags {
        return Ok(0);
    }

    let workspace = input
        .workspace
        .map(|value| crate::workspaces::normalize_name(&value))
        .transpose()?;
    if let Some(workspace) = &workspace {
        crate::workspaces::create_named(state.inner(), workspace)?;
    }
    let category = normalize_optional(input.category);
    let tags_json = input
        .tags
        .map(normalize_tags)
        .map(|tags| tags_to_json(&tags))
        .transpose()?;
    let updated_at = now();
    let mut updated = 0;

    for script_id in input.script_ids {
        let script = get_script_by_id(state.inner(), &script_id)?;
        let content = fs::read_to_string(&script.file_path)?;
        save_version_snapshot(state.inner(), &script, &content, "Before bulk update")?;

        let conn = state.connection()?;
        conn.execute(
            "UPDATE scripts
             SET workspace = CASE WHEN ?2 THEN ?3 ELSE workspace END,
                 category = CASE WHEN ?4 THEN ?5 ELSE category END,
                 tags = CASE WHEN ?6 THEN ?7 ELSE tags END,
                 updated_at = ?8
             WHERE id = ?1",
            params![
                script_id,
                bool_to_i64(update_workspace),
                workspace,
                bool_to_i64(update_category),
                category,
                bool_to_i64(update_tags),
                tags_json,
                updated_at
            ],
        )?;
        updated += 1;
    }

    Ok(updated)
}

#[tauri::command]
pub async fn run_script(
    app: AppHandle,
    state: State<'_, AppState>,
    script_id: String,
) -> AppResult<ScriptRun> {
    let script = get_script_by_id(state.inner(), &script_id)?;
    if !script.is_enabled {
        return Err(AppError::message("Script is disabled"));
    }

    run_script_record(state.inner(), script, Some(app)).await
}

#[tauri::command]
pub fn cancel_script(state: State<'_, AppState>, script_id: String) -> AppResult<bool> {
    Ok(state.cancel_running(&script_id)?.is_some())
}

#[tauri::command]
pub fn list_runs(state: State<'_, AppState>, script_id: String) -> AppResult<Vec<ScriptRun>> {
    let conn = state.connection()?;
    let mut statement = conn.prepare(
        "SELECT id, script_id, started_at, finished_at, duration_ms, status, exit_code,
                stdout, stderr, error_message, stdout_truncated, stderr_truncated
         FROM script_runs
         WHERE script_id = ?1
         ORDER BY started_at DESC
         LIMIT 50",
    )?;

    let runs = statement
        .query_map(params![script_id], run_from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(runs)
}

#[tauri::command]
pub fn list_script_versions(
    state: State<'_, AppState>,
    script_id: String,
) -> AppResult<Vec<ScriptVersion>> {
    let conn = state.connection()?;
    let mut statement = conn.prepare(
        "SELECT id, script_id, name, workspace, content, interpreter_path, working_directory,
                run_on_app_start, is_enabled, timeout_seconds, output_limit_bytes,
                is_trusted, category, tags, is_favorite, created_at, reason
         FROM script_versions
         WHERE script_id = ?1
         ORDER BY created_at DESC
         LIMIT 30",
    )?;

    let versions = statement
        .query_map(params![script_id], version_from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(versions)
}

#[tauri::command]
pub fn restore_script_version(
    state: State<'_, AppState>,
    script_id: String,
    version_id: String,
) -> AppResult<ScriptRecord> {
    let existing = get_script_by_id(state.inner(), &script_id)?;
    let current_content = fs::read_to_string(&existing.file_path)?;
    let version = get_version_by_id(state.inner(), &script_id, &version_id)?;

    save_version_snapshot(state.inner(), &existing, &current_content, "Before restore")?;

    let safety_report = safety::scan_script(&version.content);
    fs::write(&existing.file_path, &version.content)?;

    let updated_at = now();
    let script = ScriptRecord {
        id: existing.id,
        name: version.name,
        workspace: version.workspace,
        file_path: existing.file_path,
        interpreter_path: version.interpreter_path,
        working_directory: version.working_directory,
        run_on_app_start: version.run_on_app_start,
        is_enabled: version.is_enabled,
        timeout_seconds: version.timeout_seconds,
        output_limit_bytes: version.output_limit_bytes,
        is_trusted: version.is_trusted,
        category: version.category,
        tags: version.tags,
        is_favorite: version.is_favorite,
        safety_level: safety_report.level,
        safety_warnings: safety_report.warnings,
        created_at: existing.created_at,
        updated_at,
    };

    let conn = state.connection()?;
    conn.execute(
        "UPDATE scripts
         SET name = ?2,
             workspace = ?3,
             interpreter_path = ?4,
             working_directory = ?5,
             run_on_app_start = ?6,
             is_enabled = ?7,
             timeout_seconds = ?8,
             output_limit_bytes = ?9,
             is_trusted = ?10,
             category = ?11,
             tags = ?12,
             is_favorite = ?13,
             safety_level = ?14,
             safety_warnings = ?15,
             updated_at = ?16
         WHERE id = ?1",
        params![
            script.id,
            script.name,
            script.workspace,
            script.interpreter_path,
            script.working_directory,
            bool_to_i64(script.run_on_app_start),
            bool_to_i64(script.is_enabled),
            script.timeout_seconds,
            script.output_limit_bytes,
            bool_to_i64(script.is_trusted),
            script.category,
            tags_to_json(&script.tags)?,
            bool_to_i64(script.is_favorite),
            script.safety_level,
            warnings_to_json(&script.safety_warnings)?,
            script.updated_at
        ],
    )?;

    Ok(script)
}

#[tauri::command]
pub fn duplicate_script(state: State<'_, AppState>, script_id: String) -> AppResult<ScriptRecord> {
    duplicate_script_record(state.inner(), &script_id)
}

fn duplicate_script_record(state: &AppState, script_id: &str) -> AppResult<ScriptRecord> {
    let existing = get_script_by_id(state, script_id)?;
    let content = fs::read_to_string(&existing.file_path)?;
    let backup = BackupScript {
        name: format!("{} Copy", existing.name),
        content,
        interpreter_path: existing.interpreter_path,
        working_directory: existing.working_directory,
        workspace: existing.workspace,
        run_on_app_start: false,
        is_enabled: existing.is_enabled,
        timeout_seconds: existing.timeout_seconds,
        output_limit_bytes: existing.output_limit_bytes,
        is_trusted: existing.is_trusted,
        category: existing.category,
        tags: existing.tags,
        is_favorite: false,
    };

    insert_script_from_backup(state, backup, "Duplicated")
}

#[tauri::command]
pub fn export_library(state: State<'_, AppState>) -> AppResult<String> {
    export_library_json(state.inner(), None)
}

#[tauri::command]
pub fn export_selected_library(
    state: State<'_, AppState>,
    input: ExportSelectedInput,
) -> AppResult<String> {
    export_library_json(state.inner(), Some(&input.script_ids))
}

#[tauri::command]
pub fn export_library_to_path(state: State<'_, AppState>, path: String) -> AppResult<()> {
    let json = export_library_json(state.inner(), None)?;
    fs::write(path, json)?;

    Ok(())
}

#[tauri::command]
pub fn export_selected_library_to_path(
    state: State<'_, AppState>,
    input: ExportSelectedInput,
    path: String,
) -> AppResult<()> {
    let json = export_library_json(state.inner(), Some(&input.script_ids))?;
    fs::write(path, json)?;

    Ok(())
}

fn export_library_json(state: &AppState, script_ids: Option<&[String]>) -> AppResult<String> {
    let mut scripts = list_scripts_from_db(state)?;
    if let Some(script_ids) = script_ids {
        let selected = script_ids.iter().collect::<HashSet<_>>();
        scripts.retain(|script| selected.contains(&script.id));
    }

    let mut backup_scripts = Vec::new();

    for script in scripts {
        let content = fs::read_to_string(&script.file_path)?;
        backup_scripts.push(BackupScript {
            name: script.name,
            content,
            interpreter_path: script.interpreter_path,
            working_directory: script.working_directory,
            workspace: script.workspace,
            run_on_app_start: script.run_on_app_start,
            is_enabled: script.is_enabled,
            timeout_seconds: script.timeout_seconds,
            output_limit_bytes: script.output_limit_bytes,
            is_trusted: script.is_trusted,
            category: script.category,
            tags: script.tags,
            is_favorite: script.is_favorite,
        });
    }

    let backup = LibraryBackup {
        exported_at: now(),
        scripts: backup_scripts,
    };

    serde_json::to_string_pretty(&backup)
        .map_err(|error| AppError::message(format!("Could not export library: {error}")))
}

#[tauri::command]
pub fn import_library(
    state: State<'_, AppState>,
    input: ImportLibraryInput,
) -> AppResult<ImportLibraryResult> {
    import_library_json(state.inner(), &input.backup_json)
}

#[tauri::command]
pub fn import_library_from_path(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<ImportLibraryResult> {
    let backup_json = fs::read_to_string(path)?;
    import_library_json(state.inner(), &backup_json)
}

fn import_library_json(state: &AppState, backup_json: &str) -> AppResult<ImportLibraryResult> {
    let backup: LibraryBackup = serde_json::from_str(backup_json)
        .map_err(|error| AppError::message(format!("Could not read backup JSON: {error}")))?;

    let mut imported = 0;
    for script in backup.scripts {
        insert_script_from_backup(state, script, "Imported")?;
        imported += 1;
    }

    Ok(ImportLibraryResult { imported })
}

#[tauri::command]
pub fn save_setting(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    crate::settings::save(state.inner(), &key, value)
}

#[tauri::command]
pub fn get_setting(state: State<'_, AppState>, key: String) -> AppResult<Option<String>> {
    crate::settings::get(state.inner(), &key)
}

#[tauri::command]
pub fn detect_python_interpreters(state: State<'_, AppState>) -> AppResult<Vec<PythonInterpreter>> {
    crate::python::detect_interpreters(state.inner())
}

#[tauri::command]
pub fn get_default_python_interpreter(state: State<'_, AppState>) -> AppResult<String> {
    crate::python::default_interpreter(state.inner())
}

pub async fn run_startup_scripts(app: AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let scripts = list_startup_scripts(state.inner())?;

    for script in scripts {
        if let Err(error) = run_script_record(state.inner(), script, None).await {
            eprintln!("Startup script failed: {error}");
        }
    }

    Ok(())
}

async fn run_script_record(
    state: &AppState,
    script: ScriptRecord,
    app: Option<AppHandle>,
) -> AppResult<ScriptRun> {
    let run_id = Uuid::new_v4().to_string();
    let cancel_rx = state.register_running(&script.id, &run_id)?;
    let started_at = now();
    let started = Instant::now();

    {
        let conn = state.connection()?;
        conn.execute(
            "INSERT INTO script_runs (id, script_id, started_at, status)
             VALUES (?1, ?2, ?3, ?4)",
            params![run_id, script.id, started_at, "running"],
        )?;
    }

    let (output_tx, forwarder) = if let Some(app) = app {
        let (output_tx, mut output_rx) = mpsc::unbounded_channel::<runner::OutputChunk>();
        let script_id = script.id.clone();
        let event_run_id = run_id.clone();
        let forwarder = tokio::spawn(async move {
            while let Some(chunk) = output_rx.recv().await {
                let _ = app.emit(
                    "script-output",
                    ScriptOutputEvent {
                        script_id: script_id.clone(),
                        run_id: event_run_id.clone(),
                        stream: chunk.stream,
                        content: chunk.content,
                    },
                );
            }
        });
        (Some(output_tx), Some(forwarder))
    } else {
        (None, None)
    };

    let process_result = runner::run_python_script(&script, cancel_rx, output_tx).await;
    if let Some(forwarder) = forwarder {
        let _ = forwarder.await;
    }
    let duration_ms = started.elapsed().as_millis().min(i64::MAX as u128) as i64;
    let finished_at = now();
    state.clear_running(&script.id, &run_id)?;

    let run = ScriptRun {
        id: run_id,
        script_id: script.id,
        started_at,
        finished_at: Some(finished_at),
        duration_ms: Some(duration_ms),
        status: process_result.status,
        exit_code: process_result.exit_code,
        stdout: process_result.stdout,
        stderr: process_result.stderr,
        error_message: process_result.error_message,
        stdout_truncated: process_result.stdout_truncated,
        stderr_truncated: process_result.stderr_truncated,
    };

    let conn = state.connection()?;
    conn.execute(
        "UPDATE script_runs
         SET finished_at = ?2,
             duration_ms = ?3,
             status = ?4,
             exit_code = ?5,
             stdout = ?6,
             stderr = ?7,
             error_message = ?8,
             stdout_truncated = ?9,
             stderr_truncated = ?10
         WHERE id = ?1",
        params![
            run.id,
            run.finished_at,
            run.duration_ms,
            run.status,
            run.exit_code,
            run.stdout,
            run.stderr,
            run.error_message,
            bool_to_i64(run.stdout_truncated),
            bool_to_i64(run.stderr_truncated)
        ],
    )?;

    Ok(run)
}

fn list_scripts_from_db(state: &AppState) -> AppResult<Vec<ScriptRecord>> {
    let conn = state.connection()?;
    let mut statement = conn.prepare(
        "SELECT id, name, workspace, file_path, interpreter_path, working_directory,
                run_on_app_start, is_enabled, timeout_seconds, output_limit_bytes,
                is_trusted, category, tags, is_favorite, safety_level, safety_warnings,
                created_at, updated_at
         FROM scripts
         ORDER BY updated_at DESC",
    )?;

    let scripts = statement
        .query_map([], script_from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(scripts)
}

fn list_startup_scripts(state: &AppState) -> AppResult<Vec<ScriptRecord>> {
    let conn = state.connection()?;
    let mut statement = conn.prepare(
        "SELECT id, name, workspace, file_path, interpreter_path, working_directory,
                run_on_app_start, is_enabled, timeout_seconds, output_limit_bytes,
                is_trusted, category, tags, is_favorite, safety_level, safety_warnings,
                created_at, updated_at
         FROM scripts
         WHERE run_on_app_start = 1 AND is_enabled = 1
         ORDER BY updated_at DESC",
    )?;

    let scripts = statement
        .query_map([], script_from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(scripts)
}

fn get_script_by_id(state: &AppState, script_id: &str) -> AppResult<ScriptRecord> {
    let conn = state.connection()?;
    let script = conn
        .query_row(
            "SELECT id, name, workspace, file_path, interpreter_path, working_directory,
                    run_on_app_start, is_enabled, timeout_seconds, output_limit_bytes,
                    is_trusted, category, tags, is_favorite, safety_level, safety_warnings,
                    created_at, updated_at
             FROM scripts
             WHERE id = ?1",
            params![script_id],
            script_from_row,
        )
        .optional()?;

    script.ok_or_else(|| AppError::message("Script was not found"))
}

fn delete_workspace_by_name(state: &AppState, name: &str) -> AppResult<usize> {
    let workspace = crate::workspaces::normalize_name(name)?;
    if workspace == crate::models::default_workspace() {
        return Err(AppError::message("Default workspace cannot be deleted"));
    }

    let script_ids = script_ids_for_workspace(state, &workspace)?;
    let deleted = delete_scripts_by_ids(
        state,
        &script_ids,
        "Stop running scripts before deleting this workspace",
    )?;

    let conn = state.connection()?;
    conn.execute(
        "DELETE FROM folders WHERE workspace = ?1",
        params![workspace],
    )?;
    conn.execute("DELETE FROM workspaces WHERE name = ?1", params![workspace])?;

    Ok(deleted)
}

fn delete_folder_by_name(state: &AppState, workspace: &str, folder: &str) -> AppResult<usize> {
    let workspace = crate::workspaces::normalize_name(workspace)?;
    let folder = crate::folders::normalize_name(folder)?;
    let script_ids = script_ids_for_folder(state, &workspace, &folder)?;
    let deleted = delete_scripts_by_ids(
        state,
        &script_ids,
        "Stop running scripts before deleting this folder",
    )?;

    let conn = state.connection()?;
    conn.execute(
        "DELETE FROM folders WHERE workspace = ?1 AND name = ?2",
        params![workspace, folder],
    )?;

    Ok(deleted)
}

fn script_ids_for_workspace(state: &AppState, workspace: &str) -> AppResult<Vec<String>> {
    let conn = state.connection()?;
    let mut statement = conn.prepare("SELECT id FROM scripts WHERE workspace = ?1")?;
    let script_ids = statement
        .query_map(params![workspace], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;

    Ok(script_ids)
}

fn script_ids_for_folder(
    state: &AppState,
    workspace: &str,
    folder: &str,
) -> AppResult<Vec<String>> {
    let conn = state.connection()?;

    let mut statement = conn.prepare(
        "SELECT id FROM scripts
         WHERE workspace = ?1 AND category IS NOT NULL AND TRIM(category) = ?2",
    )?;
    let script_ids = statement
        .query_map(params![workspace, folder], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;

    Ok(script_ids)
}

fn delete_scripts_by_ids(
    state: &AppState,
    script_ids: &[String],
    running_message: &str,
) -> AppResult<usize> {
    let mut unique_ids = Vec::new();
    let mut seen = HashSet::new();

    for script_id in script_ids {
        if !seen.insert(script_id.clone()) {
            continue;
        }

        if state.is_running(script_id)? {
            return Err(AppError::message(running_message));
        }

        get_script_by_id(state, script_id)?;
        unique_ids.push(script_id.clone());
    }

    if unique_ids.is_empty() {
        return Ok(0);
    }

    {
        let conn = state.connection()?;
        for script_id in &unique_ids {
            conn.execute(
                "DELETE FROM script_runs WHERE script_id = ?1",
                params![script_id],
            )?;
            conn.execute(
                "DELETE FROM script_versions WHERE script_id = ?1",
                params![script_id],
            )?;
            conn.execute("DELETE FROM scripts WHERE id = ?1", params![script_id])?;
        }
    }

    for script_id in &unique_ids {
        let script_dir = state.script_dir(script_id);
        if script_dir.exists() {
            fs::remove_dir_all(script_dir)?;
        }
    }

    Ok(unique_ids.len())
}

fn get_version_by_id(
    state: &AppState,
    script_id: &str,
    version_id: &str,
) -> AppResult<ScriptVersion> {
    let conn = state.connection()?;
    let version = conn
        .query_row(
            "SELECT id, script_id, name, workspace, content, interpreter_path, working_directory,
                    run_on_app_start, is_enabled, timeout_seconds, output_limit_bytes,
                    is_trusted, category, tags, is_favorite, created_at, reason
             FROM script_versions
             WHERE script_id = ?1 AND id = ?2",
            params![script_id, version_id],
            version_from_row,
        )
        .optional()?;

    version.ok_or_else(|| AppError::message("Version was not found"))
}

fn save_version_snapshot(
    state: &AppState,
    script: &ScriptRecord,
    content: &str,
    reason: &str,
) -> AppResult<()> {
    let conn = state.connection()?;
    conn.execute(
        "INSERT INTO script_versions (
          id, script_id, name, workspace, content, interpreter_path, working_directory,
          run_on_app_start, is_enabled, timeout_seconds, output_limit_bytes,
          is_trusted, category, tags, is_favorite, created_at, reason
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![
            Uuid::new_v4().to_string(),
            script.id,
            script.name,
            script.workspace,
            content,
            script.interpreter_path,
            script.working_directory,
            bool_to_i64(script.run_on_app_start),
            bool_to_i64(script.is_enabled),
            script.timeout_seconds,
            script.output_limit_bytes,
            bool_to_i64(script.is_trusted),
            script.category,
            tags_to_json(&script.tags)?,
            bool_to_i64(script.is_favorite),
            now(),
            reason
        ],
    )?;

    Ok(())
}

fn insert_script_from_backup(
    state: &AppState,
    backup: BackupScript,
    reason: &str,
) -> AppResult<ScriptRecord> {
    if backup.name.trim().is_empty() {
        return Err(AppError::message("Imported script name cannot be empty"));
    }

    if !(MIN_TIMEOUT_SECONDS..=MAX_TIMEOUT_SECONDS).contains(&backup.timeout_seconds) {
        return Err(AppError::message(format!(
            "Timeout must be between {MIN_TIMEOUT_SECONDS} and {MAX_TIMEOUT_SECONDS} seconds"
        )));
    }

    if !(MIN_OUTPUT_LIMIT_BYTES..=MAX_OUTPUT_LIMIT_BYTES).contains(&backup.output_limit_bytes) {
        return Err(AppError::message(format!(
            "Output limit must be between {MIN_OUTPUT_LIMIT_BYTES} and {MAX_OUTPUT_LIMIT_BYTES} bytes"
        )));
    }

    let interpreter_path = crate::python::resolve_interpreter(&backup.interpreter_path)
        .or_else(|| crate::python::detect_first().map(Into::into))
        .ok_or_else(|| AppError::message("No usable Python interpreter was found"))?
        .to_string_lossy()
        .to_string();

    let id = Uuid::new_v4().to_string();
    let now = now();
    let script_dir = state.script_dir(&id);
    let file_path = state.script_file(&id);
    let workspace = crate::workspaces::normalize_name(&backup.workspace)?;
    crate::workspaces::create_named(state, &workspace)?;
    let category = normalize_optional(backup.category);
    let tags = normalize_tags(backup.tags);
    let safety_report = safety::scan_script(&backup.content);

    fs::create_dir_all(&script_dir)?;
    fs::write(&file_path, &backup.content)?;

    let script = ScriptRecord {
        id,
        name: backup.name.trim().to_string(),
        workspace,
        file_path: file_path.to_string_lossy().to_string(),
        interpreter_path,
        working_directory: normalize_optional(backup.working_directory),
        run_on_app_start: backup.run_on_app_start,
        is_enabled: backup.is_enabled,
        timeout_seconds: normalize_timeout(backup.timeout_seconds),
        output_limit_bytes: normalize_output_limit(backup.output_limit_bytes),
        is_trusted: backup.is_trusted,
        category,
        tags,
        is_favorite: backup.is_favorite,
        safety_level: safety_report.level,
        safety_warnings: safety_report.warnings,
        created_at: now.clone(),
        updated_at: now,
    };

    {
        let conn = state.connection()?;
        conn.execute(
            "INSERT INTO scripts (
              id, name, workspace, file_path, interpreter_path, working_directory,
              run_on_app_start, is_enabled, timeout_seconds, output_limit_bytes,
              is_trusted, category, tags, is_favorite, safety_level, safety_warnings,
              created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                script.id,
                script.name,
                script.workspace,
                script.file_path,
                script.interpreter_path,
                script.working_directory,
                bool_to_i64(script.run_on_app_start),
                bool_to_i64(script.is_enabled),
                script.timeout_seconds,
                script.output_limit_bytes,
                bool_to_i64(script.is_trusted),
                script.category,
                tags_to_json(&script.tags)?,
                bool_to_i64(script.is_favorite),
                script.safety_level,
                warnings_to_json(&script.safety_warnings)?,
                script.created_at,
                script.updated_at
            ],
        )?;
    }

    save_version_snapshot(state, &script, &backup.content, reason)?;

    Ok(script)
}

fn script_from_row(row: &Row<'_>) -> rusqlite::Result<ScriptRecord> {
    let tags_json: String = row.get(12)?;
    let safety_warnings_json: String = row.get(15)?;

    Ok(ScriptRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        workspace: row.get(2)?,
        file_path: row.get(3)?,
        interpreter_path: row.get(4)?,
        working_directory: row.get(5)?,
        run_on_app_start: row.get::<_, i64>(6)? != 0,
        is_enabled: row.get::<_, i64>(7)? != 0,
        timeout_seconds: row.get(8)?,
        output_limit_bytes: row.get(9)?,
        is_trusted: row.get::<_, i64>(10)? != 0,
        category: row.get(11)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        is_favorite: row.get::<_, i64>(13)? != 0,
        safety_level: row.get(14)?,
        safety_warnings: serde_json::from_str(&safety_warnings_json).unwrap_or_default(),
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

fn run_from_row(row: &Row<'_>) -> rusqlite::Result<ScriptRun> {
    Ok(ScriptRun {
        id: row.get(0)?,
        script_id: row.get(1)?,
        started_at: row.get(2)?,
        finished_at: row.get(3)?,
        duration_ms: row.get(4)?,
        status: row.get(5)?,
        exit_code: row.get(6)?,
        stdout: row.get(7)?,
        stderr: row.get(8)?,
        error_message: row.get(9)?,
        stdout_truncated: row.get::<_, i64>(10)? != 0,
        stderr_truncated: row.get::<_, i64>(11)? != 0,
    })
}

fn version_from_row(row: &Row<'_>) -> rusqlite::Result<ScriptVersion> {
    let tags_json: String = row.get(13)?;

    Ok(ScriptVersion {
        id: row.get(0)?,
        script_id: row.get(1)?,
        name: row.get(2)?,
        workspace: row.get(3)?,
        content: row.get(4)?,
        interpreter_path: row.get(5)?,
        working_directory: row.get(6)?,
        run_on_app_start: row.get::<_, i64>(7)? != 0,
        is_enabled: row.get::<_, i64>(8)? != 0,
        timeout_seconds: row.get(9)?,
        output_limit_bytes: row.get(10)?,
        is_trusted: row.get::<_, i64>(11)? != 0,
        category: row.get(12)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        is_favorite: row.get::<_, i64>(14)? != 0,
        created_at: row.get(15)?,
        reason: row.get(16)?,
    })
}

fn validate_script_input(
    name: &str,
    interpreter_path: &str,
    timeout_seconds: i64,
    output_limit_bytes: i64,
) -> AppResult<String> {
    if name.trim().is_empty() {
        return Err(AppError::message("Script name cannot be empty"));
    }

    if !(MIN_TIMEOUT_SECONDS..=MAX_TIMEOUT_SECONDS).contains(&timeout_seconds) {
        return Err(AppError::message(format!(
            "Timeout must be between {MIN_TIMEOUT_SECONDS} and {MAX_TIMEOUT_SECONDS} seconds"
        )));
    }

    if !(MIN_OUTPUT_LIMIT_BYTES..=MAX_OUTPUT_LIMIT_BYTES).contains(&output_limit_bytes) {
        return Err(AppError::message(format!(
            "Output limit must be between {MIN_OUTPUT_LIMIT_BYTES} and {MAX_OUTPUT_LIMIT_BYTES} bytes"
        )));
    }

    crate::python::resolve_interpreter(interpreter_path)
        .map(|path| path.to_string_lossy().to_string())
        .ok_or_else(|| AppError::message("Python interpreter was not found or is not executable"))
}

fn warnings_to_json(warnings: &[String]) -> AppResult<String> {
    serde_json::to_string(warnings)
        .map_err(|error| AppError::message(format!("Could not serialize safety warnings: {error}")))
}

fn tags_to_json(tags: &[String]) -> AppResult<String> {
    serde_json::to_string(tags)
        .map_err(|error| AppError::message(format!("Could not serialize tags: {error}")))
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    tags.into_iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .filter(|tag| seen.insert(tag.to_lowercase()))
        .collect()
}

fn normalize_timeout(value: i64) -> i64 {
    value.clamp(MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS)
}

fn normalize_output_limit(value: i64) -> i64 {
    value.clamp(MIN_OUTPUT_LIMIT_BYTES, MAX_OUTPUT_LIMIT_BYTES)
}

fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

#[allow(dead_code)]
fn defaults_for_docs() -> (i64, i64) {
    (DEFAULT_TIMEOUT_SECONDS, DEFAULT_OUTPUT_LIMIT_BYTES)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_state() -> AppState {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch(crate::models::INIT_SQL)
            .expect("initialize schema");
        let scripts_dir = std::env::temp_dir().join(format!("auppy-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&scripts_dir).expect("create test script dir");

        AppState::for_tests(conn, scripts_dir)
    }

    fn backup_script(name: &str, content: &str) -> BackupScript {
        BackupScript {
            name: name.to_string(),
            content: content.to_string(),
            interpreter_path: crate::python::detect_first()
                .unwrap_or_else(|| "python3".to_string()),
            working_directory: None,
            workspace: "Default".to_string(),
            run_on_app_start: false,
            is_enabled: true,
            timeout_seconds: DEFAULT_TIMEOUT_SECONDS,
            output_limit_bytes: DEFAULT_OUTPUT_LIMIT_BYTES,
            is_trusted: false,
            category: Some("Tests".to_string()),
            tags: vec!["unit".to_string()],
            is_favorite: true,
        }
    }

    #[test]
    fn creates_exports_imports_and_deletes_script() {
        let state = test_state();
        let script = insert_script_from_backup(
            &state,
            backup_script("Hello", "print('hello')"),
            "Created in test",
        )
        .expect("create script");

        let fetched = get_script_by_id(&state, &script.id).expect("fetch script");
        assert_eq!(fetched.name, "Hello");
        assert_eq!(fetched.category.as_deref(), Some("Tests"));
        assert!(fetched.is_favorite);

        let exported = export_library_json(&state, Some(std::slice::from_ref(&script.id)))
            .expect("export selected");
        assert!(exported.contains("\"Hello\""));

        let imported = import_library_json(&state, &exported).expect("import backup");
        assert_eq!(imported.imported, 1);
        assert_eq!(list_scripts_from_db(&state).expect("list scripts").len(), 2);

        {
            let conn = state.connection().expect("db connection");
            conn.execute("DELETE FROM scripts WHERE id = ?1", params![script.id])
                .expect("delete script");
        }

        assert!(get_script_by_id(&state, &script.id).is_err());
    }

    #[test]
    fn duplicates_script_without_auto_run_or_favorite() {
        let state = test_state();
        let script = insert_script_from_backup(
            &state,
            BackupScript {
                run_on_app_start: true,
                ..backup_script("Original", "print('copy')")
            },
            "Created in test",
        )
        .expect("create script");

        let duplicated = duplicate_script_record(&state, &script.id).expect("duplicate script");

        assert_eq!(duplicated.name, "Original Copy");
        assert!(!duplicated.run_on_app_start);
        assert!(!duplicated.is_favorite);
        assert_eq!(duplicated.category.as_deref(), Some("Tests"));
    }

    #[test]
    fn deletes_folder_without_deleting_workspace() {
        let state = test_state();
        let deleted_script = insert_script_from_backup(
            &state,
            BackupScript {
                workspace: "Operations".to_string(),
                category: Some("Cleanup".to_string()),
                ..backup_script("Delete me", "print('delete')")
            },
            "Created in test",
        )
        .expect("create deleted script");
        let kept_script = insert_script_from_backup(
            &state,
            BackupScript {
                workspace: "Operations".to_string(),
                category: Some("Keep".to_string()),
                ..backup_script("Keep me", "print('keep')")
            },
            "Created in test",
        )
        .expect("create kept script");

        let deleted = delete_folder_by_name(&state, "Operations", "Cleanup")
            .expect("delete workspace folder");

        assert_eq!(deleted, 1);
        assert!(get_script_by_id(&state, &deleted_script.id).is_err());
        assert!(get_script_by_id(&state, &kept_script.id).is_ok());
        assert!(!state.script_dir(&deleted_script.id).exists());
        assert!(crate::workspaces::list(&state)
            .expect("list workspaces")
            .iter()
            .any(|workspace| workspace.name == "Operations"));
    }

    #[test]
    fn renames_folder_and_updates_contained_scripts() {
        let state = test_state();
        crate::folders::create(
            &state,
            CreateFolderInput {
                workspace: "Operations".to_string(),
                name: "Old Name".to_string(),
            },
        )
        .expect("create folder");
        let script = insert_script_from_backup(
            &state,
            BackupScript {
                workspace: "Operations".to_string(),
                category: Some("Old Name".to_string()),
                ..backup_script("Rename me", "print('rename')")
            },
            "Created in test",
        )
        .expect("create script");

        let folder = crate::folders::rename(
            &state,
            RenameFolderInput {
                workspace: "Operations".to_string(),
                old_name: "Old Name".to_string(),
                new_name: "New Name".to_string(),
            },
        )
        .expect("rename folder");
        let renamed_script = get_script_by_id(&state, &script.id).expect("fetch script");
        let folders = crate::folders::list(&state).expect("list folders");

        assert_eq!(folder.name, "New Name");
        assert_eq!(renamed_script.category.as_deref(), Some("New Name"));
        assert!(folders.iter().any(|item| item.name == "New Name"));
        assert!(!folders.iter().any(|item| item.name == "Old Name"));
    }

    #[test]
    fn deletes_workspace_and_all_contained_scripts() {
        let state = test_state();
        let first_deleted = insert_script_from_backup(
            &state,
            BackupScript {
                workspace: "Scratch".to_string(),
                category: Some("One".to_string()),
                ..backup_script("First", "print('one')")
            },
            "Created in test",
        )
        .expect("create first deleted script");
        let second_deleted = insert_script_from_backup(
            &state,
            BackupScript {
                workspace: "Scratch".to_string(),
                category: Some("Two".to_string()),
                ..backup_script("Second", "print('two')")
            },
            "Created in test",
        )
        .expect("create second deleted script");
        let kept_script = insert_script_from_backup(
            &state,
            backup_script("Keep", "print('keep')"),
            "Created in test",
        )
        .expect("create kept script");

        let deleted = delete_workspace_by_name(&state, "Scratch").expect("delete workspace");

        assert_eq!(deleted, 2);
        assert!(get_script_by_id(&state, &first_deleted.id).is_err());
        assert!(get_script_by_id(&state, &second_deleted.id).is_err());
        assert!(get_script_by_id(&state, &kept_script.id).is_ok());
        assert!(!state.script_dir(&first_deleted.id).exists());
        assert!(!state.script_dir(&second_deleted.id).exists());
        assert!(!crate::workspaces::list(&state)
            .expect("list workspaces")
            .iter()
            .any(|workspace| workspace.name == "Scratch"));
    }

    #[test]
    fn version_snapshots_can_be_listed() {
        let state = test_state();
        let script = insert_script_from_backup(
            &state,
            backup_script("Versioned", "print('v1')"),
            "Created in test",
        )
        .expect("create script");

        save_version_snapshot(&state, &script, "print('v2')", "Before update")
            .expect("save version");
        let versions = {
            let conn = state.connection().expect("db connection");
            let mut statement = conn
                .prepare(
                    "SELECT id, script_id, name, workspace, content, interpreter_path, working_directory,
                            run_on_app_start, is_enabled, timeout_seconds, output_limit_bytes,
                            is_trusted, category, tags, is_favorite, created_at, reason
                     FROM script_versions
                     WHERE script_id = ?1
                     ORDER BY created_at DESC",
                )
                .expect("prepare version query");

            statement
                .query_map(params![script.id], version_from_row)
                .expect("query versions")
                .collect::<Result<Vec<_>, _>>()
                .expect("collect versions")
        };

        assert!(versions
            .iter()
            .any(|version| version.reason == "Before update"));
    }
}
