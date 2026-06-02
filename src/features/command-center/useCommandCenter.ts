import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  confirm as confirmDialog,
  open,
  save,
  type ConfirmDialogOptions,
} from "@tauri-apps/plugin-dialog";
import {
  bulkDeleteScripts,
  bulkUpdateScripts,
  cancelScript,
  createFolder,
  createScript,
  createWorkspace,
  deleteFolder,
  deleteScript,
  deleteWorkspace,
  detectPythonInterpreters,
  duplicateScript,
  exportLibrary,
  exportLibraryToPath,
  exportSelectedLibrary,
  exportSelectedLibraryToPath,
  getDefaultPythonInterpreter,
  getScript,
  getSetting,
  importLibrary,
  importLibraryFromPath,
  listFolders,
  listRuns,
  listScriptVersions,
  listScripts,
  listWorkspaces,
  renameFolder,
  restoreScriptVersion,
  runScript,
  saveSetting,
  type FolderRecord,
  type PythonInterpreter,
  type ScriptRecord,
  type ScriptRun,
  type ScriptVersion,
  type WorkspaceRecord,
  updateScript,
} from "@/lib/tauri";
import {
  backupFileFilters,
  categorySettingKey,
  defaultWorkspaceName,
  defaultOutputLimitBytes,
  defaultTimeoutSeconds,
  initialScriptDefaults,
  outputLimitSettingKey,
  pythonSettingKey,
  tagsSettingKey,
  themeStorageKey,
  timeoutSettingKey,
  workspaceSettingKey,
} from "./constants";
import type {
  NewScriptDefaults,
  ScriptForm,
  ScriptOutputPayload,
  SettingsForm,
  ThemeMode,
} from "./types";
import {
  buildScriptInput,
  clampInteger,
  emptyForm,
  errorMessage,
  filterScripts,
  formFromScript,
  formatDate,
  numericSetting,
  outputText,
  parseTags,
  readStoredTheme,
  scanSafety,
  uniqueCategories,
} from "./utils";

