use chrono::Utc;
use rusqlite::params;

use crate::db::AppState;
use crate::errors::{AppError, AppResult};
use crate::models::{CreateWorkspaceInput, WorkspaceRecord};

pub fn list(state: &AppState) -> AppResult<Vec<WorkspaceRecord>> {
    let conn = state.connection()?;
    let mut statement = conn.prepare(
        "SELECT name, MIN(created_at) AS created_at
         FROM (
           SELECT name, created_at FROM workspaces
           UNION ALL
           SELECT workspace AS name, created_at FROM folders
           UNION ALL
           SELECT workspace AS name, created_at FROM scripts
         )
         WHERE name IS NOT NULL AND TRIM(name) != ''
         GROUP BY name
         ORDER BY CASE WHEN name = 'Default' THEN 0 ELSE 1 END, LOWER(name)",
    )?;

    let workspaces = statement
        .query_map([], |row| {
            Ok(WorkspaceRecord {
                name: row.get(0)?,
                created_at: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(workspaces)
}

pub fn create(state: &AppState, input: CreateWorkspaceInput) -> AppResult<WorkspaceRecord> {
    let name = normalize_name(&input.name)?;
    create_named(state, &name)
}

pub fn create_named(state: &AppState, value: &str) -> AppResult<WorkspaceRecord> {
    let name = normalize_name(value)?;
    let created_at = Utc::now().to_rfc3339();
    let conn = state.connection()?;

    conn.execute(
        "INSERT INTO workspaces (name, created_at)
         VALUES (?1, ?2)
         ON CONFLICT(name) DO NOTHING",
        params![name, created_at],
    )?;

    Ok(WorkspaceRecord { name, created_at })
}

pub fn normalize_name(value: &str) -> AppResult<String> {
    let name = value.trim();
    if name.is_empty() {
        return Err(AppError::message("Workspace name cannot be empty"));
    }

    if name.len() > 80 {
        return Err(AppError::message(
            "Workspace name must be 80 characters or less",
        ));
    }

    Ok(name.to_string())
}
