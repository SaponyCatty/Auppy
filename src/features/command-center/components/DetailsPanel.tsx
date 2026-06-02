import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  History,
  Loader2,
  RotateCcw,
  RotateCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { PythonInterpreter, ScriptRun, ScriptVersion } from "@/lib/tauri";
import { cn } from "@/lib/utils";

import {
  fieldClass,
  mutedTextClass,
  panelClass,
  panelHeaderClass,
  primaryTextClass,
  selectClass,
} from "../styles";
import type { SafetyView, ScriptForm } from "../types";
import {
  formatDate,
  formatDuration,
  safetyClass,
  shortPath,
  statusClass,
} from "../utils";

type DetailsPanelProps = {
  backupBusy: boolean;
  backupJson: string;
  currentRunning: boolean;
  defaultPython: string;
  displayedOutput: string;
  displayedRunLabel: string;
  displayedStatus: string | null;
  form: ScriptForm;
  interpreters: PythonInterpreter[];
  latestRun: ScriptRun | null;
  restoringId: string | null;
  rightPanelOpen: boolean;
  runs: ScriptRun[];
  safety: SafetyView;
  saving: boolean;
  selectedLiveOutput: string;
  versions: ScriptVersion[];
  onClearOutput: () => void;
  onExportJson: () => void;
  onExportLibraryFile: () => void;
  onImportJson: () => void;
  onImportLibraryFile: () => void;
  onRestore: (version: ScriptVersion) => void;
  onRun: () => void;
  onSetBackupJson: (value: string) => void;
  onUseInterpreter: (path: string) => void;
};

