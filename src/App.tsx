import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { AppHeader } from "@/features/command-center/components/AppHeader";
import { CommandEditor } from "@/features/command-center/components/CommandEditor";
import { DetailsPanel } from "@/features/command-center/components/DetailsPanel";
import { LibrarySidebar } from "@/features/command-center/components/LibrarySidebar";
import { SettingsDialog } from "@/features/command-center/components/SettingsDialog";
import { useCommandCenter } from "@/features/command-center/useCommandCenter";
import { cn } from "@/lib/utils";

const leftPanelStorageKey = "auppy:left-panel-width";
const rightPanelStorageKey = "auppy:right-panel-width";
const defaultLeftPanelWidth = 300;
const defaultRightPanelWidth = 420;
const minLeftPanelWidth = 220;
const maxLeftPanelWidth = 460;
const minRightPanelWidth = 320;
const maxRightPanelWidth = 640;
const minEditorWidth = 520;
const splitterWidth = 7;

type ResizeTarget = "left" | "right";

export default function App() {
  const shellRef = useRef<HTMLElement | null>(null);
  const sizesRef = useRef({
    leftPanelWidth: defaultLeftPanelWidth,
    rightPanelOpen: true,
    rightPanelWidth: defaultRightPanelWidth,
  });
  const [leftPanelWidth, setLeftPanelWidth] = useState(() =>
    clamp(
      readStoredPanelWidth(leftPanelStorageKey, defaultLeftPanelWidth),
      minLeftPanelWidth,
      maxLeftPanelWidth,
    ),
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    clamp(
      readStoredPanelWidth(rightPanelStorageKey, defaultRightPanelWidth),
      minRightPanelWidth,
      maxRightPanelWidth,
    ),
  );
  const [activeResize, setActiveResize] = useState<ResizeTarget | null>(null);
  const {
    activeWorkspace,
    autoSaving,
    backupBusy,
    backupJson,
    bulkBusy,
    bulkCategory,
    bulkTagsText,
    categories,
    creatingFolder,
    currentRunning,
    defaultPython,
    dirty,
    displayedOutput,
    displayedRunLabel,
    displayedStatus,
    deletingLibraryItem,
    duplicating,
    favoritesOnly,
    filteredScripts,
    folders,
    form,
    handleBulkApply,
    handleBulkCopyJson,
    handleBulkDelete,
    handleBulkExportFile,
    handleClearOutput,
    handleCreateFolder,
    handleCreateWorkspace,
    handleDelete,
    handleDeleteFolder,
    handleDeleteWorkspace,
    handleDetectPython,
    handleDuplicate,
    handleExportLibraryFile,
    handleExportLibraryJson,
    handleImportLibraryFile,
    handleImportLibraryJson,
    handleMoveFolder,
    handleMoveScript,
    handleNew,
    handleRenameFolder,
    handleRestore,
    handleRun,
    handleStop,
    handleUseInterpreter,
    interpreters,
    lastSavedAt,
    latestRun,
    loadingDetail,
    loadingLibrary,
    newFolderName,
    newWorkspaceName,
    notice,
    openSettings,
    refreshScripts,
    restoringId,
    rightPanelOpen,
    runs,
    safety,
    saving,
    savingSettings,
    scripts,
    searchQuery,
    selectedId,
    selectedIds,
    selectedIdsArray,
    selectedLiveOutput,
    setActiveWorkspace,
    setBackupJson,
    setBulkCategory,
    setBulkTagsText,
    setFavoritesOnly,
    setFormField,
    setNewFolderName,
    setNewWorkspaceName,
    setSearchQuery,
    setSelectedId,
    setSelectedIds,
    setSettingsField,
    setSettingsOpen,
    settingsForm,
    settingsOpen,
    theme,
    toggleRightPanel,
    toggleScriptSelection,
    toggleTheme,
    versions,
    workspaces,
  } = useCommandCenter();

  sizesRef.current = {
    leftPanelWidth,
    rightPanelOpen,
    rightPanelWidth,
  };

  useEffect(() => {
    window.localStorage.setItem(leftPanelStorageKey, String(Math.round(leftPanelWidth)));
  }, [leftPanelWidth]);

  useEffect(() => {
    window.localStorage.setItem(rightPanelStorageKey, String(Math.round(rightPanelWidth)));
  }, [rightPanelWidth]);

  useEffect(() => {
    if (!activeResize) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(event: PointerEvent) {
      const shell = shellRef.current;
      if (!shell) {
        return;
      }

      const rect = shell.getBoundingClientRect();
      const { leftPanelWidth, rightPanelOpen, rightPanelWidth } = sizesRef.current;
      const activeSplitterSpace = rightPanelOpen ? splitterWidth * 2 : splitterWidth;

      if (activeResize === "left") {
        const maxAllowed = Math.min(
          maxLeftPanelWidth,
          Math.max(
            minLeftPanelWidth,
            rect.width -
              (rightPanelOpen ? rightPanelWidth : 0) -
              activeSplitterSpace -
              minEditorWidth,
          ),
        );
        const nextWidth = clamp(event.clientX - rect.left, minLeftPanelWidth, maxAllowed);
        setLeftPanelWidth(nextWidth);
        return;
      }

      const maxAllowed = Math.min(
        maxRightPanelWidth,
        Math.max(
          minRightPanelWidth,
          rect.width - leftPanelWidth - activeSplitterSpace - minEditorWidth,
        ),
      );
      const nextWidth = clamp(rect.right - event.clientX, minRightPanelWidth, maxAllowed);
      setRightPanelWidth(nextWidth);
    }

    function finishResize() {
      setActiveResize(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [activeResize]);

  const gridTemplateColumns = useMemo(
    () =>
      [
        `${leftPanelWidth}px`,
        `${splitterWidth}px`,
        "minmax(0, 1fr)",
        rightPanelOpen ? `${splitterWidth}px` : "0px",
        rightPanelOpen ? `${rightPanelWidth}px` : "0px",
      ].join(" "),
    [leftPanelWidth, rightPanelOpen, rightPanelWidth],
  );

  function beginPanelResize(target: ResizeTarget, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    setActiveResize(target);
  }

  return (
    <main
      className={cn(
        "h-screen overflow-hidden",
        theme === "dark"
          ? "dark bg-[#101218] text-[#e6ebf5]"
          : "bg-[#e7edf5] text-[#182033]",
      )}
    >
      <AppHeader
        autoSaving={autoSaving}
        dirty={dirty}
        lastSavedAt={lastSavedAt}
        notice={notice}
        rightPanelOpen={rightPanelOpen}
        theme={theme}
        onOpenSettings={openSettings}
        onRefresh={() => void refreshScripts()}
        onTogglePanel={toggleRightPanel}
        onToggleTheme={toggleTheme}
      />

      <section
        ref={shellRef}
        className={cn(
          "relative grid h-[calc(100vh-3rem)] overflow-hidden bg-[#dfe7f2] dark:bg-[#0f1117]",
          activeResize
            ? "select-none"
            : "transition-[grid-template-columns] duration-200 ease-out",
        )}
        style={{ gridTemplateColumns }}
      >
        <div className="min-h-0 min-w-0 overflow-hidden">
          <LibrarySidebar
            activeWorkspace={activeWorkspace}
            bulkBusy={bulkBusy}
            bulkCategory={bulkCategory}
            bulkTagsText={bulkTagsText}
            creatingFolder={creatingFolder}
            deletingLibraryItem={deletingLibraryItem}
            favoritesOnly={favoritesOnly}
            filteredScripts={filteredScripts}
            folders={folders}
            loadingLibrary={loadingLibrary}
            newFolderName={newFolderName}
            newWorkspaceName={newWorkspaceName}
            saving={saving}
            scripts={scripts}
            searchQuery={searchQuery}
            selectedId={selectedId}
            selectedIds={selectedIds}
            selectedIdsArray={selectedIdsArray}
            workspaces={workspaces}
            onBulkApply={() => void handleBulkApply()}
            onBulkCopyJson={() => void handleBulkCopyJson()}
            onBulkDelete={() => void handleBulkDelete()}
            onBulkExportFile={() => void handleBulkExportFile()}
            onCreateFolder={() => void handleCreateFolder()}
            onCreateWorkspace={() => void handleCreateWorkspace()}
            onDeleteFolder={(workspace, folder) => void handleDeleteFolder(workspace, folder)}
            onDeleteWorkspace={(workspace) => void handleDeleteWorkspace(workspace)}
            onMoveFolder={(workspace, folder, targetWorkspace) =>
              void handleMoveFolder(workspace, folder, targetWorkspace)
            }
            onMoveScript={(scriptId, workspace, folder) =>
              void handleMoveScript(scriptId, workspace, folder)
            }
            onNewCommand={() => void handleNew()}
            onRenameFolder={(workspace, folder, newName) =>
              void handleRenameFolder(workspace, folder, newName)
            }
            onSelectScript={setSelectedId}
            onSetActiveWorkspace={setActiveWorkspace}
            onSetBulkCategory={setBulkCategory}
            onSetBulkTagsText={setBulkTagsText}
            onSetFavoritesOnly={setFavoritesOnly}
            onSetNewFolderName={setNewFolderName}
            onSetNewWorkspaceName={setNewWorkspaceName}
            onSetSearchQuery={setSearchQuery}
            onSetSelectedIds={setSelectedIds}
            onToggleScriptSelection={toggleScriptSelection}
          />
        </div>

        <PanelResizer
          active={activeResize === "left"}
          label="Resize directories panel"
          onPointerDown={(event) => beginPanelResize("left", event)}
        />

        <div className="min-h-0 min-w-0 overflow-hidden">
          <CommandEditor
            categories={categories}
          currentRunning={currentRunning}
          duplicating={duplicating}
          form={form}
          loadingDetail={loadingDetail}
          saving={saving || autoSaving}
          selectedId={selectedId}
          theme={theme}
          workspaces={workspaces.map((workspace) => workspace.name)}
          onDelete={() => void handleDelete()}
          onDetectPython={() => void handleDetectPython()}
          onDuplicate={() => void handleDuplicate()}
          onRun={() => void handleRun()}
          onSetFormField={setFormField}
          onStop={() => void handleStop()}
        />
        </div>

        <PanelResizer
          active={activeResize === "right"}
          hidden={!rightPanelOpen}
          label="Resize monitoring panel"
          onPointerDown={(event) => beginPanelResize("right", event)}
        />

        <div
          className={cn(
            "min-h-0 min-w-0 overflow-hidden",
            !rightPanelOpen && "pointer-events-none",
          )}
        >
          <DetailsPanel
            backupBusy={backupBusy}
            backupJson={backupJson}
            currentRunning={currentRunning}
            defaultPython={defaultPython}
            displayedOutput={displayedOutput}
            displayedRunLabel={displayedRunLabel}
            displayedStatus={displayedStatus}
            form={form}
            interpreters={interpreters}
            latestRun={latestRun}
            restoringId={restoringId}
            rightPanelOpen={rightPanelOpen}
            runs={runs}
            safety={safety}
            saving={saving || autoSaving}
            selectedLiveOutput={selectedLiveOutput}
            versions={versions}
            onClearOutput={handleClearOutput}
            onExportJson={() => void handleExportLibraryJson()}
            onExportLibraryFile={() => void handleExportLibraryFile()}
            onImportJson={() => void handleImportLibraryJson()}
            onImportLibraryFile={() => void handleImportLibraryFile()}
            onRestore={(version) => void handleRestore(version)}
            onRun={() => void handleRun()}
            onSetBackupJson={setBackupJson}
            onUseInterpreter={(path) => void handleUseInterpreter(path)}
          />
        </div>
      </section>

      <SettingsDialog
        interpreters={interpreters}
        open={settingsOpen}
        saving={savingSettings}
        settingsForm={settingsForm}
        workspaces={workspaces.map((workspace) => workspace.name)}
        onDetectPython={() => void handleDetectPython()}
        onOpenChange={setSettingsOpen}
        onSetField={setSettingsField}
      />
    </main>
  );
}

function PanelResizer({
  active,
  hidden,
  label,
  onPointerDown,
}: {
  active: boolean;
  hidden?: boolean;
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  if (hidden) {
    return <div aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "group relative z-20 cursor-col-resize bg-[#dfe7f2] outline-none transition-colors hover:bg-[#c7d8ef] focus-visible:bg-[#c7d8ef] dark:bg-[#0f1117] dark:hover:bg-[#26344d] dark:focus-visible:bg-[#26344d]",
        active && "bg-[#b8cff2] dark:bg-[#2e4264]",
      )}
      onPointerDown={onPointerDown}
    >
      <span
        className={cn(
          "absolute left-1/2 top-1/2 h-12 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a9b7ca] opacity-60 transition-all group-hover:h-20 group-hover:bg-[#2563eb] group-hover:opacity-100 dark:bg-[#3b4659] dark:group-hover:bg-[#77a3ff]",
          active && "h-20 bg-[#2563eb] opacity-100 dark:bg-[#77a3ff]",
        )}
      />
    </button>
  );
}

function readStoredPanelWidth(key: string, fallback: number) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const stored = Number(window.localStorage.getItem(key));
  return Number.isFinite(stored) && stored > 0 ? stored : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