export function useCommandCenter() {
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSavePromiseRef = useRef<Promise<ScriptRecord | null> | null>(null);
  const settingsAutoSaveTimerRef = useRef<number | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme());
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState(defaultWorkspaceName);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [defaultPython, setDefaultPython] = useState("python3");
  const [newScriptDefaults, setNewScriptDefaults] = useState<NewScriptDefaults>(
    initialScriptDefaults,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<SettingsForm>({
    ...initialScriptDefaults,
    python: "python3",
  });
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [interpreters, setInterpreters] = useState<PythonInterpreter[]>([]);
  const [form, setForm] = useState<ScriptForm>(() => emptyForm());
  const [runs, setRuns] = useState<ScriptRun[]>([]);
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkTagsText, setBulkTagsText] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [backupJson, setBackupJson] = useState("");
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deletingLibraryItem, setDeletingLibraryItem] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(() => new Set());
  const [liveOutputByScript, setLiveOutputByScript] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const selectedScript = useMemo(
    () => scripts.find((script) => script.id === selectedId) ?? null,
    [scripts, selectedId],
  );
  const latestRun = runs[0] ?? null;
  const currentRunning = selectedId ? runningIds.has(selectedId) : false;
  const safety = useMemo(() => scanSafety(form), [form]);
  const categories = useMemo(
    () => uniqueCategories(scripts, folders, form.workspace || activeWorkspace),
    [activeWorkspace, folders, form.workspace, scripts],
  );
  const filteredScripts = useMemo(
    () => filterScripts(scripts, searchQuery, favoritesOnly),
    [scripts, searchQuery, favoritesOnly],
  );
  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const selectedLiveOutput = selectedId ? liveOutputByScript[selectedId] ?? "" : "";
  const displayedOutput = currentRunning
    ? selectedLiveOutput || "Running..."
    : latestRun
      ? outputText(latestRun)
      : "Run a command to see output.";
  const displayedStatus = currentRunning ? "running" : latestRun?.status ?? null;
  const displayedRunLabel = currentRunning
    ? "Running now"
    : latestRun
      ? formatDate(latestRun.started_at)
      : "No runs yet";

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<ScriptOutputPayload>("script-output", (event) => {
      setLiveOutputByScript((current) => ({
        ...current,
        [event.payload.scriptId]: `${current[event.payload.scriptId] ?? ""}${
          event.payload.content
        }`,
      }));
    })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch((error: unknown) => {
        setNotice(errorMessage(error));
      });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setRuns([]);
      setVersions([]);
      setDirty(false);
      return;
    }

    let cancelled = false;
    void loadSelectedScript(selectedId, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    clearPendingAutoSave();

    if (
      !selectedId ||
      !dirty ||
      loadingDetail ||
      currentRunning ||
      !form.name.trim() ||
      !form.interpreterPath.trim()
    ) {
      return;
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      void autoSaveCurrent(selectedId);
    }, 900);

    return () => {
      clearPendingAutoSave();
    };
  }, [selectedId, form, dirty, loadingDetail, currentRunning]);

  useEffect(() => {
    if (settingsAutoSaveTimerRef.current) {
      window.clearTimeout(settingsAutoSaveTimerRef.current);
      settingsAutoSaveTimerRef.current = null;
    }

    if (!settingsDirty) {
      return;
    }

    settingsAutoSaveTimerRef.current = window.setTimeout(() => {
      void autoSaveSettings();
    }, 700);

    return () => {
      if (settingsAutoSaveTimerRef.current) {
        window.clearTimeout(settingsAutoSaveTimerRef.current);
        settingsAutoSaveTimerRef.current = null;
      }
    };
  }, [settingsDirty, settingsForm]);

  async function bootstrap() {
    try {
      const [
        defaultPath,
        detected,
        timeoutSetting,
        outputLimitSetting,
        workspaceSetting,
        categorySetting,
        tagsSetting,
      ] = await Promise.all([
        getDefaultPythonInterpreter(),
        detectPythonInterpreters(),
        getSetting(timeoutSettingKey),
        getSetting(outputLimitSettingKey),
        getSetting(workspaceSettingKey),
        getSetting(categorySettingKey),
        getSetting(tagsSettingKey),
      ]);
      const defaults = {
        timeoutSeconds: numericSetting(timeoutSetting, defaultTimeoutSeconds),
        outputLimitBytes: numericSetting(outputLimitSetting, defaultOutputLimitBytes),
        workspace: workspaceSetting ?? defaultWorkspaceName,
        category: categorySetting ?? "",
        tagsText: tagsSetting ?? "",
      };
      setActiveWorkspace(defaults.workspace);
      setDefaultPython(defaultPath);
      setNewScriptDefaults(defaults);
      setSettingsForm({ ...defaults, python: defaultPath });
      setInterpreters(detected);
      setForm((current) =>
        current.interpreterPath === "python3"
          ? {
              ...current,
              interpreterPath: defaultPath,
              timeoutSeconds: defaults.timeoutSeconds,
              outputLimitBytes: defaults.outputLimitBytes,
              workspace: current.workspace || defaults.workspace,
              category: current.category || defaults.category,
              tagsText: current.tagsText || defaults.tagsText,
            }
          : current,
      );
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      await refreshScripts();
    }
  }

  async function loadSelectedScript(scriptId: string, isCancelled = () => false) {
    setLoadingDetail(true);

    try {
      const [script, history, versionHistory] = await Promise.all([
        getScript(scriptId),
        listRuns(scriptId),
        listScriptVersions(scriptId),
      ]);

      if (isCancelled()) {
        return;
      }

      setForm(formFromScript(script));
      setActiveWorkspace(script.workspace || defaultWorkspaceName);
      setRuns(history);
      setVersions(versionHistory);
      setDirty(false);
      setLastSavedAt(script.updated_at);
      setNotice(null);
    } catch (error: unknown) {
      if (!isCancelled()) {
        setNotice(errorMessage(error));
      }
    } finally {
      if (!isCancelled()) {
        setLoadingDetail(false);
      }
    }
  }

  async function refreshScripts(nextSelectedId?: string | null) {
    setLoadingLibrary(true);
    try {
      const [items, folderItems, workspaceItems] = await Promise.all([
        listScripts(),
        listFolders(),
        listWorkspaces(),
      ]);
      setScripts(items);
      setFolders(folderItems);
      setWorkspaces(workspaceItems);
      const workspaceNames = workspaceItems.map((workspace) => workspace.name);
      const workspaceToUse = workspaceNames.includes(activeWorkspace)
        ? activeWorkspace
        : workspaceNames[0] ?? defaultWorkspaceName;
      setActiveWorkspace(workspaceToUse);
      const existingIds = new Set(items.map((script) => script.id));
      setSelectedIds((current) => {
        const next = new Set([...current].filter((scriptId) => existingIds.has(scriptId)));
        return next.size === current.size ? current : next;
      });

      if (nextSelectedId !== undefined) {
        setSelectedId(nextSelectedId);
        if (nextSelectedId === null) {
          setForm(emptyForm(defaultPython, newScriptDefaults, workspaceToUse));
          setRuns([]);
          setVersions([]);
          setDirty(false);
        }
      } else if (selectedId && items.some((script) => script.id === selectedId)) {
        setSelectedId(selectedId);
      } else {
        setSelectedId(items[0]?.id ?? null);
        if (!items[0]) {
          setForm(emptyForm(defaultPython, newScriptDefaults, workspaceToUse));
          setDirty(false);
        }
      }
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function handleNew() {
    const draft = emptyForm(
      defaultPython,
      { ...newScriptDefaults, category: "" },
      activeWorkspace,
    );
    setSaving(true);
    setForm(draft);
    setRuns([]);
    setVersions([]);

    try {
      const created = await createScript(buildScriptInput(draft, defaultPython));
      setDirty(false);
      setLastSavedAt(new Date().toISOString());
      setNotice(`Created ${created.name}`);
      await refreshScripts(created.id);
    } catch (error: unknown) {
      setSelectedId(null);
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function setFormField<Key extends keyof ScriptForm>(
    key: Key,
    value: ScriptForm[Key],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "workspace" ? { category: "" } : {}),
    }));
    if (key === "workspace" && typeof value === "string") {
      setActiveWorkspace(value);
    }
    setDirty(true);
  }

  function clearPendingAutoSave() {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }

  async function persistCurrentCommand(scriptId: string | null, refreshLibrary: boolean) {
    setAutoSaving(true);
    try {
      const input = buildScriptInput(form, defaultPython);

      const saved = scriptId
        ? await updateScript(scriptId, input)
        : await createScript(input);

      setDirty(false);
      setLastSavedAt(new Date().toISOString());
      if (refreshLibrary) {
        await refreshScripts(saved.id);
      } else {
        setScripts((current) =>
          current.map((script) => (script.id === saved.id ? { ...script, ...saved } : script)),
        );
      }
      if (saved.id === selectedId) {
        setVersions(await listScriptVersions(saved.id));
      }
      return saved;
    } catch (error: unknown) {
      setNotice(errorMessage(error));
      return null;
    } finally {
      setAutoSaving(false);
    }
  }

  async function autoSaveCurrent(scriptId: string) {
    const promise = persistCurrentCommand(scriptId, false);
    autoSavePromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      if (autoSavePromiseRef.current === promise) {
        autoSavePromiseRef.current = null;
      }
    }
  }

  async function flushCurrentAutoSave() {
    clearPendingAutoSave();

    const pendingAutoSave = autoSavePromiseRef.current;
    if (pendingAutoSave) {
      const saved = await pendingAutoSave;
      if (saved) {
        return saved;
      }
    }

    if (!dirty && selectedScript) {
      return selectedScript;
    }

    return persistCurrentCommand(selectedId, true);
  }

  async function handleRun() {
    if (!form.isEnabled) {
      setNotice("Enable the command before running it.");
      return;
    }

    const saved = await flushCurrentAutoSave();
    if (!saved) {
      return;
    }

    setRunningIds((current) => new Set(current).add(saved.id));
    setLiveOutputByScript((current) => ({ ...current, [saved.id]: "" }));
    try {
      const run = await runScript(saved.id);
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      setNotice(`${saved.name} finished with ${run.status}`);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setRunningIds((current) => {
        const next = new Set(current);
        next.delete(saved.id);
        return next;
      });
    }
  }

  async function handleStop() {
    if (!selectedId) {
      return;
    }

    try {
      const stopped = await cancelScript(selectedId);
      setNotice(stopped ? "Stop signal sent" : "No active run to stop");
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    }
  }

  async function handleDelete() {
    if (!selectedId || !selectedScript) {
      return;
    }

    const confirmed = await confirmAction(`Delete "${selectedScript.name}"?`, {
      title: "Delete command",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteScript(selectedId);
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(selectedId);
        return next;
      });
      setNotice(`Deleted ${selectedScript.name}`);
      await refreshScripts(null);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    }
  }

  async function handleDuplicate() {
    if (!selectedId) {
      return;
    }

    setDuplicating(true);
    try {
      const duplicated = await duplicateScript(selectedId);
      setNotice(`Duplicated ${duplicated.name}`);
      await refreshScripts(duplicated.id);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setDuplicating(false);
    }
  }

  async function handleExportLibraryFile() {
    setBackupBusy(true);
    try {
      const path = await save({
        defaultPath: "auppy-library-backup.json",
        filters: backupFileFilters,
      });
      if (!path) {
        return;
      }

      await exportLibraryToPath(path);
      setNotice("Library exported to backup file");
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleExportLibraryJson() {
    setBackupBusy(true);
    try {
      const exported = await exportLibrary();
      setBackupJson(exported);
      setNotice("Library JSON is ready to copy");
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleImportLibraryFile() {
    setBackupBusy(true);
    try {
      const selected = await open({
        multiple: false,
        filters: backupFileFilters,
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) {
        return;
      }

      const result = await importLibraryFromPath(path);
      setNotice(`Imported ${result.imported} command${result.imported === 1 ? "" : "s"}`);
      await refreshScripts();
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleImportLibraryJson() {
    if (!backupJson.trim()) {
      setNotice("Paste backup JSON before importing.");
      return;
    }

    setBackupBusy(true);
    try {
      const result = await importLibrary(backupJson);
      setNotice(`Imported ${result.imported} command${result.imported === 1 ? "" : "s"}`);
      await refreshScripts();
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleCreateWorkspace() {
    const name = newWorkspaceName.trim();
    if (!name) {
      setNotice("Enter a workspace name first.");
      return;
    }

    setCreatingFolder(true);
    try {
      const workspace = await createWorkspace(name);
      setNewWorkspaceName("");
      setActiveWorkspace(workspace.name);
      if (!selectedId) {
        setForm((current) => ({ ...current, workspace: workspace.name, category: "" }));
      }
      setWorkspaces(await listWorkspaces());
      setNotice(`Created workspace ${workspace.name}`);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) {
      setNotice("Enter a folder name first.");
      return;
    }

    setCreatingFolder(true);
    try {
      const folder = await createFolder(activeWorkspace, name);
      setNewFolderName("");
      setFolders(await listFolders());
      setNotice(`Created folder ${folder.name}`);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleDeleteWorkspace(workspaceName: string) {
    if (workspaceName === defaultWorkspaceName) {
      setNotice("Default workspace cannot be deleted.");
      return;
    }

    const workspaceScripts = scripts.filter(
      (script) => scriptWorkspaceName(script) === workspaceName,
    );
    const confirmed = await confirmAction(
      `Delete workspace "${workspaceName}" and all ${workspaceScripts.length} command${
        workspaceScripts.length === 1 ? "" : "s"
      } inside it? This cannot be undone.`,
      {
        title: "Delete workspace",
        kind: "warning",
        okLabel: "Delete workspace",
        cancelLabel: "Cancel",
      },
    );
    if (!confirmed) {
      return;
    }

    const scopeKey = workspaceDeleteKey(workspaceName);
    setDeletingLibraryItem(scopeKey);
    try {
      const deleted = await deleteWorkspace(workspaceName);
      const deletedIds = new Set(workspaceScripts.map((script) => script.id));
      setSelectedIds((current) => {
        const next = new Set([...current].filter((scriptId) => !deletedIds.has(scriptId)));
        return next;
      });

      if (newScriptDefaults.workspace === workspaceName) {
        setNewScriptDefaults((current) => ({ ...current, workspace: defaultWorkspaceName }));
        setSettingsForm((current) => ({ ...current, workspace: defaultWorkspaceName }));
        await saveSetting(workspaceSettingKey, defaultWorkspaceName);
      }

      setNotice(`Deleted workspace ${workspaceName} and ${deleted} command${deleted === 1 ? "" : "s"}`);
      await refreshScripts(selectedId && deletedIds.has(selectedId) ? null : undefined);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setDeletingLibraryItem(null);
    }
  }

  async function handleDeleteFolder(workspaceName: string, folderName: string) {
    const folderScripts = scripts.filter(
      (script) =>
        scriptWorkspaceName(script) === workspaceName && scriptFolderName(script) === folderName,
    );
    const confirmed = await confirmAction(
      `Delete folder "${folderName}" in "${workspaceName}" and all ${folderScripts.length} command${
        folderScripts.length === 1 ? "" : "s"
      } inside it? The workspace will remain.`,
      {
        title: "Delete folder",
        kind: "warning",
        okLabel: "Delete folder",
        cancelLabel: "Cancel",
      },
    );
    if (!confirmed) {
      return;
    }

    const scopeKey = folderDeleteKey(workspaceName, folderName);
    setDeletingLibraryItem(scopeKey);
    try {
      const deleted = await deleteFolder(workspaceName, folderName);
      const deletedIds = new Set(folderScripts.map((script) => script.id));
      setSelectedIds((current) => {
        const next = new Set([...current].filter((scriptId) => !deletedIds.has(scriptId)));
        return next;
      });
      setNotice(`Deleted folder ${folderName} and ${deleted} command${deleted === 1 ? "" : "s"}`);
      await refreshScripts(selectedId && deletedIds.has(selectedId) ? null : undefined);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setDeletingLibraryItem(null);
    }
  }

  async function handleRenameFolder(workspaceName: string, oldName: string, newName: string) {
    const nextName = newName.trim();
    if (!nextName || nextName === oldName) {
      return;
    }

    try {
      const renamed = await renameFolder(workspaceName, oldName, nextName);
      setNotice(`Renamed folder ${oldName} to ${renamed.name}`);
      if (
        selectedScript &&
        scriptWorkspaceName(selectedScript) === workspaceName &&
        scriptFolderName(selectedScript) === oldName
      ) {
        setForm((current) => ({ ...current, category: renamed.name }));
        setDirty(false);
      }
      await refreshScripts(selectedId ?? undefined);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    }
  }

  async function handleMoveFolder(
    sourceWorkspace: string,
    folderName: string,
    targetWorkspace: string,
  ) {
    const nextWorkspace = targetWorkspace.trim() || defaultWorkspaceName;
    if (sourceWorkspace === nextWorkspace) {
      return;
    }

    const folderScripts = scripts.filter(
      (script) =>
        scriptWorkspaceName(script) === sourceWorkspace && scriptFolderName(script) === folderName,
    );
    const movedIds = folderScripts.map((script) => script.id);

    try {
      await createFolder(nextWorkspace, folderName);
      if (movedIds.length > 0) {
        await bulkUpdateScripts({
          scriptIds: movedIds,
          workspace: nextWorkspace,
          category: folderName,
        });
      }
      await deleteFolder(sourceWorkspace, folderName);

      const movedIdsSet = new Set(movedIds);
      if (selectedId && movedIdsSet.has(selectedId)) {
        setForm((current) => ({
          ...current,
          workspace: nextWorkspace,
          category: folderName,
        }));
        setDirty(false);
      }

      setActiveWorkspace(nextWorkspace);
      setNotice(`Moved folder ${folderName} to ${nextWorkspace}`);
      await refreshScripts(selectedId && movedIdsSet.has(selectedId) ? selectedId : undefined);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    }
  }

  async function handleMoveScript(scriptId: string, workspaceName: string, folderName?: string) {
    const script = scripts.find((item) => item.id === scriptId);
    if (!script) {
      return;
    }

    const nextWorkspace = workspaceName.trim() || defaultWorkspaceName;
    const nextFolder = folderName?.trim() ?? "";
    const currentWorkspace = scriptWorkspaceName(script);
    const currentFolder = script.category?.trim() ?? "";
    if (currentWorkspace === nextWorkspace && currentFolder === nextFolder) {
      return;
    }

    try {
      await bulkUpdateScripts({
        scriptIds: [scriptId],
        workspace: nextWorkspace,
        category: nextFolder,
      });

      setScripts((current) =>
        current.map((item) =>
          item.id === scriptId
            ? {
                ...item,
                workspace: nextWorkspace,
                category: nextFolder || null,
                updated_at: new Date().toISOString(),
              }
            : item,
        ),
      );
      if (selectedId === scriptId) {
        setForm((current) => ({
          ...current,
          workspace: nextWorkspace,
          category: nextFolder,
        }));
        setDirty(false);
      }
      setActiveWorkspace(nextWorkspace);
      setNotice(
        nextFolder
          ? `Moved ${script.name} to ${nextWorkspace} / ${nextFolder}`
          : `Moved ${script.name} to ${nextWorkspace}`,
      );
      await refreshScripts(scriptId);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    }
  }

  function toggleScriptSelection(scriptId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(scriptId);
      } else {
        next.delete(scriptId);
      }
      return next;
    });
  }

  async function handleBulkApply() {
    if (selectedIdsArray.length === 0) {
      return;
    }
    const category = bulkCategory.trim();
    const tags = parseTags(bulkTagsText);
    if (!category && tags.length === 0) {
      setNotice("Add a folder or tags before applying bulk changes.");
      return;
    }

    setBulkBusy(true);
    try {
      const updated = await bulkUpdateScripts({
        scriptIds: selectedIdsArray,
        ...(category ? { category } : {}),
        ...(tags.length > 0 ? { tags } : {}),
      });
      setNotice(`Updated ${updated} command${updated === 1 ? "" : "s"}`);
      await refreshScripts();
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkExportFile() {
    if (selectedIdsArray.length === 0) {
      return;
    }

    setBulkBusy(true);
    try {
      const path = await save({
        defaultPath: `auppy-selected-${selectedIdsArray.length}-commands.json`,
        filters: backupFileFilters,
      });
      if (!path) {
        return;
      }

      await exportSelectedLibraryToPath(selectedIdsArray, path);
      setNotice(`Exported ${selectedIdsArray.length} selected command${selectedIdsArray.length === 1 ? "" : "s"}`);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkCopyJson() {
    if (selectedIdsArray.length === 0) {
      return;
    }

    setBulkBusy(true);
    try {
      const exported = await exportSelectedLibrary(selectedIdsArray);
      setBackupJson(exported);
      setNotice("Selected command JSON is ready to copy");
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIdsArray.length === 0) {
      return;
    }

    const confirmed = await confirmAction(
      `Delete ${selectedIdsArray.length} selected command${selectedIdsArray.length === 1 ? "" : "s"}?`,
      {
        title: "Delete selected commands",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      },
    );
    if (!confirmed) {
      return;
    }

    setBulkBusy(true);
    try {
      const deleted = await bulkDeleteScripts(selectedIdsArray);
      const deletedIds = new Set(selectedIdsArray);
      setSelectedIds(new Set());
      setNotice(`Deleted ${deleted} command${deleted === 1 ? "" : "s"}`);
      await refreshScripts(selectedId && deletedIds.has(selectedId) ? null : undefined);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setBulkBusy(false);
    }
  }

  function handleClearOutput() {
    setRuns([]);
    if (!selectedId) {
      return;
    }

    setLiveOutputByScript((current) => {
      const next = { ...current };
      delete next[selectedId];
      return next;
    });
  }

  function setSettingsField<Key extends keyof SettingsForm>(
    key: Key,
    value: SettingsForm[Key],
  ) {
    setSettingsForm((current) => ({ ...current, [key]: value }));
    setSettingsDirty(true);
  }

  async function autoSaveSettings() {
    if (settingsAutoSaveTimerRef.current) {
      window.clearTimeout(settingsAutoSaveTimerRef.current);
      settingsAutoSaveTimerRef.current = null;
    }

    const timeoutSeconds = clampInteger(
      settingsForm.timeoutSeconds,
      1,
      3600,
      defaultTimeoutSeconds,
    );
    const outputLimitBytes = clampInteger(
      settingsForm.outputLimitBytes,
      1024,
      1048576,
      defaultOutputLimitBytes,
    );
    const defaults = {
      timeoutSeconds,
      outputLimitBytes,
      workspace: settingsForm.workspace.trim() || defaultWorkspaceName,
      category: settingsForm.category.trim(),
      tagsText: parseTags(settingsForm.tagsText).join(", "),
    };
    const python = settingsForm.python.trim() || defaultPython || "python3";

    setSavingSettings(true);
    try {
      await Promise.all([
        saveSetting(pythonSettingKey, python),
        saveSetting(timeoutSettingKey, String(defaults.timeoutSeconds)),
        saveSetting(outputLimitSettingKey, String(defaults.outputLimitBytes)),
        saveSetting(workspaceSettingKey, defaults.workspace),
        saveSetting(categorySettingKey, defaults.category),
        saveSetting(tagsSettingKey, defaults.tagsText),
      ]);
      setDefaultPython(python);
      setActiveWorkspace(defaults.workspace);
      setNewScriptDefaults(defaults);
      setSettingsForm({ ...defaults, python });
      setForm((current) =>
        selectedId
          ? current
          : {
              ...current,
              interpreterPath: python,
              timeoutSeconds: defaults.timeoutSeconds,
              outputLimitBytes: defaults.outputLimitBytes,
              workspace: defaults.workspace,
              category: defaults.category,
              tagsText: defaults.tagsText,
            },
      );
      setSettingsDirty(false);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleRestore(version: ScriptVersion) {
    if (!selectedId) {
      return;
    }

    setRestoringId(version.id);
    try {
      const restored = await restoreScriptVersion(selectedId, version.id);
      const [script, history, versionHistory] = await Promise.all([
        getScript(restored.id),
        listRuns(restored.id),
        listScriptVersions(restored.id),
      ]);
      setForm(formFromScript(script));
      setRuns(history);
      setVersions(versionHistory);
      setNotice(`Restored ${version.reason.toLowerCase()} snapshot`);
      await refreshScripts(restored.id);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    } finally {
      setRestoringId(null);
    }
  }

  async function handleUseInterpreter(path: string) {
    setFormField("interpreterPath", path);
    setDefaultPython(path);
    setSettingsForm((current) => ({ ...current, python: path }));
    try {
      await saveSetting(pythonSettingKey, path);
      const detected = await detectPythonInterpreters();
      setInterpreters(detected);
      setNotice("Default Python updated");
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    }
  }

  async function handleDetectPython() {
    try {
      const detected = await detectPythonInterpreters();
      setInterpreters(detected);
      if (detected[0] && form.interpreterPath.trim() === "") {
        setFormField("interpreterPath", detected[0].path);
      }
      setNotice(`Found ${detected.length} Python interpreter${detected.length === 1 ? "" : "s"}`);
    } catch (error: unknown) {
      setNotice(errorMessage(error));
    }
  }


  return {
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
    openSettings: () => setSettingsOpen(true),
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
    setTheme,
    theme,
    toggleRightPanel: () => setRightPanelOpen((value) => !value),
    toggleScriptSelection,
    toggleTheme: () => setTheme((value) => (value === "dark" ? "light" : "dark")),
    versions,
    workspaces,
  };
}

function workspaceDeleteKey(workspace: string) {
  return `workspace:${workspace}`;
}

function folderDeleteKey(workspace: string, folder: string) {
  return `folder:${workspace}\u001f${folder}`;
}

function scriptWorkspaceName(script: ScriptRecord) {
  return script.workspace?.trim() || defaultWorkspaceName;
}

function scriptFolderName(script: ScriptRecord) {
  return script.category?.trim() ?? "";
}

async function confirmAction(message: string, options: ConfirmDialogOptions) {
  try {
    return await confirmDialog(message, options);
  } catch {
    return window.confirm(message);
  }
}
