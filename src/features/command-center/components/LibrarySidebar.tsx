import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileCode2,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FolderRecord, ScriptRecord, WorkspaceRecord } from "@/lib/tauri";
import { cn } from "@/lib/utils";

import { defaultWorkspaceName } from "../constants";
import { fieldClass, mutedTextClass, primaryTextClass } from "../styles";

type DraggedFolder = {
  workspace: string;
  name: string;
};

type DropTargetKind = "workspace" | "folder";

type DropTarget = {
  key: string;
  kind: DropTargetKind;
  workspace: string;
  folder?: string;
};

type PointerDragItem =
  | {
      type: "script";
      scriptId: string;
      label: string;
      startX: number;
      startY: number;
      x: number;
      y: number;
      active: boolean;
    }
  | {
      type: "folder";
      workspace: string;
      name: string;
      label: string;
      startX: number;
      startY: number;
      x: number;
      y: number;
      active: boolean;
    };

const dragActivationDistance = 4;

type LibrarySidebarProps = {
  activeWorkspace: string;
  bulkBusy: boolean;
  bulkCategory: string;
  bulkTagsText: string;
  creatingFolder: boolean;
  deletingLibraryItem: string | null;
  favoritesOnly: boolean;
  filteredScripts: ScriptRecord[];
  folders: FolderRecord[];
  loadingLibrary: boolean;
  newFolderName: string;
  newWorkspaceName: string;
  saving: boolean;
  scripts: ScriptRecord[];
  searchQuery: string;
  selectedId: string | null;
  selectedIds: Set<string>;
  selectedIdsArray: string[];
  workspaces: WorkspaceRecord[];
  onBulkApply: () => void;
  onBulkCopyJson: () => void;
  onBulkDelete: () => void;
  onBulkExportFile: () => void;
  onCreateFolder: () => void;
  onCreateWorkspace: () => void;
  onDeleteFolder: (workspace: string, folder: string) => void;
  onDeleteWorkspace: (workspace: string) => void;
  onMoveFolder: (workspace: string, folder: string, targetWorkspace: string) => void;
  onMoveScript: (scriptId: string, workspace: string, folder?: string) => void;
  onNewCommand: () => void;
  onRenameFolder: (workspace: string, folder: string, newName: string) => void;
  onSelectScript: (scriptId: string) => void;
  onSetActiveWorkspace: (workspace: string) => void;
  onSetBulkCategory: (value: string) => void;
  onSetBulkTagsText: (value: string) => void;
  onSetFavoritesOnly: (value: boolean) => void;
  onSetNewFolderName: (value: string) => void;
  onSetNewWorkspaceName: (value: string) => void;
  onSetSearchQuery: (value: string) => void;
  onSetSelectedIds: (value: Set<string>) => void;
  onToggleScriptSelection: (scriptId: string, checked: boolean) => void;
};

