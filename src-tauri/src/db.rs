use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use anyhow::Context;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};
use tokio::sync::watch;

use crate::errors::{AppError, AppResult};
use crate::models::INIT_SQL;

pub struct RunningScript {
    pub run_id: String,
    pub cancel_tx: watch::Sender<bool>,
}

pub struct AppState {
    pub conn: Mutex<Connection>,
    pub scripts_dir: PathBuf,
    running_scripts: Mutex<HashMap<String, RunningScript>>,
}

impl AppState {
    pub fn connection(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::message("Database connection lock was poisoned"))
    }

    pub fn script_dir(&self, script_id: &str) -> PathBuf {
        self.scripts_dir.join(script_id)
    }

    pub fn script_file(&self, script_id: &str) -> PathBuf {
        self.script_dir(script_id).join("main.py")
    }

    pub fn register_running(
        &self,
        script_id: &str,
        run_id: &str,
    ) -> AppResult<watch::Receiver<bool>> {
        let mut running = self
            .running_scripts
            .lock()
            .map_err(|_| AppError::message("Running script lock was poisoned"))?;

        if running.contains_key(script_id) {
            return Err(AppError::message("Script is already running"));
        }

        let (cancel_tx, cancel_rx) = watch::channel(false);
        running.insert(
            script_id.to_string(),
            RunningScript {
                run_id: run_id.to_string(),
                cancel_tx,
            },
        );

        Ok(cancel_rx)
    }

    pub fn cancel_running(&self, script_id: &str) -> AppResult<Option<String>> {
        let running = self
            .running_scripts
            .lock()
            .map_err(|_| AppError::message("Running script lock was poisoned"))?;

        let Some(run) = running.get(script_id) else {
            return Ok(None);
        };

        let _ = run.cancel_tx.send(true);
        Ok(Some(run.run_id.clone()))
    }

    pub fn is_running(&self, script_id: &str) -> AppResult<bool> {
        let running = self
            .running_scripts
            .lock()
            .map_err(|_| AppError::message("Running script lock was poisoned"))?;

        Ok(running.contains_key(script_id))
    }

    pub fn clear_running(&self, script_id: &str, run_id: &str) -> AppResult<()> {
        let mut running = self
            .running_scripts
            .lock()
            .map_err(|_| AppError::message("Running script lock was poisoned"))?;

        if running
            .get(script_id)
            .is_some_and(|run| run.run_id.as_str() == run_id)
        {
            running.remove(script_id);
        }

        Ok(())
    }

    #[cfg(test)]
    pub fn for_tests(conn: Connection, scripts_dir: PathBuf) -> Self {
        Self {
            conn: Mutex::new(conn),
            scripts_dir,
            running_scripts: Mutex::new(HashMap::new()),
        }
    }
}

pub fn initialize(app: &AppHandle) -> anyhow::Result<AppState> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve app data directory")?;
    let scripts_dir = app_data_dir.join("scripts");
    let db_path = app_data_dir.join("auppy.sqlite3");

    std::fs::create_dir_all(&scripts_dir).context("Could not create scripts directory")?;

    let conn = Connection::open(db_path).context("Could not open app database")?;
    conn.execute_batch(INIT_SQL)
        .context("Could not initialize app database")?;
    migrate(&conn).context("Could not migrate app database")?;

    Ok(AppState {
        conn: Mutex::new(conn),
        scripts_dir,
        running_scripts: Mutex::new(HashMap::new()),
    })
}

