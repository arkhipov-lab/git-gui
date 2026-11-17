import { create } from "zustand";
import type { FileDiffKind, GitError } from "../types/git";

export type AppView = "workspace" | "settings";

export interface ConfirmRequest {
  type: "confirm";
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => Promise<void> | void;
}

export type DialogRequest =
  | null
  | { type: "clone" }
  | { type: "init" }
  | { type: "commit" }
  | { type: "branch"; source?: string }
  | { type: "fetch" }
  | { type: "pull"; remote?: string; branch?: string; localBranch?: string; checkedOut?: boolean }
  | { type: "push"; branch?: string; setUpstream?: boolean }
  | { type: "stash" }
  | { type: "tag"; target?: string }
  | { type: "add-remote" }
  | { type: "rename-branch"; name: string }
  | { type: "set-upstream"; branch: string }
  | { type: "delete-branch"; name: string }
  | { type: "push-tag"; name: string }
  | { type: "soft-reset"; commits: HistoryCommit[] }
  | { type: "revert"; commits: HistoryCommit[] }
  | { type: "cherry-pick"; commits: HistoryCommit[] }
  | { type: "cherry-pick-into" }
  | { type: "sequence"; action: "continue" | "skip" }
  | { type: "about" }
  | ConfirmRequest;

export interface HistoryCommit {
  hash: string;
  parents: string[];
  subject: string;
}

export interface FileFocus {
  path: string;
  kind: FileDiffKind;
  rev?: string;
  from?: string;
  to?: string;
}

export interface SearchDraft {
  value: string;
  open: boolean;
}

export function searchKey(path: string, section: string): string {
  return `${path}\n${section}`;
}

interface UiState {
  view: AppView;
  dialog: DialogRequest;
  busy: Record<string, string>;
  progress: Record<string, string[]>;
  errors: Record<string, GitError | null>;
  focus: Record<string, FileFocus | null>;
  searches: Record<string, SearchDraft>;
  searchFocus: number;
  openMenu: boolean;
  setView: (view: AppView) => void;
  setDialog: (dialog: DialogRequest) => void;
  setBusy: (path: string, label: string | null) => void;
  pushProgress: (path: string, line: string) => void;
  clearProgress: (path: string) => void;
  setError: (path: string, error: GitError | null) => void;
  setFocus: (repo: string, focus: FileFocus | null) => void;
  setSearchValue: (path: string, section: string, value: string) => void;
  setSearchOpen: (path: string, section: string, open: boolean) => void;
  clearSearch: (path: string, section: string) => void;
  openSearch: (path: string, section: string) => void;
  setOpenMenu: (openMenu: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "workspace",
  dialog: null,
  busy: {},
  progress: {},
  errors: {},
  focus: {},
  searches: {},
  searchFocus: 0,
  openMenu: false,
  setView: (view) => set({ view }),
  setDialog: (dialog) => set({ dialog }),
  setBusy: (path, label) =>
    set((state) => {
      const busy = { ...state.busy };
      if (label) busy[path] = label;
      else delete busy[path];
      return { busy };
    }),
  pushProgress: (path, line) =>
    set((state) => ({
      progress: { ...state.progress, [path]: [...(state.progress[path] ?? []), line].slice(-200) },
    })),
  clearProgress: (path) =>
    set((state) => {
      const progress = { ...state.progress };
      delete progress[path];
      return { progress };
    }),
  setError: (path, error) => set((state) => ({ errors: { ...state.errors, [path]: error } })),
  setFocus: (repo, focus) => set((state) => ({ focus: { ...state.focus, [repo]: focus } })),
  setSearchValue: (path, section, value) =>
    set((state) => {
      const key = searchKey(path, section);
      const current = state.searches[key] ?? { value: "", open: false };
      return { searches: { ...state.searches, [key]: { ...current, value } } };
    }),
  setSearchOpen: (path, section, open) =>
    set((state) => {
      const key = searchKey(path, section);
      const current = state.searches[key] ?? { value: "", open: false };
      return { searches: { ...state.searches, [key]: { ...current, open } } };
    }),
  clearSearch: (path, section) =>
    set((state) => {
      const key = searchKey(path, section);
      const current = state.searches[key] ?? { value: "", open: false };
      return { searches: { ...state.searches, [key]: { ...current, value: "" } } };
    }),
  openSearch: (path, section) =>
    set((state) => {
      const key = searchKey(path, section);
      const current = state.searches[key] ?? { value: "", open: false };
      return {
        searches: { ...state.searches, [key]: { ...current, open: true } },
        searchFocus: state.searchFocus + 1,
      };
    }),
  setOpenMenu: (openMenu) => set({ openMenu }),
}));
