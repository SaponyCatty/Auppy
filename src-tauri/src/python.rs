use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use crate::db::AppState;
use crate::errors::AppResult;
use crate::models::PythonInterpreter;

pub const DEFAULT_PYTHON_SETTING_KEY: &str = "defaultPythonInterpreter";

pub fn detect_interpreters(state: &AppState) -> AppResult<Vec<PythonInterpreter>> {
    let default_path = default_interpreter(state)?;
    let mut seen = HashSet::new();
    let mut interpreters = Vec::new();

    for candidate in candidates() {
        if !is_executable_path(&candidate) {
            continue;
        }

        let canonical = fs::canonicalize(&candidate).unwrap_or(candidate);
        let path = canonical.to_string_lossy().to_string();
        if !seen.insert(path.clone()) {
            continue;
        }

        let version = version(&canonical);
        if version
            .as_deref()
            .is_some_and(|value| value.to_lowercase().contains("python"))
        {
            interpreters.push(PythonInterpreter {
                is_default: path == default_path,
                path,
                version,
            });
        }
    }

    Ok(interpreters)
}

pub fn default_interpreter(state: &AppState) -> AppResult<String> {
    if let Some(value) = crate::settings::get(state, DEFAULT_PYTHON_SETTING_KEY)? {
        if resolve_interpreter(&value).is_some() {
            return Ok(value);
        }
    }

    Ok(detect_first().unwrap_or_else(|| "python3".to_string()))
}

pub(crate) fn resolve_interpreter(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let path = Path::new(trimmed);
    if trimmed.contains('/') || trimmed.contains('\\') {
        return is_executable_path(path).then(|| path.to_path_buf());
    }

    let path_value = env::var_os("PATH")?;
    for directory in env::split_paths(&path_value) {
        let candidate = directory.join(trimmed);
        if is_executable_path(&candidate) {
            return Some(fs::canonicalize(&candidate).unwrap_or(candidate));
        }
    }

    None
}

pub(crate) fn detect_first() -> Option<String> {
    candidates()
        .into_iter()
        .find(|candidate| is_executable_path(candidate))
        .map(|path| {
            fs::canonicalize(&path)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string()
        })
}

fn candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let names = [
        "python3",
        "python",
        "python3.13",
        "python3.12",
        "python3.11",
        "python3.10",
        "python3.9",
    ];

    if let Some(path_value) = env::var_os("PATH") {
        for directory in env::split_paths(&path_value) {
            for name in names {
                candidates.push(directory.join(name));
            }
        }
    }

    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/python3"),
        PathBuf::from("/usr/local/bin/python3"),
        PathBuf::from("/usr/bin/python3"),
    ]);

    candidates
}

fn is_executable_path(path: impl AsRef<Path>) -> bool {
    let Ok(metadata) = fs::metadata(path.as_ref()) else {
        return false;
    };

    if !metadata.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }

    #[cfg(not(unix))]
    {
        true
    }
}

fn version(path: &Path) -> Option<String> {
    let output = StdCommand::new(path).arg("--version").output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let version = if stdout.trim().is_empty() {
        stderr.trim()
    } else {
        stdout.trim()
    };

    (!version.is_empty()).then(|| version.to_string())
}
