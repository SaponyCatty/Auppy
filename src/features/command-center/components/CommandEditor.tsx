import Editor from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";
import { Copy, Loader2, Play, Square, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { defaultWorkspaceName } from "../constants";
import { fieldClass, labelClass, mutedTextClass, primaryTextClass, selectClass } from "../styles";
import type { ScriptForm, ThemeMode } from "../types";

type CommandEditorProps = {
  categories: string[];
  currentRunning: boolean;
  duplicating: boolean;
  form: ScriptForm;
  loadingDetail: boolean;
  saving: boolean;
  selectedId: string | null;
  theme: ThemeMode;
  workspaces: string[];
  onDelete: () => void;
  onDetectPython: () => void;
  onDuplicate: () => void;
  onRun: () => void;
  onSetFormField: <Key extends keyof ScriptForm>(key: Key, value: ScriptForm[Key]) => void;
  onStop: () => void;
};

export function CommandEditor({
  categories,
  currentRunning,
  duplicating,
  form,
  loadingDetail,
  saving,
  selectedId,
  theme,
  workspaces,
  onDelete,
  onDetectPython,
  onDuplicate,
  onRun,
  onSetFormField,
  onStop,
}: CommandEditorProps) {
  const workspaceOptions =
    workspaces.length > 0 ? workspaces : [form.workspace || defaultWorkspaceName];

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#e7edf5] dark:bg-[#101218]">
      <div className="border-b border-[#ced8e7] bg-[#eef3fa] p-3 shadow-sm shadow-[#1f2937]/5 dark:border-[#2d3442] dark:bg-[#171a22] dark:shadow-black/20">
        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(220px,340px)]">
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_150px_160px_170px_170px]">
            <div className="space-y-1">
              <Label htmlFor="script-name" className={labelClass}>
                Name
              </Label>
              <Input
                id="script-name"
                className={fieldClass}
                value={form.name}
                onChange={(event) => onSetFormField("name", event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="script-workspace" className={labelClass}>
                Workspace
              </Label>
              <select
                id="script-workspace"
                className={cn("w-full", selectClass)}
                value={form.workspace}
                onChange={(event) => onSetFormField("workspace", event.target.value)}
              >
                {workspaceOptions.map((workspace) => (
                  <option key={workspace} value={workspace}>
                    {workspace}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="script-category" className={labelClass}>
                Folder
              </Label>
              <select
                id="script-category"
                className={cn("w-full", selectClass)}
                value={form.category}
                onChange={(event) => onSetFormField("category", event.target.value)}
              >
                <option value="">No folder</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="script-tags" className={labelClass}>
                Tags
              </Label>
              <Input
                id="script-tags"
                className={fieldClass}
                value={form.tagsText}
                onChange={(event) => onSetFormField("tagsText", event.target.value)}
                placeholder="Comma separated"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="timeout-seconds" className={labelClass}>
                Timeout
              </Label>
              <Input
                id="timeout-seconds"
                className={fieldClass}
                min={1}
                max={3600}
                type="number"
                value={form.timeoutSeconds}
                onChange={(event) => onSetFormField("timeoutSeconds", Number(event.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="output-limit" className={labelClass}>
                Output limit
              </Label>
              <Input
                id="output-limit"
                className={fieldClass}
                min={1024}
                max={1048576}
                type="number"
                value={form.outputLimitBytes}
                onChange={(event) =>
                  onSetFormField("outputLimitBytes", Number(event.target.value))
                }
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px] 2xl:grid-cols-1">
            <div className="space-y-1">
              <Label htmlFor="python-interpreter" className={labelClass}>
                Python
              </Label>
              <div className="flex gap-2">
                <Input
                  id="python-interpreter"
                  className={fieldClass}
                  value={form.interpreterPath}
                  onChange={(event) => onSetFormField("interpreterPath", event.target.value)}
                />
                <Button variant="outline" onClick={onDetectPython}>
                  Detect
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="working-directory" className={labelClass}>
                Working directory
              </Label>
              <Input
                id="working-directory"
                className={fieldClass}
                placeholder="Optional"
                value={form.workingDirectory}
                onChange={(event) => onSetFormField("workingDirectory", event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className={cn("flex items-center gap-2 text-sm", primaryTextClass)}>
              <Switch
                checked={form.runOnAppStart}
                onCheckedChange={(checked) => onSetFormField("runOnAppStart", checked)}
              />
              Run on app start
            </label>
            <label className={cn("flex items-center gap-2 text-sm", primaryTextClass)}>
              <Switch
                checked={form.isEnabled}
                onCheckedChange={(checked) => onSetFormField("isEnabled", checked)}
              />
              Enabled
            </label>
            <label className={cn("flex items-center gap-2 text-sm", primaryTextClass)}>
              <Switch
                checked={form.isTrusted}
                onCheckedChange={(checked) => onSetFormField("isTrusted", checked)}
              />
              Trusted
            </label>
            <Button
              variant={form.isFavorite ? "default" : "outline"}
              size="sm"
              onClick={() => onSetFormField("isFavorite", !form.isFavorite)}
            >
              <Star className={cn(form.isFavorite && "fill-current")} />
              Favorite
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {currentRunning ? (
              <Button variant="destructive" onClick={onStop}>
                <Square />
                Stop
              </Button>
            ) : (
              <Button
                onClick={onRun}
                disabled={saving || !form.isEnabled}
                className="bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
              >
                <Play />
                Run
              </Button>
            )}
            <Button
              variant="destructive"
              size="icon"
              onClick={onDelete}
              disabled={!selectedId || currentRunning}
              title="Delete command"
            >
              <Trash2 />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onDuplicate}
              disabled={!selectedId || duplicating || currentRunning}
              title="Duplicate command"
            >
              {duplicating ? <Loader2 className="animate-spin" /> : <Copy />}
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-[#f6f8fc] dark:bg-[#151923]">
        {loadingDetail ? (
          <div className={cn("flex h-full items-center justify-center text-sm", mutedTextClass)}>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading script
          </div>
        ) : (
          <Editor
            height="100%"
            defaultLanguage="python"
            beforeMount={configureMonacoTheme}
            theme={theme === "dark" ? "auppy-dark" : "auppy-light"}
            value={form.content}
            onChange={(value) => onSetFormField("content", value ?? "")}
            options={{
              automaticLayout: true,
              fontFamily: "Geist Mono, Menlo, Monaco, Consolas, monospace",
              fontSize: 14,
              minimap: { enabled: false },
              padding: { top: 16, bottom: 16 },
              scrollBeyondLastLine: false,
              tabSize: 4,
            }}
          />
        )}
      </div>
    </section>
  );
}

function configureMonacoTheme(monaco: Monaco) {
  monaco.editor.defineTheme("auppy-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#f6f8fc",
      "editor.foreground": "#182033",
      "editorLineNumber.foreground": "#7c8ba1",
      "editor.lineHighlightBackground": "#e6edf7",
      "editorCursor.foreground": "#2563eb",
      "editorIndentGuide.background1": "#d9e0eb",
      "editorIndentGuide.activeBackground1": "#b8c5d8",
    },
  });

  monaco.editor.defineTheme("auppy-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#151923",
      "editor.foreground": "#e6ebf5",
      "editorLineNumber.foreground": "#707b91",
      "editor.lineHighlightBackground": "#1d2430",
      "editorCursor.foreground": "#77a3ff",
      "editorIndentGuide.background1": "#2d3442",
      "editorIndentGuide.activeBackground1": "#465268",
    },
  });
}
