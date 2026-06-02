import { invoke } from "@tauri-apps/api/core";

export type ScriptRecord = {
  id: string;
  name: string;
  workspace: string;
  file_path: string;
  interpreter_path: string;
  working_directory?: string | null;
  run_on_app_start: boolean;
  is_enabled: boolean;
  timeout_seconds: number;
  output_limit_bytes: number;
  is_trusted: boolean;
  category?: string | null;
  tags: string[];
  is_favorite: boolean;
  safety_level: string;
  safety_warnings: string[];
  created_at: string;
  updated_at: string;
};

export type ScriptDetail = ScriptRecord & {
  content: string;
};

export type ScriptRun = {
  id: string;
  script_id: string;
  started_at: string;
  finished_at?: string | null;
  duration_ms?: number | null;
  status: string;
  exit_code?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  error_message?: string | null;
  stdout_truncated: boolean;
  stderr_truncated: boolean;
};

export type ScriptVersion = {
  id: string;
  script_id: string;
  name: string;
  content: string;
  interpreter_path: string;
  working_directory?: string | null;
  run_on_app_start: boolean;
  is_enabled: boolean;
  timeout_seconds: number;
  output_limit_bytes: number;
  is_trusted: boolean;
  category?: string | null;
  tags: string[];
  is_favorite: boolean;
  created_at: string;
  reason: string;
};

export type PythonInterpreter = {
  path: string;
  version?: string | null;
  is_default: boolean;
};

export type FolderRecord = {
  workspace: string;
  name: string;
  created_at: string;
};

export type WorkspaceRecord = {
  name: string;
  created_at: string;
};

export type ImportLibraryResult = {
  imported: number;
};

export function listScripts() {
  return invoke<ScriptRecord[]>("list_scripts");
}

export function listFolders() {
  return invoke<FolderRecord[]>("list_folders");
}

export function listWorkspaces() {
  return invoke<WorkspaceRecord[]>("list_workspaces");
}

export function createWorkspace(name: string) {
  return invoke<WorkspaceRecord>("create_workspace", { input: { name } });
}

export function deleteWorkspace(name: string) {
  return invoke<number>("delete_workspace", { input: { name } });
}

export function createFolder(workspace: string, name: string) {
  return invoke<FolderRecord>("create_folder", { input: { workspace, name } });
}

export function deleteFolder(workspace: string, name: string) {
  return invoke<number>("delete_folder", { input: { workspace, name } });
}

export function renameFolder(workspace: string, oldName: string, newName: string) {
  return invoke<FolderRecord>("rename_folder", {
    input: { workspace, oldName, newName },
  });
}

export function getScript(scriptId: string) {
  return invoke<ScriptDetail>("get_script", { scriptId });
}

export function createScript(input: {
  name: string;
  content: string;
  interpreterPath: string;
  workingDirectory?: string | null;
  workspace: string;
  runOnAppStart: boolean;
  isEnabled: boolean;
  timeoutSeconds: number;
  outputLimitBytes: number;
  isTrusted: boolean;
  category?: string | null;
  tags: string[];
  isFavorite: boolean;
}) {
  return invoke<ScriptRecord>("create_script", { input });
}

export function updateScript(
  scriptId: string,
  input: {
    name: string;
    content: string;
    interpreterPath: string;
    workingDirectory?: string | null;
    workspace: string;
    runOnAppStart: boolean;
    isEnabled: boolean;
    timeoutSeconds: number;
    outputLimitBytes: number;
    isTrusted: boolean;
    category?: string | null;
    tags: string[];
    isFavorite: boolean;
  },
) {
  return invoke<ScriptRecord>("update_script", { scriptId, input });
}

export function deleteScript(scriptId: string) {
  return invoke<void>("delete_script", { scriptId });
}

export function bulkDeleteScripts(scriptIds: string[]) {
  return invoke<number>("bulk_delete_scripts", { scriptIds });
}

export function bulkUpdateScripts(input: {
  scriptIds: string[];
  workspace?: string;
  category?: string;
  tags?: string[];
}) {
  return invoke<number>("bulk_update_scripts", { input });
}

export function duplicateScript(scriptId: string) {
  return invoke<ScriptRecord>("duplicate_script", { scriptId });
}

export function runScript(scriptId: string) {
  return invoke<ScriptRun>("run_script", { scriptId });
}

export function cancelScript(scriptId: string) {
  return invoke<boolean>("cancel_script", { scriptId });
}

export function listRuns(scriptId: string) {
  return invoke<ScriptRun[]>("list_runs", { scriptId });
}

export function listScriptVersions(scriptId: string) {
  return invoke<ScriptVersion[]>("list_script_versions", { scriptId });
}

export function restoreScriptVersion(scriptId: string, versionId: string) {
  return invoke<ScriptRecord>("restore_script_version", { scriptId, versionId });
}

export function exportLibrary() {
  return invoke<string>("export_library");
}

export function exportSelectedLibrary(scriptIds: string[]) {
  return invoke<string>("export_selected_library", {
    input: { scriptIds },
  });
}

export function exportLibraryToPath(path: string) {
  return invoke<void>("export_library_to_path", { path });
}

export function exportSelectedLibraryToPath(scriptIds: string[], path: string) {
  return invoke<void>("export_selected_library_to_path", {
    input: { scriptIds },
    path,
  });
}

export function importLibrary(backupJson: string) {
  return invoke<ImportLibraryResult>("import_library", {
    input: { backupJson },
  });
}

export function importLibraryFromPath(path: string) {
  return invoke<ImportLibraryResult>("import_library_from_path", { path });
}

export function saveSetting(key: string, value: string) {
  return invoke<void>("save_setting", { key, value });
}

export function getSetting(key: string) {
  return invoke<string | null>("get_setting", { key });
}

export function detectPythonInterpreters() {
  return invoke<PythonInterpreter[]>("detect_python_interpreters");
}

export function getDefaultPythonInterpreter() {
  return invoke<string>("get_default_python_interpreter");
}
