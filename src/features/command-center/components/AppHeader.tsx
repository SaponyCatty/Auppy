import {
  CheckCircle2,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Settings2,
  Sun,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ThemeMode } from "../types";
import { formatTimeOnly } from "../utils";

type AppHeaderProps = {
  autoSaving: boolean;
  dirty: boolean;
  lastSavedAt: string | null;
  notice: string | null;
  rightPanelOpen: boolean;
  theme: ThemeMode;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onTogglePanel: () => void;
  onToggleTheme: () => void;
};

export function AppHeader({
  autoSaving,
  dirty,
  lastSavedAt,
  notice,
  rightPanelOpen,
  theme,
  onOpenSettings,
  onRefresh,
  onTogglePanel,
  onToggleTheme,
}: AppHeaderProps) {
  const saveStatus = autoSaving
    ? "Saving..."
    : dirty
      ? "Unsaved changes"
      : lastSavedAt
        ? `Saved ${formatTimeOnly(lastSavedAt)}`
        : "Auto-save on";

  return (
    <header className="flex h-12 items-center justify-between gap-4 border-b border-[#ced8e7] bg-[#f7faff]/95 px-3 shadow-sm shadow-[#1f2937]/5 backdrop-blur dark:border-[#2b3447] dark:bg-[#151922]/95 dark:shadow-black/20">
      <div className="flex min-w-0 flex-1 items-center">
        {notice ? (
          <span className="max-w-[34vw] truncate rounded-full border border-[#c9d8ff] bg-[#eef4ff] px-3 py-1.5 text-xs font-medium text-[#1d4ed8] shadow-sm dark:border-[#29446f] dark:bg-[#17243a] dark:text-[#93b4ff]">
            {notice}
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex max-w-[34vw] items-center gap-2 truncate rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm",
              dirty
                ? "border-[#f5d08a] bg-[#fff8e6] text-[#9a5b00] dark:border-[#66502a] dark:bg-[#2a2112] dark:text-[#ffd58a]"
                : "border-[#cfe5d7] bg-[#edf8f0] text-[#137333] dark:border-[#274c36] dark:bg-[#132319] dark:text-[#81c995]",
            )}
          >
            {dirty ? <Zap className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
            {saveStatus}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="icon" title="Refresh library" onClick={onRefresh}>
          <RefreshCw />
        </Button>
        <Button
          variant="outline"
          size="icon"
          title={theme === "dark" ? "Use light mode" : "Use dark mode"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          title={rightPanelOpen ? "Hide monitoring panel" : "Show monitoring panel"}
          onClick={onTogglePanel}
        >
          {rightPanelOpen ? <PanelRightClose /> : <PanelRightOpen />}
        </Button>
        <Button variant="outline" size="icon" title="Settings" onClick={onOpenSettings}>
          <Settings2 />
        </Button>
      </div>
    </header>
  );
}
