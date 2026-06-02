use chrono::Utc;
use rusqlite::params;

use crate::db::AppState;
use crate::errors::{AppError, AppResult};
use crate::models::{CreateFolderInput, FolderRecord, RenameFolderInput};

pub fn list(state: &AppState) -> AppResult<Vec<FolderRecord>> {
    let conn = state.connection()?;
    let mut statement = conn.prepare(
        "SELECT workspace, name, MIN(created_at) AS created_at
         FROM (
           SELECT workspace, name, created_at FROM folders
           UNION ALL
           SELECT workspace, category AS name, created_at FROM scripts
           WHERE category IS NOT NULL AND TRIM(category) != ''
         )
         GROUP BY workspace, name
         ORDER BY LOWER(workspace), LOWER(name)",
    )?;

    let folders = statement
        .query_map([], |row| {
            Ok(FolderRecord {
                workspace: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(folders)
}

pub fn create(state: &AppState, input: CreateFolderInput) -> AppResult<FolderRecord> {
    let workspace = crate::workspaces::normalize_name(&input.workspace)?;
    let name = normalize_name(&input.name)?;
    let created_at = Utc::now().to_rfc3339();
    crate::workspaces::create_named(state, &workspace)?;

    let conn = state.connection()?;
    conn.execute(
        "INSERT INTO folders (workspace, name, created_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(workspace, name) DO NOTHING",
        params![workspace, name, created_at],
    )?;

    Ok(FolderRecord {
        workspace,
        name,
        created_at,
    })
}

pub fn rename(state: &AppState, input: RenameFolderInput) -> AppResult<FolderRecord> {
    let workspace = crate::workspaces::normalize_name(&input.workspace)?;
    let old_name = normalize_name(&input.old_name)?;
    let new_name = normalize_name(&input.new_name)?;

    if old_name == new_name {
        return Ok(FolderRecord {
            workspace,
            name: new_name,
            created_at: Utc::now().to_rfc3339(),
        });
    }

    crate::workspaces::create_named(state, &workspace)?;

    let conn = state.connection()?;
    let existing: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM (
           SELECT name FROM folders WHERE workspace = ?1 AND name = ?2
           UNION ALL
           SELECT category AS name FROM scripts
           WHERE workspace = ?1 AND category IS NOT NULL AND TRIM(category) = ?2
         )",
        params![&workspace, &new_name],
        |row| row.get(0),
    )?;
    if existing > 0 {
        return Err(AppError::message("A folder with that name already exists"));
    }

    let created_at = conn
        .query_row(
            "SELECT created_at FROM folders WHERE workspace = ?1 AND name = ?2",
            params![&workspace, &old_name],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| Utc::now().to_rfc3339());

    conn.execute(
        "INSERT INTO folders (workspace, name, created_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(workspace, name) DO UPDATE SET name = excluded.name",
        params![&workspace, &new_name, &created_at],
    )?;
    conn.execute(
        "DELETE FROM folders WHERE workspace = ?1 AND name = ?2",
        params![&workspace, &old_name],
    )?;
    conn.execute(
        "UPDATE scripts
         SET category = ?3,
             updated_at = ?4
         WHERE workspace = ?1 AND category IS NOT NULL AND TRIM(category) = ?2",
        params![&workspace, &old_name, &new_name, Utc::now().to_rfc3339()],
    )?;

    Ok(FolderRecord {
        workspace,
        name: new_name,
        created_at,
    })
}

pub fn normalize_name(value: &str) -> AppResult<String> {
    let name = value.trim();
    if name.is_empty() {
        return Err(AppError::message("Folder name cannot be empty"));
    }

    if name.len() > 80 {
        return Err(AppError::message(
            "Folder name must be 80 characters or less",
        ));
    }

    Ok(name.to_string())
}
