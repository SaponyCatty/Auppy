use serde::{Deserialize, Serialize};

pub const DEFAULT_TIMEOUT_SECONDS: i64 = 300;
pub const DEFAULT_OUTPUT_LIMIT_BYTES: i64 = 65_536;

pub const INIT_SQL: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace TEXT NOT NULL DEFAULT 'Default',
  file_path TEXT NOT NULL,
  interpreter_path TEXT NOT NULL,
  working_directory TEXT,
  run_on_app_start INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  timeout_seconds INTEGER NOT NULL DEFAULT 300,
  output_limit_bytes INTEGER NOT NULL DEFAULT 65536,
  is_trusted INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  safety_level TEXT NOT NULL DEFAULT 'low',
  safety_warnings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS script_runs (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL,
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  error_message TEXT,
  stdout_truncated INTEGER NOT NULL DEFAULT 0,
  stderr_truncated INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS script_versions (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL,
  name TEXT NOT NULL,
  workspace TEXT NOT NULL DEFAULT 'Default',
  content TEXT NOT NULL,
  interpreter_path TEXT NOT NULL,
  working_directory TEXT,
  run_on_app_start INTEGER NOT NULL,
  is_enabled INTEGER NOT NULL,
  timeout_seconds INTEGER NOT NULL,
  output_limit_bytes INTEGER NOT NULL,
  is_trusted INTEGER NOT NULL,
  category TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  name TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  workspace TEXT NOT NULL DEFAULT 'Default',
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(workspace, name),
  FOREIGN KEY(workspace) REFERENCES workspaces(name) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_script_runs_script_started
ON script_runs(script_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_versions_script_created
ON script_versions(script_id, created_at DESC);
"#;

#[derive(Debug, Clone, Serialize)]
pub struct SafetyReport {
    pub level: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScriptRecord {
    pub id: String,
    pub name: String,
    pub workspace: String,
    pub file_path: String,
    pub interpreter_path: String,
    pub working_directory: Option<String>,
    pub run_on_app_start: bool,
    pub is_enabled: bool,
    pub timeout_seconds: i64,
    pub output_limit_bytes: i64,
    pub is_trusted: bool,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub safety_level: String,
    pub safety_warnings: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScriptDetail {
    pub id: String,
    pub name: String,
    pub workspace: String,
    pub file_path: String,
    pub interpreter_path: String,
    pub working_directory: Option<String>,
    pub run_on_app_start: bool,
    pub is_enabled: bool,
    pub timeout_seconds: i64,
    pub output_limit_bytes: i64,
    pub is_trusted: bool,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub safety_level: String,
    pub safety_warnings: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScriptRun {
    pub id: String,
    pub script_id: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub status: String,
    pub exit_code: Option<i32>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub error_message: Option<String>,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScriptVersion {
    pub id: String,
    pub script_id: String,
    pub name: String,
    pub workspace: String,
    pub content: String,
    pub interpreter_path: String,
    pub working_directory: Option<String>,
    pub run_on_app_start: bool,
    pub is_enabled: bool,
    pub timeout_seconds: i64,
    pub output_limit_bytes: i64,
    pub is_trusted: bool,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub created_at: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PythonInterpreter {
    pub path: String,
    pub version: Option<String>,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceRecord {
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FolderRecord {
    pub workspace: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryBackup {
    pub exported_at: String,
    pub scripts: Vec<BackupScript>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupScript {
    pub name: String,
    pub content: String,
    pub interpreter_path: String,
    pub working_directory: Option<String>,
    #[serde(default = "default_workspace")]
    pub workspace: String,
    pub run_on_app_start: bool,
    pub is_enabled: bool,
    pub timeout_seconds: i64,
    pub output_limit_bytes: i64,
    pub is_trusted: bool,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub is_favorite: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLibraryInput {
    pub backup_json: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSelectedInput {
    pub script_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkUpdateScriptsInput {
    pub script_ids: Vec<String>,
    pub workspace: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceInput {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWorkspaceInput {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderInput {
    pub workspace: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFolderInput {
    pub workspace: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameFolderInput {
    pub workspace: String,
    pub old_name: String,
    pub new_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportLibraryResult {
    pub imported: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateScriptInput {
    pub name: String,
    pub content: String,
    pub interpreter_path: String,
    pub working_directory: Option<String>,
    #[serde(default = "default_workspace")]
    pub workspace: String,
    pub run_on_app_start: bool,
    #[serde(default = "default_enabled")]
    pub is_enabled: bool,
    #[serde(default = "default_timeout_seconds")]
    pub timeout_seconds: i64,
    #[serde(default = "default_output_limit_bytes")]
    pub output_limit_bytes: i64,
    #[serde(default)]
    pub is_trusted: bool,
    pub category: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub is_favorite: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateScriptInput {
    pub name: String,
    pub content: String,
    pub interpreter_path: String,
    pub working_directory: Option<String>,
    #[serde(default = "default_workspace")]
    pub workspace: String,
    pub run_on_app_start: bool,
    pub is_enabled: bool,
    pub timeout_seconds: i64,
    pub output_limit_bytes: i64,
    pub is_trusted: bool,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub is_favorite: bool,
}

pub fn default_enabled() -> bool {
    true
}

pub fn default_timeout_seconds() -> i64 {
    DEFAULT_TIMEOUT_SECONDS
}

pub fn default_output_limit_bytes() -> i64 {
    DEFAULT_OUTPUT_LIMIT_BYTES
}

pub fn default_workspace() -> String {
    "Default".to_string()
}
