import { useHotkeys } from "@mantine/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef } from "react";
import { cycleTab } from "../features/workspace/tabs";
import { api } from "../services/git/api";
import { refreshRepository } from "../services/git/actions";
import { normalizeError } from "../services/tauri/client";
import { useLogStore } from "../stores/logStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { AppConfig, GitError, OperationRecord, ProgressEvent, RepoChanged } from "../types/git";

export function useDesktopSession(): { notice: GitError | null; openRepository: () => Promise<void> } {
  const queryClient = useQueryClient();
  const notice = useUiStore((state) => state.errors.app ?? null);
  const ready = useWorkspaceStore((state) => state.ready);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const active = useWorkspaceStore((state) => state.active);
  const repoUi = useWorkspaceStore((state) => state.repoUi);
  const recent = useWorkspaceStore((state) => state.recent);
  const theme = useSettingsStore((state) => state.theme);
  const gitExecutable = useSettingsStore((state) => state.gitExecutable);
  const sshKeys = useSettingsStore((state) => state.sshKeys);
  const identities = useSettingsStore((state) => state.identities);
  const repoAuth = useSettingsStore((state) => state.repoAuth);
  const defaultBranch = useSettingsStore((state) => state.defaultBranch);
  const branchTemplates = useSettingsStore((state) => state.branchTemplates);
  const layout = useSettingsStore((state) => state.layout);
  const menuAt = useRef(0);
  const watched = useRef(new Set<string>());
  const statusQuietUntil = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelled = false;
    void api.bootstrap().then(async (boot) => {
      if (cancelled) return;
      useSettingsStore.getState().hydrate(boot.config);
      useWorkspaceStore.getState().hydrate(boot.config.tabs, boot.config.activeTab ?? null, boot.config.repoUi, boot.config.recent);
      if (boot.configError) {
        useUiStore.getState().setError("app", normalizeError(boot.configError, "Load settings"));
      }
      const entries = await api.operationLog();
      if (!cancelled) useLogStore.getState().setAll(entries);
    }).catch((error: unknown) => {
      useUiStore.getState().setError("app", normalizeError(error, "Start Git Desktop"));
      useWorkspaceStore.getState().hydrate([], null, {}, []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void api.saveConfig(currentConfig()).catch((error: unknown) => {
        useUiStore.getState().setError("app", normalizeError(error, "Save settings"));
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [ready, tabs, active, repoUi, recent, theme, gitExecutable, sshKeys, identities, repoAuth, defaultBranch, branchTemplates, layout]);

  useEffect(() => {
    if (!ready) return;
    const current = new Set(tabs);
    for (const path of tabs) {
      if (watched.current.has(path)) continue;
      watched.current.add(path);
      void api.watchRepository(path).catch(() => undefined);
    }
    for (const path of watched.current) {
      if (current.has(path)) continue;
      watched.current.delete(path);
      void api.unwatchRepository(path).catch(() => undefined);
    }
  }, [ready, tabs]);

  useEffect(() => {
    const subscriptions = [
      listen<OperationRecord>("git-log", (event) => useLogStore.getState().add(event.payload)),
      listen<ProgressEvent>("git-progress", (event) => {
        const path = event.payload.repository;
        if (path) useUiStore.getState().pushProgress(path, event.payload.line);
      }),
      listen<RepoChanged>("repo-changed", (event) => {
        const path = event.payload.path;
        const now = Date.now();
        if ((statusQuietUntil.current.get(path) ?? 0) > now) return;
        statusQuietUntil.current.set(path, now + 1200);
        void queryClient.invalidateQueries({ queryKey: ["status", path] });
        void queryClient.invalidateQueries({ queryKey: ["branches", path] });
        void queryClient.invalidateQueries({ queryKey: ["log", path] });
        void queryClient.invalidateQueries({ queryKey: ["stashes", path] });
        void queryClient.invalidateQueries({ queryKey: ["tags", path] });
        void queryClient.invalidateQueries({ queryKey: ["commit", path] });
        void queryClient.invalidateQueries({ queryKey: ["diff", path] });
      }),
      listen<string>("menu-event", (event) => {
        menuAt.current = Date.now();
        runMenu(event.payload, queryClient);
      }),
    ];
    return () => {
      void Promise.all(subscriptions).then((stops) => stops.forEach((stop) => stop()));
    };
  }, [queryClient]);

  useHotkeys(
    [
      ["mod+O", (event) => guarded(event, () => void openRepository()), { preventDefault: true }],
      ["mod+T", (event) => guarded(event, () => useUiStore.getState().setOpenMenu(true)), { preventDefault: true }],
      ["mod+W", (event) => guarded(event, closeActive), { preventDefault: true }],
      ["mod+R", (event) => guarded(event, () => void refreshActive(queryClient)), { preventDefault: true }],
      ["mod+Enter", (event) => guarded(event, () => useUiStore.getState().setDialog({ type: "commit" })), { preventDefault: true }],
      ["mod+F", (event) => guarded(event, focusSearch), { preventDefault: true }],
      ["mod+Comma", (event) => guarded(event, () => useUiStore.getState().setView("settings")), { preventDefault: true }],
      ["ctrl+Tab", (event) => guarded(event, () => cycle(1)), { preventDefault: true }],
      ["ctrl+shift+Tab", (event) => guarded(event, () => cycle(-1)), { preventDefault: true }],
    ],
    [],
  );

  return { notice, openRepository };

  function guarded(event: KeyboardEvent, action: () => void) {
    if (Date.now() - menuAt.current < 200) return;
    event.preventDefault();
    action();
  }
}

async function openRepository(): Promise<void> {
  const selected = await open({ directory: true, multiple: false, title: "Open repository" });
  if (typeof selected !== "string") return;
  try {
    const status = await api.repositoryStatus(selected, false);
    useWorkspaceStore.getState().openRepository(status);
  } catch (error) {
    useUiStore.getState().setError("app", normalizeError(error, "Open repository"));
  }
}

function closeActive() {
  const { active, closeRepository } = useWorkspaceStore.getState();
  if (active) closeRepository(active);
}

function refreshActive(queryClient: ReturnType<typeof useQueryClient>) {
  const active = useWorkspaceStore.getState().active;
  if (active) return refreshRepository(queryClient, active);
  return Promise.resolve();
}

function focusSearch() {
  document.getElementById("repo-search")?.focus();
}

function cycle(direction: 1 | -1) {
  const { tabs, active, setActive } = useWorkspaceStore.getState();
  const next = cycleTab(tabs, active, direction);
  if (next) setActive(next);
}

function runMenu(id: string, queryClient: ReturnType<typeof useQueryClient>) {
  const ui = useUiStore.getState();
  if (id === "open") void openRepository();
  if (id === "clone") ui.setDialog({ type: "clone" });
  if (id === "init") ui.setDialog({ type: "init" });
  if (id === "close-tab") closeActive();
  if (id === "refresh") void refreshActive(queryClient);
  if (id === "fetch") ui.setDialog({ type: "fetch" });
  if (id === "pull") ui.setDialog({ type: "pull" });
  if (id === "push") ui.setDialog({ type: "push" });
  if (id === "commit") ui.setDialog({ type: "commit" });
  if (id === "branch") ui.setDialog({ type: "branch" });
  if (id === "stash") ui.setDialog({ type: "stash" });
  if (id === "cherry-pick") ui.setDialog({ type: "cherry-pick-into" });
  if (id === "settings") ui.setView(ui.view === "settings" ? "workspace" : "settings");
  if (id === "toggle-nav") window.dispatchEvent(new CustomEvent("git-desktop-toggle", { detail: "nav" }));
  if (id === "toggle-details") window.dispatchEvent(new CustomEvent("git-desktop-toggle", { detail: "details" }));
  if (id === "toggle-log") window.dispatchEvent(new CustomEvent("git-desktop-toggle", { detail: "log" }));
}

function currentConfig(): AppConfig {
  const workspace = useWorkspaceStore.getState();
  const settings = useSettingsStore.getState();
  return {
    version: 1,
    theme: settings.theme,
    gitExecutable: settings.gitExecutable.trim() || null,
    sshKeyPath: null,
    sshKeys: settings.sshKeys,
    identities: settings.identities,
    repoAuth: settings.repoAuth,
    defaultBranch: settings.defaultBranch || "main",
    branchTemplates: settings.branchTemplates,
    layout: settings.layout,
    tabs: workspace.tabs,
    activeTab: workspace.active,
    recent: workspace.recent,
    repoUi: workspace.repoUi,
  };
}
