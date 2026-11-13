import { create } from "zustand";
import { baseName, closeTab, moveTab, openTab, rememberRecent } from "../features/workspace/tabs";
import type { RecentRepository, RepoSection, RepoStatus, RepoUiState } from "../types/git";

const defaultUi = (): RepoUiState => ({
  section: "changes",
  selectedPaths: [],
  selectedCommit: null,
  diffMode: "unified",
  showIgnored: false,
});

interface WorkspaceState {
  tabs: string[];
  active: string | null;
  repoUi: Record<string, RepoUiState>;
  recent: RecentRepository[];
  ready: boolean;
  hydrate: (tabs: string[], active: string | null, repoUi: Record<string, RepoUiState>, recent: RecentRepository[]) => void;
  openRepository: (status: RepoStatus) => void;
  closeRepository: (path: string) => void;
  setActive: (path: string) => void;
  reorder: (from: number, to: number) => void;
  patchUi: (path: string, patch: Partial<RepoUiState>) => void;
  setSection: (path: string, section: RepoSection) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  tabs: [],
  active: null,
  repoUi: {},
  recent: [],
  ready: false,
  hydrate: (tabs, active, repoUi, recent) =>
    set({
      tabs,
      active: active && tabs.includes(active) ? active : (tabs[0] ?? null),
      repoUi,
      recent,
      ready: true,
    }),
  openRepository: (status) =>
    set((state) => {
      const opened = openTab(state.tabs, status.path);
      const recent = rememberRecent(state.recent, {
        path: status.path,
        name: status.name || baseName(status.path),
        lastOpened: new Date().toISOString(),
      });
      return {
        tabs: opened.tabs,
        active: opened.active,
        recent,
        repoUi: state.repoUi[status.path] ? state.repoUi : { ...state.repoUi, [status.path]: defaultUi() },
      };
    }),
  closeRepository: (path) =>
    set((state) => {
      const closed = closeTab(state.tabs, state.active, path);
      return { tabs: closed.tabs, active: closed.active };
    }),
  setActive: (path) => set({ active: path }),
  reorder: (from, to) => set((state) => ({ tabs: moveTab(state.tabs, from, to) })),
  patchUi: (path, patch) =>
    set((state) => ({
      repoUi: {
        ...state.repoUi,
        [path]: { ...(state.repoUi[path] ?? defaultUi()), ...patch },
      },
    })),
  setSection: (path, section) =>
    set((state) => ({
      repoUi: {
        ...state.repoUi,
        [path]: { ...(state.repoUi[path] ?? defaultUi()), section },
      },
    })),
}));

export function repoUiOf(path: string | null): RepoUiState {
  if (!path) return defaultUi();
  return useWorkspaceStore.getState().repoUi[path] ?? defaultUi();
}
