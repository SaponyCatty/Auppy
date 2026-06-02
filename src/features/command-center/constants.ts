import type { NewScriptDefaults } from "./types";

export const defaultTimeoutSeconds = 300;
export const defaultOutputLimitBytes = 65_536;

export const pythonSettingKey = "defaultPythonInterpreter";
export const timeoutSettingKey = "defaultTimeoutSeconds";
export const outputLimitSettingKey = "defaultOutputLimitBytes";
export const workspaceSettingKey = "defaultWorkspace";
export const categorySettingKey = "defaultScriptCategory";
export const tagsSettingKey = "defaultScriptTags";
export const themeStorageKey = "auppy-theme";
export const defaultWorkspaceName = "Default";

export const initialScriptDefaults: NewScriptDefaults = {
  timeoutSeconds: defaultTimeoutSeconds,
  outputLimitBytes: defaultOutputLimitBytes,
  workspace: defaultWorkspaceName,
  category: "",
  tagsText: "",
};

export const backupFileFilters = [
  {
    name: "Auppy library backup",
    extensions: ["json"],
  },
];

export const starterCode = `from datetime import datetime

print("Auppy command ran at", datetime.now().isoformat(timespec="seconds"))
`;