export function LibrarySidebar({
  activeWorkspace,
  bulkBusy,
  bulkCategory,
  bulkTagsText,
  creatingFolder,
  deletingLibraryItem,
  favoritesOnly,
  filteredScripts,
  folders,
  loadingLibrary,
  newFolderName,
  newWorkspaceName,
  saving,
  scripts,
  searchQuery,
  selectedId,
  selectedIds,
  selectedIdsArray,
  workspaces,
  onBulkApply,
  onBulkCopyJson,
  onBulkDelete,
  onBulkExportFile,
  onCreateFolder,
  onCreateWorkspace,
  onDeleteFolder,
  onDeleteWorkspace,
  onMoveFolder,
  onMoveScript,
  onNewCommand,
  onRenameFolder,
  onSelectScript,
  onSetActiveWorkspace,
  onSetBulkCategory,
  onSetBulkTagsText,
  onSetFavoritesOnly,
  onSetNewFolderName,
  onSetNewWorkspaceName,
  onSetSearchQuery,
  onSetSelectedIds,
  onToggleScriptSelection,
}: LibrarySidebarProps) {
  const pointerDragRef = useRef<PointerDragItem | null>(null);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
    () => new Set(["Default"]),
  );
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [pointerDrag, setPointerDrag] = useState<PointerDragItem | null>(null);
  const [activeDropKey, setActiveDropKey] = useState<string | null>(null);
  const [renamingFolderKey, setRenamingFolderKey] = useState<string | null>(null);
  const [renamingFolderValue, setRenamingFolderValue] = useState("");
  const isSearching = searchQuery.trim().length > 0;
  const workspaceOptions = useMemo(
    () =>
      workspaces.length > 0
        ? workspaces.map((workspace) => workspace.name)
        : [activeWorkspace || defaultWorkspaceName],
    [activeWorkspace, workspaces],
  );

  const workspaceGroups = useMemo(() => {
    const scriptBuckets = new Map<string, Map<string, ScriptRecord[]>>();
    const rootScripts = new Map<string, ScriptRecord[]>();
    for (const script of filteredScripts) {
      const workspaceName = workspaceNameFor(script);
      const folderName = script.category?.trim();
      if (!folderName) {
        rootScripts.set(workspaceName, [...(rootScripts.get(workspaceName) ?? []), script]);
        continue;
      }
      const workspaceBucket = scriptBuckets.get(workspaceName) ?? new Map<string, ScriptRecord[]>();
      workspaceBucket.set(folderName, [...(workspaceBucket.get(folderName) ?? []), script]);
      scriptBuckets.set(workspaceName, workspaceBucket);
    }

    const workspaceNames = new Set([
      ...workspaces.map((workspace) => workspace.name),
      ...folders.map((folder) => folder.workspace || "Default"),
      ...scripts.map(workspaceNameFor),
      "Default",
    ]);

    return Array.from(workspaceNames)
      .map((workspaceName) => {
        const folderNames = new Set([
          ...folders
            .filter((folder) => (folder.workspace || "Default") === workspaceName)
            .map((folder) => folder.name),
          ...Array.from(scriptBuckets.get(workspaceName)?.keys() ?? []),
        ]);

        const folderGroups = Array.from(folderNames)
          .map((folderName) => ({
            name: folderName,
            scripts: (scriptBuckets.get(workspaceName)?.get(folderName) ?? []).sort(
              (left, right) => left.name.localeCompare(right.name),
            ),
          }))
          .filter((group) => !isSearching || group.scripts.length > 0)
          .sort((left, right) => left.name.localeCompare(right.name));

        return {
          name: workspaceName,
          rootScripts: (rootScripts.get(workspaceName) ?? []).sort((left, right) =>
            left.name.localeCompare(right.name),
          ),
          folders: folderGroups,
        };
      })
      .filter((group) => !isSearching || group.rootScripts.length > 0 || group.folders.length > 0)
      .sort((left, right) => {
        if (left.name === "Default") return -1;
        if (right.name === "Default") return 1;
        return left.name.localeCompare(right.name);
      });
  }, [filteredScripts, folders, isSearching, scripts, workspaces]);

  const workspaceNamesKey = workspaceGroups.map((group) => group.name).join("\u001f");
  const folderNamesKey = workspaceGroups
    .flatMap((workspace) =>
      workspace.folders.map((folder) => folderKey(workspace.name, folder.name)),
    )
    .join("\u001f");

  useEffect(() => {
    setExpandedWorkspaces((current) => {
      const next = new Set(current);
      let changed = false;

      for (const group of workspaceGroups) {
        if (!next.has(group.name)) {
          next.add(group.name);
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [workspaceNamesKey, workspaceGroups]);

  useEffect(() => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      let changed = false;

      for (const workspace of workspaceGroups) {
        for (const folder of workspace.folders) {
          const key = folderKey(workspace.name, folder.name);
          if (!next.has(key)) {
            next.add(key);
            changed = true;
          }
        }
      }

      return changed ? next : current;
    });
  }, [folderNamesKey, workspaceGroups]);

  useEffect(() => {
    pointerDragRef.current = pointerDrag;
  }, [pointerDrag]);

  useEffect(() => {
    if (!pointerDrag) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const current = pointerDragRef.current;
      if (!current) {
        return;
      }

      const active =
        current.active ||
        Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >
          dragActivationDistance;
      const next = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        active,
      } as PointerDragItem;

      pointerDragRef.current = next;
      setPointerDrag(next);
      setActiveDropKey(active ? dropTargetFromPoint(event.clientX, event.clientY)?.key ?? null : null);
    }

    function handlePointerUp(event: PointerEvent) {
      const current = pointerDragRef.current;
      const target =
        current?.active ? dropTargetFromPoint(event.clientX, event.clientY) : null;

      pointerDragRef.current = null;
      setPointerDrag(null);
      setActiveDropKey(null);

      if (!current || !target) {
        return;
      }

      if (current.type === "script") {
        onMoveScript(
          current.scriptId,
          target.workspace,
          target.kind === "folder" ? target.folder : undefined,
        );
        return;
      }

      onMoveFolder(current.workspace, current.name, target.workspace);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [Boolean(pointerDrag), onMoveFolder, onMoveScript]);

  const visibleCount = workspaceGroups.reduce(
    (total, workspace) =>
      total +
      workspace.rootScripts.length +
      workspace.folders.reduce((folderTotal, folder) => folderTotal + folder.scripts.length, 0),
    0,
  );

  function toggleWorkspace(workspaceName: string) {
    setExpandedWorkspaces((current) => {
      const next = new Set(current);
      if (next.has(workspaceName)) {
        next.delete(workspaceName);
      } else {
        next.add(workspaceName);
      }
      return next;
    });
  }

  function toggleFolder(workspaceName: string, folderName: string) {
    const key = folderKey(workspaceName, folderName);
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function startRenamingFolder(workspaceName: string, folderName: string) {
    setRenamingFolderKey(folderKey(workspaceName, folderName));
    setRenamingFolderValue(folderName);
  }

  function cancelRenamingFolder() {
    setRenamingFolderKey(null);
    setRenamingFolderValue("");
  }

  function commitRenamingFolder(workspaceName: string, folderName: string) {
    const nextName = renamingFolderValue.trim();
    cancelRenamingFolder();
    if (nextName && nextName !== folderName) {
      onRenameFolder(workspaceName, folderName, nextName);
    }
  }

  function beginScriptDrag(event: ReactPointerEvent, script: ScriptRecord, fromHandle = false) {
    if (event.button !== 0) {
      return;
    }

    if (fromHandle) {
      event.preventDefault();
      event.stopPropagation();
    }

    const item: PointerDragItem = {
      type: "script",
      scriptId: script.id,
      label: script.name,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    };
    pointerDragRef.current = item;
    setPointerDrag(item);
    setActiveDropKey(null);
  }

  function beginFolderDrag(event: ReactPointerEvent, folder: DraggedFolder) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const item: PointerDragItem = {
      type: "folder",
      workspace: folder.workspace,
      name: folder.name,
      label: folder.name,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    };
    pointerDragRef.current = item;
    setPointerDrag(item);
    setActiveDropKey(null);
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-[#ced8e7] bg-[#e1e9f4] dark:border-[#2d3442] dark:bg-[#181b24]">
      <div className="border-b border-[#ced8e7] bg-[#edf3fa] px-3 py-2 dark:border-[#2d3442] dark:bg-[#1b1f29]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b] dark:text-[#8f9aae]">
              Explorer
            </p>
            <p className={cn("truncate text-sm font-semibold", primaryTextClass)}>
              {visibleCount} of {scripts.length} commands
            </p>
          </div>
          <Button
            size="icon"
            onClick={onNewCommand}
            title="New command"
            disabled={saving}
            className="size-8 rounded-md bg-[#2563eb] text-white shadow-sm hover:bg-[#1d4ed8]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-[#718096] dark:text-[#8f9aae]" />
            <Input
              className={cn("h-8 rounded-md pl-8 text-xs", fieldClass)}
              placeholder="Search commands"
              value={searchQuery}
              onChange={(event) => onSetSearchQuery(event.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <select
              className={cn("h-8 flex-1 rounded-md px-2 text-xs", fieldClass)}
              value={activeWorkspace}
              onChange={(event) => onSetActiveWorkspace(event.target.value)}
              title="Workspace for new folders and commands"
            >
              {workspaceOptions.map((workspace) => (
                <option key={workspace} value={workspace}>
                  {workspace}
                </option>
              ))}
            </select>
            <Button
              variant={favoritesOnly ? "default" : "outline"}
              size="icon-sm"
              title="Favorites"
              onClick={() => onSetFavoritesOnly(!favoritesOnly)}
              className={cn(
                "h-8 rounded-md",
                favoritesOnly && "bg-[#f59e0b] text-white hover:bg-[#d97706]",
              )}
            >
              <Star className={cn("size-4", favoritesOnly && "fill-current")} />
            </Button>
          </div>

          <div className="flex gap-2">
            <Input
              className={cn("h-8 rounded-md text-xs", fieldClass)}
              value={newWorkspaceName}
              onChange={(event) => onSetNewWorkspaceName(event.target.value)}
              placeholder="Create workspace"
            />
            <Button
              variant="outline"
              size="icon-sm"
              title="Create workspace"
              onClick={onCreateWorkspace}
              disabled={creatingFolder || !newWorkspaceName.trim()}
              className="h-8 rounded-md"
            >
              {creatingFolder ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Archive className="size-4" />
              )}
            </Button>
          </div>

          <div className="flex gap-2">
            <Input
              className={cn("h-8 rounded-md text-xs", fieldClass)}
              value={newFolderName}
              onChange={(event) => onSetNewFolderName(event.target.value)}
              placeholder={`Folder in ${activeWorkspace}`}
            />
            <Button
              variant="outline"
              size="icon-sm"
              title="Create folder"
              onClick={onCreateFolder}
              disabled={creatingFolder || !newFolderName.trim()}
              className="h-8 rounded-md"
            >
              {creatingFolder ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FolderPlus className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {selectedIdsArray.length > 0 ? (
        <div className="space-y-2 border-b border-[#ced8e7] bg-[#dce6f2] p-3 dark:border-[#2d3442] dark:bg-[#202634]">
          <div className="flex items-center justify-between gap-2">
            <p className={cn("text-xs font-semibold", primaryTextClass)}>
              {selectedIdsArray.length} selected
            </p>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onSetSelectedIds(new Set())}
              disabled={bulkBusy}
            >
              Clear
            </Button>
          </div>
          <div className="grid gap-2">
            <Input
              className={cn("h-8 text-xs", fieldClass)}
              value={bulkCategory}
              onChange={(event) => onSetBulkCategory(event.target.value)}
              placeholder="Set folder"
            />
            <Input
              className={cn("h-8 text-xs", fieldClass)}
              value={bulkTagsText}
              onChange={(event) => onSetBulkTagsText(event.target.value)}
              placeholder="Set tags"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkApply}
              disabled={bulkBusy || (!bulkCategory.trim() && !bulkTagsText.trim())}
            >
              {bulkBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Apply
            </Button>
            <Button variant="outline" size="sm" onClick={onBulkExportFile} disabled={bulkBusy}>
              <Download className="size-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={onBulkCopyJson} disabled={bulkBusy}>
              <Copy className="size-4" />
              Copy JSON
            </Button>
            <Button variant="destructive" size="sm" onClick={onBulkDelete} disabled={bulkBusy}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="py-2">
          {loadingLibrary ? (
            <div className={cn("flex items-center gap-2 px-3 py-3 text-sm", mutedTextClass)}>
              <Loader2 className="size-4 animate-spin" />
              Loading
            </div>
          ) : null}

          {!loadingLibrary && workspaceGroups.length === 0 ? (
            <p className={cn("px-3 py-4 text-xs", mutedTextClass)}>No commands found.</p>
          ) : null}

          <div className="space-y-0.5 px-1.5">
            {workspaceGroups.map((workspace) => {
              const workspaceExpanded = expandedWorkspaces.has(workspace.name);
              const workspaceTarget = workspaceDropTarget(workspace.name);

              return (
                <div key={workspace.name}>
                  <TreeRow
                    activeDropKey={activeDropKey}
                    count={workspace.rootScripts.length + workspace.folders.length}
                    dropTarget={workspaceTarget}
                    expanded={workspaceExpanded}
                    icon={<Archive className="size-4 text-[#586579] dark:text-[#aeb8c8]" />}
                    label={workspace.name}
                    level="workspace"
                    deleteTitle={`Delete workspace ${workspace.name}`}
                    deleting={deletingLibraryItem === workspaceDeleteKey(workspace.name)}
                    dropTitle={`Move command to ${workspace.name}`}
                    onDelete={
                      workspace.name === defaultWorkspaceName
                        ? undefined
                        : () => onDeleteWorkspace(workspace.name)
                    }
                    onToggle={() => toggleWorkspace(workspace.name)}
                  />

                  {workspaceExpanded ? (
                    <div
                      className={cn(
                        "ml-[18px] border-l border-[#c8d4e5] py-0.5 pl-1.5 dark:border-[#303747]",
                        activeDropKey === workspaceTarget.key &&
                          pointerDrag?.active &&
                          "rounded-md bg-[#dbeafe]/70 dark:bg-[#1d3558]/70",
                      )}
                      data-auppy-drop-target={workspaceTarget.kind}
                      data-drop-folder={workspaceTarget.folder}
                      data-drop-key={workspaceTarget.key}
                      data-drop-workspace={workspaceTarget.workspace}
                    >
                      {workspace.rootScripts.length === 0 && workspace.folders.length === 0 ? (
                        <div className={cn("px-2 py-1.5 text-xs", mutedTextClass)}>
                          Empty workspace
                        </div>
                      ) : null}
                      {workspace.rootScripts.map((script) => (
                        <CommandTreeRow
                          key={script.id}
                          script={script}
                          selected={selectedId === script.id}
                          checked={selectedIds.has(script.id)}
                          onBeginDrag={(event, fromHandle) =>
                            beginScriptDrag(event, script, fromHandle)
                          }
                          onSelect={() => onSelectScript(script.id)}
                          onToggle={(checked) => onToggleScriptSelection(script.id, checked)}
                        />
                      ))}
                      {workspace.folders.map((folder) => {
                        const key = folderKey(workspace.name, folder.name);
                        const folderExpanded = expandedFolders.has(key);
                        const folderTarget = folderDropTarget(workspace.name, folder.name);

                        return (
                          <div key={key}>
                            <TreeRow
                              activeDropKey={activeDropKey}
                              count={folder.scripts.length}
                              dragFolder={{ workspace: workspace.name, name: folder.name }}
                              dropTarget={folderTarget}
                              expanded={folderExpanded}
                              icon={
                                folderExpanded ? (
                                  <FolderOpen className="size-4 text-[#d97706] dark:text-[#f7c46c]" />
                                ) : (
                                  <Folder className="size-4 text-[#d97706] dark:text-[#f7c46c]" />
                                )
                              }
                              label={folder.name}
                              level="folder"
                              deleteTitle={`Delete folder ${folder.name}`}
                              deleting={
                                deletingLibraryItem === folderDeleteKey(workspace.name, folder.name)
                              }
                              dropTitle={`Move command to ${workspace.name} / ${folder.name}`}
                              editing={renamingFolderKey === key}
                              editingValue={renamingFolderValue}
                              onDelete={() => onDeleteFolder(workspace.name, folder.name)}
                              onBeginFolderDrag={beginFolderDrag}
                              onCancelRename={cancelRenamingFolder}
                              onCommitRename={() =>
                                commitRenamingFolder(workspace.name, folder.name)
                              }
                              onRename={() => startRenamingFolder(workspace.name, folder.name)}
                              onSetEditingValue={setRenamingFolderValue}
                              onToggle={() => toggleFolder(workspace.name, folder.name)}
                            />

                            {folderExpanded ? (
                              <div
                                className={cn(
                                  "ml-[18px] border-l border-[#d5ddea] py-0.5 pl-1.5 dark:border-[#303747]",
                                  activeDropKey === folderTarget.key &&
                                    pointerDrag?.active &&
                                    "rounded-md bg-[#dbeafe]/70 dark:bg-[#1d3558]/70",
                                )}
                                data-auppy-drop-target={folderTarget.kind}
                                data-drop-folder={folderTarget.folder}
                                data-drop-key={folderTarget.key}
                                data-drop-workspace={folderTarget.workspace}
                              >
                                {folder.scripts.length === 0 ? (
                                  <div className={cn("px-2 py-1.5 text-xs", mutedTextClass)}>
                                    Empty folder
                                  </div>
                                ) : null}
                                {folder.scripts.map((script) => (
                                  <CommandTreeRow
                                    key={script.id}
                                    script={script}
                                    selected={selectedId === script.id}
                                    checked={selectedIds.has(script.id)}
                                    onBeginDrag={(event, fromHandle) =>
                                      beginScriptDrag(event, script, fromHandle)
                                    }
                                    onSelect={() => onSelectScript(script.id)}
                                    onToggle={(checked) =>
                                      onToggleScriptSelection(script.id, checked)
                                    }
                                  />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>

      {pointerDrag?.active ? (
        <div
          className="pointer-events-none fixed z-50 flex max-w-[220px] items-center gap-2 rounded-md border border-[#b8c7db] bg-[#f8fbff] px-2 py-1 text-xs font-medium text-[#26344a] shadow-lg shadow-[#1f2937]/15 dark:border-[#3a4354] dark:bg-[#1d2230] dark:text-[#e6ebf5] dark:shadow-black/30"
          style={{
            left: pointerDrag.x + 12,
            top: pointerDrag.y + 12,
          }}
        >
          {pointerDrag.type === "folder" ? (
            <Folder className="size-4 text-[#d97706] dark:text-[#f7c46c]" />
          ) : (
            <FileCode2 className="size-4 text-[#2563eb] dark:text-[#77a3ff]" />
          )}
          <span className="truncate">{pointerDrag.label}</span>
        </div>
      ) : null}
    </aside>
  );
}

function TreeRow({
  activeDropKey,
  count,
  deleteTitle,
  deleting = false,
  dragFolder,
  dropTitle,
  dropTarget,
  editing = false,
  editingValue = "",
  expanded,
  icon,
  label,
  level,
  onBeginFolderDrag,
  onCancelRename,
  onDelete,
  onCommitRename,
  onRename,
  onSetEditingValue,
  onToggle,
}: {
  activeDropKey?: string | null;
  count: number;
  deleteTitle?: string;
  deleting?: boolean;
  dragFolder?: DraggedFolder;
  dropTitle?: string;
  dropTarget?: DropTarget;
  editing?: boolean;
  editingValue?: string;
  expanded: boolean;
  icon: ReactNode;
  label: string;
  level: "workspace" | "folder";
  onBeginFolderDrag?: (event: ReactPointerEvent, folder: DraggedFolder) => void;
  onCancelRename?: () => void;
  onDelete?: () => void;
  onCommitRename?: () => void;
  onRename?: () => void;
  onSetEditingValue?: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex h-8 items-center gap-1 rounded-md px-1.5 text-sm transition",
        level === "workspace"
          ? "text-[#26344a] hover:bg-[#d0dbea] dark:text-[#d5ddec] dark:hover:bg-[#222836]"
          : "text-[#334155] hover:bg-[#d5dfec] dark:text-[#c5cfdd] dark:hover:bg-[#222836]",
        activeDropKey === dropTarget?.key &&
          "bg-[#dbeafe] ring-1 ring-[#2563eb]/35 dark:bg-[#1d3558] dark:ring-[#79a8ff]/35",
      )}
      data-auppy-drop-target={dropTarget?.kind}
      data-drop-folder={dropTarget?.folder}
      data-drop-key={dropTarget?.key}
      data-drop-workspace={dropTarget?.workspace}
      title={dropTitle}
    >
      <button
        type="button"
        className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/5"
        title={expanded ? "Collapse" : "Expand"}
        onClick={onToggle}
      >
        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {icon}
          <Input
            autoFocus
            className={cn("h-6 min-w-0 flex-1 rounded px-1.5 text-xs", fieldClass)}
            value={editingValue}
            onChange={(event) => onSetEditingValue?.(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCommitRename?.();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancelRename?.();
              }
            }}
          />
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded text-[#2563eb] hover:bg-[#dbeafe] dark:text-[#93c5fd] dark:hover:bg-[#1e3a5f]"
            title="Apply folder name"
            onClick={(event) => {
              event.stopPropagation();
              onCommitRename?.();
            }}
          >
            <Check className="size-4" />
          </button>
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded text-[#8a95a8] hover:bg-black/5 dark:text-[#8792a6] dark:hover:bg-white/5"
            title="Cancel rename"
            onClick={(event) => {
              event.stopPropagation();
              onCancelRename?.();
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onToggle}
        >
          {icon}
          <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
          <span className="rounded px-1.5 py-0.5 text-[11px] text-[#64748b] group-hover:bg-black/5 dark:text-[#97a3b6] dark:group-hover:bg-white/5">
            {count}
          </span>
        </button>
      )}
      {dragFolder ? (
        <button
          type="button"
          className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-[#8a95a8] opacity-60 transition hover:bg-black/5 hover:opacity-100 active:cursor-grabbing focus:opacity-100 dark:text-[#8792a6] dark:hover:bg-white/5"
          title="Drag folder to another workspace"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => onBeginFolderDrag?.(event, dragFolder)}
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}
      {onRename && !editing ? (
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded text-[#8a95a8] opacity-0 transition hover:bg-[#dbeafe] hover:text-[#2563eb] group-hover:opacity-100 focus:opacity-100 dark:text-[#8792a6] dark:hover:bg-[#1e3a5f] dark:hover:text-[#93c5fd]"
          title="Rename folder"
          onClick={(event) => {
            event.stopPropagation();
            onRename();
          }}
        >
          <Pencil className="size-4" />
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded text-[#8a95a8] opacity-0 transition hover:bg-[#fee2e2] hover:text-[#dc2626] group-hover:opacity-100 focus:opacity-100 dark:text-[#8792a6] dark:hover:bg-[#4a1f27] dark:hover:text-[#fca5a5]",
            deleting && "opacity-100",
          )}
          title={deleteTitle ?? "Delete"}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}

function CommandTreeRow({
  checked,
  onBeginDrag,
  onSelect,
  onToggle,
  script,
  selected,
}: {
  checked: boolean;
  onBeginDrag: (event: ReactPointerEvent, fromHandle?: boolean) => void;
  onSelect: () => void;
  onToggle: (checked: boolean) => void;
  script: ScriptRecord;
  selected: boolean;
}) {
  return (
    <div
      className={cn(
        "group/file flex h-8 min-w-0 items-center gap-1 rounded-md px-1.5 text-sm transition",
        selected
          ? "bg-[#cbdcff] text-[#173b7a] dark:bg-[#263956] dark:text-[#d8e6ff]"
          : "text-[#475569] hover:bg-[#e7edf6] dark:text-[#aeb8c8] dark:hover:bg-[#222836]",
      )}
      onPointerDown={(event) => onBeginDrag(event)}
    >
      <button
        type="button"
        className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-[#8a95a8] opacity-60 transition hover:bg-black/5 hover:opacity-100 active:cursor-grabbing focus:opacity-100 dark:text-[#8792a6] dark:hover:bg-white/5"
        title="Drag command to a workspace or folder"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => onBeginDrag(event, true)}
      >
        <GripVertical className="size-4" />
      </button>
      <input
        aria-label={`Select ${script.name}`}
        checked={checked}
        className={cn(
          "size-3.5 shrink-0 accent-[#2563eb]",
          checked ? "opacity-100" : "opacity-40 group-hover/file:opacity-100",
        )}
        type="checkbox"
        onChange={(event) => onToggle(event.target.checked)}
        onPointerDown={(event) => event.stopPropagation()}
      />
      <button
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onSelect}
        type="button"
      >
        <FileCode2 className="size-4 shrink-0 text-[#2563eb] dark:text-[#77a3ff]" />
        <span className="min-w-0 flex-1 truncate">{script.name}</span>
        {script.run_on_app_start ? (
          <span className="size-1.5 rounded-full bg-[#10b981]" title="Runs on app start" />
        ) : null}
        {script.is_favorite ? (
          <Star className="size-3 shrink-0 fill-[#f59e0b] text-[#f59e0b]" />
        ) : null}
      </button>
    </div>
  );
}

function folderKey(workspace: string, folder: string) {
  return `${workspace}\u001f${folder}`;
}

function workspaceDropTarget(workspace: string): DropTarget {
  return {
    key: workspaceDeleteKey(workspace),
    kind: "workspace",
    workspace,
  };
}

function folderDropTarget(workspace: string, folder: string): DropTarget {
  return {
    key: folderDeleteKey(workspace, folder),
    kind: "folder",
    workspace,
    folder,
  };
}

function dropTargetFromPoint(x: number, y: number): DropTarget | null {
  const element = document.elementFromPoint(x, y);
  const target =
    element instanceof HTMLElement
      ? element.closest<HTMLElement>("[data-auppy-drop-target]")
      : null;

  if (!target) {
    return null;
  }

  const kind = target.dataset.auppyDropTarget;
  const workspace = target.dataset.dropWorkspace;
  const key = target.dataset.dropKey;
  if ((kind !== "workspace" && kind !== "folder") || !workspace || !key) {
    return null;
  }

  return {
    key,
    kind,
    workspace,
    folder: target.dataset.dropFolder,
  };
}

function workspaceDeleteKey(workspace: string) {
  return `workspace:${workspace}`;
}

function folderDeleteKey(workspace: string, folder: string) {
  return `folder:${folderKey(workspace, folder)}`;
}

function workspaceNameFor(script: ScriptRecord) {
  return script.workspace?.trim() || "Default";
}