export function DetailsPanel({
  backupBusy,
  backupJson,
  currentRunning,
  defaultPython,
  displayedOutput,
  displayedRunLabel,
  displayedStatus,
  form,
  interpreters,
  latestRun,
  restoringId,
  rightPanelOpen,
  runs,
  safety,
  saving,
  selectedLiveOutput,
  versions,
  onClearOutput,
  onExportJson,
  onExportLibraryFile,
  onImportJson,
  onImportLibraryFile,
  onRestore,
  onRun,
  onSetBackupJson,
  onUseInterpreter,
}: DetailsPanelProps) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#e7edf5] transition-opacity duration-200 dark:bg-[#101218]",
        rightPanelOpen ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#ced8e7] bg-[#eef3fa] px-3 dark:border-[#2d3442] dark:bg-[#171a22]">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md border border-[#d3deee] bg-[#f8fbff] text-[#2563eb] dark:border-[#343c4d] dark:bg-[#1b1f2a] dark:text-[#77a3ff]">
            <Activity className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className={cn("truncate text-sm font-semibold", primaryTextClass)}>
              Monitoring
            </h2>
            <p className={cn("truncate text-xs", mutedTextClass)}>
              {displayedStatus ? displayedStatus : "Idle"}
            </p>
          </div>
        </div>
        {currentRunning ? (
          <Badge
            variant="outline"
            className="border-[#c9d8ff] bg-[#eef4ff] text-[#1d4ed8] dark:border-[#29446f] dark:bg-[#17243a] dark:text-[#93b4ff]"
          >
            Live
          </Badge>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          <section className={panelClass}>
            <div className={panelHeaderClass}>
              <div>
                <p className={cn("text-xs font-medium uppercase tracking-[0.12em]", mutedTextClass)}>
                  Run Output
                </p>
                <p className={cn("text-sm font-medium", primaryTextClass)}>
                  {displayedRunLabel}
                </p>
              </div>
              {displayedStatus ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    title="Run again"
                    onClick={onRun}
                    disabled={saving || currentRunning || !form.isEnabled}
                  >
                    <RotateCw />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    title="Clear output view"
                    onClick={onClearOutput}
                    disabled={!latestRun && !selectedLiveOutput}
                  >
                    <Trash2 />
                  </Button>
                  <Badge variant="outline" className={statusClass(displayedStatus)}>
                    {statusIcon(displayedStatus)}
                    {displayedStatus}
                  </Badge>
                </div>
              ) : null}
            </div>
            <pre className="max-h-[46vh] min-h-64 overflow-auto whitespace-pre-wrap break-all bg-[#111827] p-3 font-mono text-xs leading-5 text-[#e5e7eb] dark:bg-[#090b10]">
              {displayedOutput}
            </pre>
          </section>

          <section className="min-w-0 space-y-2">
            <p className={cn("text-xs font-medium uppercase tracking-[0.12em]", mutedTextClass)}>
              History
            </p>
            {runs.map((run) => (
              <div key={run.id} className={cn(panelClass, "p-3")}>
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-sm", primaryTextClass)}>
                    {formatDate(run.started_at)}
                  </span>
                  <Badge variant="outline" className={statusClass(run.status)}>
                    {run.status}
                  </Badge>
                </div>
                <p className={cn("mt-2 text-xs", mutedTextClass)}>
                  {formatDuration(run.duration_ms)} / exit {run.exit_code ?? "none"}
                </p>
              </div>
            ))}
          </section>

          <section className={panelClass}>
            <div className={panelHeaderClass}>
              <div className={cn("flex items-center gap-2 text-sm", primaryTextClass)}>
                {safety.level === "low" ? (
                  <ShieldCheck className="size-4 text-[#34a853]" />
                ) : (
                  <AlertTriangle className="size-4 text-[#fbbc04]" />
                )}
                Safety
              </div>
              <Badge variant="outline" className={safetyClass(safety.level)}>
                {safety.level}
              </Badge>
            </div>
            <div className={cn("space-y-2 p-3 text-xs leading-5", primaryTextClass)}>
              {safety.warnings.length > 0 ? (
                safety.warnings.map((warning) => (
                    <p key={warning} className="rounded-md bg-[#e8eef7] px-2 py-1 dark:bg-[#121620]">
                    {warning}
                  </p>
                ))
              ) : (
                <p className="rounded-md bg-[#e8eef7] px-2 py-1 dark:bg-[#121620]">
                  No risky patterns detected.
                </p>
              )}
            </div>
          </section>

          <section className={panelClass}>
            <div className={cn(panelHeaderClass, "justify-start text-sm", primaryTextClass)}>
              <Settings2 className="size-4 text-[#64748b] dark:text-[#aeb8c8]" />
              Python
            </div>
            <div className="space-y-2 p-3">
              <select
                className={cn("w-full", selectClass)}
                value={form.interpreterPath}
                onChange={(event) => onUseInterpreter(event.target.value)}
              >
                <option value={form.interpreterPath}>{form.interpreterPath}</option>
                {interpreters.map((interpreter) => (
                  <option key={interpreter.path} value={interpreter.path}>
                    {interpreter.version ?? "Python"} - {interpreter.path}
                  </option>
                ))}
              </select>
              <p className={cn("text-xs", mutedTextClass)}>
                Default: {shortPath(defaultPython)}
              </p>
            </div>
          </section>

          <section className={panelClass}>
            <div className={panelHeaderClass}>
              <div className={cn("flex items-center gap-2 text-sm", primaryTextClass)}>
                <Download className="size-4 text-[#64748b] dark:text-[#aeb8c8]" />
                Backup
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={onExportLibraryFile} disabled={backupBusy}>
                  <Download />
                  Export
                </Button>
                <Button variant="outline" size="sm" onClick={onImportLibraryFile} disabled={backupBusy}>
                  <Upload />
                  Import
                </Button>
              </div>
            </div>
            <div className="p-3">
              <Textarea
                className={cn("min-h-28 font-mono text-xs", fieldClass)}
                placeholder="Backup JSON can be copied here for manual transfer."
                value={backupJson}
                onChange={(event) => onSetBackupJson(event.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onExportJson} disabled={backupBusy}>
                  <Copy />
                  Copy JSON
                </Button>
                <Button variant="outline" size="sm" onClick={onImportJson} disabled={backupBusy}>
                  <Upload />
                  Import JSON
                </Button>
              </div>
            </div>
          </section>

          <Separator className="bg-[#ced8e7] dark:bg-[#2d3442]" />

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <History className="size-4 text-[#64748b] dark:text-[#aeb8c8]" />
              <p className={cn("text-xs font-medium uppercase tracking-[0.12em]", mutedTextClass)}>
                Versions
              </p>
            </div>
            {versions.length === 0 ? (
              <p className={cn(panelClass, "p-3 text-xs", mutedTextClass)}>
                Edit this command to create version history.
              </p>
            ) : null}
            {versions.map((version) => (
              <div key={version.id} className={cn(panelClass, "p-3")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm", primaryTextClass)}>{version.reason}</p>
                    <p className={cn("mt-1 text-xs", mutedTextClass)}>
                      {formatDate(version.created_at)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    title="Restore version"
                    onClick={() => onRestore(version)}
                    disabled={restoringId === version.id || currentRunning}
                  >
                    {restoringId === version.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}

function statusIcon(status: string) {
  if (status === "success") {
    return <CheckCircle2 className="size-3" />;
  }

  if (status === "running") {
    return <Loader2 className="size-3 animate-spin" />;
  }

  return <Clock3 className="size-3" />;
}
