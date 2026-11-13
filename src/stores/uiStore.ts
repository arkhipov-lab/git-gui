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

interface UiState {
  view: AppView;
  dialog: DialogRequest;
  busy: Record<string, string>;
  progress: Record<string, string[]>;
  errors: Record<string, GitError | null>;
  focus: Record<string, FileFocus | null>;
  search: string;
  openMenu: boolean;
  setView: (view: AppView) => void;
  setDialog: (dialog: DialogRequest) => void;
  setBusy: (path: string, label: string | null) => void;
  pushProgress: (path: string, line: string) => void;
  clearProgress: (path: string) => void;
  setError: (path: string, error: GitError | null) => void;
  setFocus: (repo: string, focus: FileFocus | null) => void;
  setSearch: (search: string) => void;
  setOpenMenu: (openMenu: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "workspace",
  dialog: null,
  busy: {},
  progress: {},
  errors: {},
  focus: {},
  search: "",
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
  setSearch: (search) => set({ search }),
  setOpenMenu: (openMenu) => set({ openMenu }),
}));
