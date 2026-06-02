use rusqlite::{params, OptionalExtension};

use crate::db::AppState;
use crate::errors::{AppError, AppResult};

pub fn save(state: &AppState, key: &str, value: String) -> AppResult<()> {
    let key = key.trim();
    if key.is_empty() {
        return Err(AppError::message("Setting key cannot be empty"));
    }

    let conn = state.connection()?;
    conn.execute(
        "INSERT INTO settings (key, value)
         VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;

    Ok(())
}

pub fn get(state: &AppState, key: &str) -> AppResult<Option<String>> {
    let conn = state.connection()?;
    let value = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key.trim()],
            |row| row.get(0),
        )
        .optional()?;

    Ok(value)
}
