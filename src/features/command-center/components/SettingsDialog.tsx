import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PythonInterpreter } from "@/lib/tauri";
import { cn } from "@/lib/utils";

import { defaultWorkspaceName } from "../constants";
import { fieldClass, labelClass, mutedTextClass, selectClass } from "../styles";
import type { SettingsForm } from "../types";

type SettingsDialogProps = {
  interpreters: PythonInterpreter[];
  open: boolean;
  saving: boolean;
  settingsForm: SettingsForm;
  workspaces: string[];
  onDetectPython: () => void;
  onOpenChange: (open: boolean) => void;
  onSetField: <Key extends keyof SettingsForm>(key: Key, value: SettingsForm[Key]) => void;
};

export function SettingsDialog({
  interpreters,
  open,
  saving,
  settingsForm,
  workspaces,
  onDetectPython,
  onOpenChange,
  onSetField,
}: SettingsDialogProps) {
  const workspaceOptions =
    workspaces.length > 0 ? workspaces : [settingsForm.workspace || defaultWorkspaceName];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-[#ced8e7] bg-[#f8fbff] text-[#182033] shadow-xl shadow-[#1f2937]/10 sm:max-w-xl dark:border-[#2d3442] dark:bg-[#1b1f2a] dark:text-[#e6ebf5] dark:shadow-black/30">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className={mutedTextClass}>
            Defaults used when creating new Python commands.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="settings-python" className={labelClass}>
              Default Python
            </Label>
            <div className="flex gap-2">
              <Input
                id="settings-python"
                className={fieldClass}
                value={settingsForm.python}
                onChange={(event) => onSetField("python", event.target.value)}
              />
              <Button variant="outline" onClick={onDetectPython}>
                Detect
              </Button>
            </div>
            {interpreters.length > 0 ? (
              <select
                className={cn("w-full", selectClass)}
                value={settingsForm.python}
                onChange={(event) => onSetField("python", event.target.value)}
              >
                <option value={settingsForm.python}>{settingsForm.python}</option>
                {interpreters.map((interpreter) => (
                  <option key={interpreter.path} value={interpreter.path}>
                    {interpreter.version ?? "Python"} - {interpreter.path}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="settings-timeout" className={labelClass}>
                Default timeout
              </Label>
              <Input
                id="settings-timeout"
                className={fieldClass}
                min={1}
                max={3600}
                type="number"
                value={settingsForm.timeoutSeconds}
                onChange={(event) => onSetField("timeoutSeconds", Number(event.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="settings-output-limit" className={labelClass}>
                Default output limit
              </Label>
              <Input
                id="settings-output-limit"
                className={fieldClass}
                min={1024}
                max={1048576}
                type="number"
                value={settingsForm.outputLimitBytes}
                onChange={(event) => onSetField("outputLimitBytes", Number(event.target.value))}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="settings-workspace" className={labelClass}>
                Default workspace
              </Label>
              <select
                id="settings-workspace"
                className={cn("w-full", selectClass)}
                value={settingsForm.workspace}
                onChange={(event) => onSetField("workspace", event.target.value)}
              >
                {workspaceOptions.map((workspace) => (
                  <option key={workspace} value={workspace}>
                    {workspace}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="settings-category" className={labelClass}>
                Default folder
              </Label>
              <Input
                id="settings-category"
                className={fieldClass}
                value={settingsForm.category}
                onChange={(event) => onSetField("category", event.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="settings-tags" className={labelClass}>
                Default tags
              </Label>
              <Input
                id="settings-tags"
                className={fieldClass}
                value={settingsForm.tagsText}
                onChange={(event) => onSetField("tagsText", event.target.value)}
                placeholder="Comma separated"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="border-[#ced8e7] bg-[#e7edf5] dark:border-[#2d3442] dark:bg-[#171a22]">
          <div className={cn("flex min-w-0 flex-1 items-center gap-2 text-xs", mutedTextClass)}>
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Auto-saving
              </>
            ) : (
              "Auto-saved"
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