fn migrate(conn: &Connection) -> anyhow::Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workspaces (
          name TEXT PRIMARY KEY,
          created_at TEXT NOT NULL
        )",
        [],
    )?;
    conn.execute(
        "INSERT INTO workspaces (name, created_at)
         VALUES ('Default', datetime('now'))
         ON CONFLICT(name) DO NOTHING",
        [],
    )?;

    migrate_folders_table(conn)?;

    ensure_column(
        conn,
        "scripts",
        "workspace",
        "workspace TEXT NOT NULL DEFAULT 'Default'",
    )?;
    ensure_column(
        conn,
        "scripts",
        "timeout_seconds",
        "timeout_seconds INTEGER NOT NULL DEFAULT 300",
    )?;
    ensure_column(
        conn,
        "scripts",
        "output_limit_bytes",
        "output_limit_bytes INTEGER NOT NULL DEFAULT 65536",
    )?;
    ensure_column(
        conn,
        "scripts",
        "is_trusted",
        "is_trusted INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(conn, "scripts", "category", "category TEXT")?;
    ensure_column(conn, "scripts", "tags", "tags TEXT NOT NULL DEFAULT '[]'")?;
    ensure_column(
        conn,
        "scripts",
        "is_favorite",
        "is_favorite INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        conn,
        "scripts",
        "safety_level",
        "safety_level TEXT NOT NULL DEFAULT 'low'",
    )?;
    ensure_column(
        conn,
        "scripts",
        "safety_warnings",
        "safety_warnings TEXT NOT NULL DEFAULT '[]'",
    )?;
    ensure_column(conn, "script_runs", "duration_ms", "duration_ms INTEGER")?;
    ensure_column(
        conn,
        "script_runs",
        "stdout_truncated",
        "stdout_truncated INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        conn,
        "script_runs",
        "stderr_truncated",
        "stderr_truncated INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        conn,
        "script_versions",
        "workspace",
        "workspace TEXT NOT NULL DEFAULT 'Default'",
    )?;
    ensure_column(conn, "script_versions", "category", "category TEXT")?;
    ensure_column(
        conn,
        "script_versions",
        "tags",
        "tags TEXT NOT NULL DEFAULT '[]'",
    )?;
    ensure_column(
        conn,
        "script_versions",
        "is_favorite",
        "is_favorite INTEGER NOT NULL DEFAULT 0",
    )?;

    Ok(())
}

fn migrate_folders_table(conn: &Connection) -> anyhow::Result<()> {
    let mut statement = conn.prepare("PRAGMA table_info(folders)")?;
    let columns = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(1)?, row.get::<_, i64>(5)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let has_workspace = columns.iter().any(|(column, _)| column == "workspace");
    let workspace_is_primary_key = columns
        .iter()
        .any(|(column, pk)| column == "workspace" && *pk > 0);

    if has_workspace && workspace_is_primary_key {
        return Ok(());
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS folders_v2 (
          workspace TEXT NOT NULL DEFAULT 'Default',
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY(workspace, name),
          FOREIGN KEY(workspace) REFERENCES workspaces(name) ON DELETE CASCADE
        )",
        [],
    )?;

    if has_workspace {
        conn.execute(
            "INSERT OR IGNORE INTO workspaces (name, created_at)
             SELECT DISTINCT COALESCE(NULLIF(TRIM(workspace), ''), 'Default'), datetime('now')
             FROM folders",
            [],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO folders_v2 (workspace, name, created_at)
             SELECT COALESCE(NULLIF(TRIM(workspace), ''), 'Default'), name, created_at
             FROM folders",
            [],
        )?;
    } else {
        conn.execute(
            "INSERT OR IGNORE INTO folders_v2 (workspace, name, created_at)
             SELECT 'Default', name, created_at
             FROM folders",
            [],
        )?;
    }

    conn.execute("DROP TABLE folders", [])?;
    conn.execute("ALTER TABLE folders_v2 RENAME TO folders", [])?;

    Ok(())
}

fn ensure_column(
    conn: &Connection,
    table_name: &str,
    column_name: &str,
    column_definition: &str,
) -> anyhow::Result<()> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table_name})"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;

    if !columns.iter().any(|column| column == column_name) {
        conn.execute(
            &format!("ALTER TABLE {table_name} ADD COLUMN {column_definition}"),
            [],
        )?;
    }

    Ok(())
}
