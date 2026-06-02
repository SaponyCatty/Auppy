export type ScriptForm = {
  name: string;
  content: string;
  interpreterPath: string;
  workingDirectory: string;
  workspace: string;
  runOnAppStart: boolean;
  isEnabled: boolean;
  timeoutSeconds: number;
  outputLimitBytes: number;
  isTrusted: boolean;
  category: string;
  tagsText: string;
  isFavorite: boolean;
};

export type SafetyView = {
  level: "low" | "medium" | "high";
  warnings: string[];
};

export type NewScriptDefaults = {
  timeoutSeconds: number;
  outputLimitBytes: number;
  workspace: string;
  category: string;
  tagsText: string;
};

export type SettingsForm = NewScriptDefaults & {
  python: string;
};

export type ScriptOutputPayload = {
  scriptId: string;
  runId: string;
  stream: "stdout" | "stderr";
  content: string;
};

export type ThemeMode = "light" | "dark";
