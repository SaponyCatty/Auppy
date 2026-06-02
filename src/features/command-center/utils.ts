import type { FolderRecord, ScriptDetail, ScriptRecord, ScriptRun } from "@/lib/tauri";

import {
  defaultOutputLimitBytes,
  defaultTimeoutSeconds,
  defaultWorkspaceName,
  initialScriptDefaults,
  starterCode,
  themeStorageKey,
} from "./constants";
import type { NewScriptDefaults, SafetyView, ScriptForm, ThemeMode } from "./types";

export function emptyForm(
  interpreterPath = "python3",
  defaults: NewScriptDefaults = initialScriptDefaults,
  workspace = defaults.workspace || defaultWorkspaceName,
): ScriptForm {
  return {
    name: "Untitled",
    content: starterCode,
    interpreterPath,
    workingDirectory: "",
    workspace,
    runOnAppStart: false,
    isEnabled: true,
    timeoutSeconds: defaults.timeoutSeconds,
    outputLimitBytes: defaults.outputLimitBytes,
    isTrusted: false,
    category: defaults.category,
    tagsText: defaults.tagsText,
    isFavorite: false,
  };
}

export function formFromScript(script: ScriptDetail): ScriptForm {
  return {
    name: script.name,
    content: script.content,
    interpreterPath: script.interpreter_path,
    workingDirectory: script.working_directory ?? "",
    workspace: script.workspace || defaultWorkspaceName,
    runOnAppStart: script.run_on_app_start,
    isEnabled: script.is_enabled,
    timeoutSeconds: script.timeout_seconds,
    outputLimitBytes: script.output_limit_bytes,
    isTrusted: script.is_trusted,
    category: script.category ?? "",
    tagsText: script.tags.join(", "),
    isFavorite: script.is_favorite,
  };
}

export function scanSafety(form: ScriptForm): SafetyView {
  const content = form.content.toLowerCase();
  const warnings: string[] = [];
  let highRisk = false;
  let mediumRisk = false;

  if (
    includesAny(content, [
      "rm -rf",
      "shutil.rmtree",
      "os.remove",
      "os.unlink",
      ".unlink(",
      ".rmdir(",
    ])
  ) {
    warnings.push("Deletes files or directories");
    highRisk = true;
  }

  if (
    includesAny(content, [
      "subprocess.",
      "os.system",
      "os.popen",
      "shell=true",
      "pty.spawn",
    ])
  ) {
    warnings.push("Runs shell commands or child processes");
    highRisk = true;
  }

  if (
    includesAny(content, [
      "socket.",
      "requests.",
      "urllib.request",
      "http.client",
      "ftplib.",
      "smtplib.",
    ])
  ) {
    warnings.push("May access the network");
    mediumRisk = true;
  }

  if (form.runOnAppStart && !form.isTrusted) {
    warnings.push("Runs on app start before being marked trusted");
    mediumRisk = true;
  }

  if (form.runOnAppStart && highRisk) {
    warnings.push("Auto-run is enabled for a high-risk script");
  }

  return {
    level: highRisk ? "high" : mediumRisk ? "medium" : "low",
    warnings,
  };
}

export function uniqueCategories(
  scripts: ScriptRecord[],
  folders: FolderRecord[],
  workspace = defaultWorkspaceName,
) {
  return Array.from(
    new Set(
      [
        ...folders
          .filter((folder) => folder.workspace === workspace)
          .map((folder) => folder.name.trim()),
        ...scripts
          .filter((script) => script.workspace === workspace)
          .map((script) => script.category?.trim() ?? ""),
      ].filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function filterScripts(
  scripts: ScriptRecord[],
  searchQuery: string,
  favoritesOnly: boolean,
) {
  const query = searchQuery.trim().toLowerCase();

  return scripts.filter((script) => {
    const category = script.category?.trim() || "No folder";
    const matchesFavorite = !favoritesOnly || script.is_favorite;
    const searchable = [
      script.name,
      script.workspace,
      category,
      script.interpreter_path,
      script.working_directory ?? "",
      ...script.tags,
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = query === "" || searchable.includes(query);

    return matchesFavorite && matchesQuery;
  });
}

export function parseTags(value: string) {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function buildScriptInput(form: ScriptForm, defaultPython: string) {
  return {
    name: form.name,
    content: form.content,
    interpreterPath: form.interpreterPath || defaultPython || "python3",
    workingDirectory: form.workingDirectory || null,
    workspace: form.workspace || defaultWorkspaceName,
    runOnAppStart: form.runOnAppStart,
    isEnabled: form.isEnabled,
    timeoutSeconds: form.timeoutSeconds,
    outputLimitBytes: form.outputLimitBytes,
    isTrusted: form.isTrusted,
    category: form.category || null,
    tags: parseTags(form.tagsText),
    isFavorite: form.isFavorite,
  };
}

export function statusClass(status: string) {
  if (status === "success") {
    return "border-[#34a853]/30 bg-[#e6f4ea] text-[#137333] dark:bg-[#1e3a29] dark:text-[#81c995]";
  }

  if (status === "canceled") {
    return "border-[#d9e0eb] bg-[#e9eef6] text-[#657386] dark:border-[#2d3442] dark:bg-[#222836] dark:text-[#9aa6ba]";
  }

  if (status === "failed" || status === "error" || status === "timeout") {
    return "border-[#ea4335]/30 bg-[#fce8e6] text-[#c5221f] dark:bg-[#3c1f1e] dark:text-[#f28b82]";
  }

  return "border-[#fbbc04]/30 bg-[#fef7e0] text-[#b06000] dark:bg-[#3f3014] dark:text-[#fdd663]";
}

export function safetyClass(status: string) {
  if (status === "low") {
    return "border-[#34a853]/30 bg-[#e6f4ea] text-[#137333] dark:bg-[#1e3a29] dark:text-[#81c995]";
  }

  if (status === "high") {
    return "border-[#ea4335]/30 bg-[#fce8e6] text-[#c5221f] dark:bg-[#3c1f1e] dark:text-[#f28b82]";
  }

  return "border-[#fbbc04]/30 bg-[#fef7e0] text-[#b06000] dark:bg-[#3f3014] dark:text-[#fdd663]";
}

export function outputText(run: ScriptRun) {
  const parts = [run.stdout, run.stderr, run.error_message].filter(Boolean);

  if (run.stdout_truncated) {
    parts.push("[stdout was truncated by the output limit]");
  }

  if (run.stderr_truncated) {
    parts.push("[stderr was truncated by the output limit]");
  }

  return parts.join("\n") || "No output.";
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatTimeOnly(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDuration(value?: number | null) {
  if (value == null) {
    return "duration pending";
  }

  if (value < 1000) {
    return `${value} ms`;
  }

  return `${(value / 1000).toFixed(1)} sec`;
}

export function shortPath(value: string) {
  const parts = value.split("/");
  return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : value;
}

export function numericSetting(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function clampInteger(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

export function readStoredTheme(): ThemeMode {
  const stored = window.localStorage.getItem(themeStorageKey);
  return stored === "dark" ? "dark" : "light";
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

export { defaultOutputLimitBytes, defaultTimeoutSeconds };
