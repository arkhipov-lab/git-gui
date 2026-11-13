import { create } from "zustand";
import type { AppConfig, BranchTemplate, IdentityRecord, LayoutPrefs, RepoAuthMemory, SshKeyRecord } from "../types/git";

const defaultLayout = (): LayoutPrefs => ({
  navPercent: 18,
  detailsPercent: 34,
  logPercent: 22,
  commitInfoPercent: 42,
  navCollapsed: false,
  detailsCollapsed: false,
  logCollapsed: false,
});

interface SettingsState {
  theme: "dark" | "light";
  gitExecutable: string;
  sshKeys: SshKeyRecord[];
  identities: IdentityRecord[];
  repoAuth: Record<string, RepoAuthMemory>;
  defaultBranch: string;
  branchTemplates: BranchTemplate[];
  layout: LayoutPrefs;
  hydrate: (config: AppConfig) => void;
  setTheme: (theme: "dark" | "light") => void;
  setGitExecutable: (path: string) => void;
  setSshKeys: (sshKeys: SshKeyRecord[]) => void;
  setIdentities: (identities: IdentityRecord[]) => void;
  rememberAuth: (repo: string, patch: RepoAuthMemory) => void;
  setDefaultBranch: (branch: string) => void;
  setTemplates: (templates: BranchTemplate[]) => void;
  setLayout: (layout: Partial<LayoutPrefs>) => void;
}

function migratedKeys(config: AppConfig): SshKeyRecord[] {
  const keys = config.sshKeys ?? [];
  if (keys.length > 0) return keys;
  const path = config.sshKeyPath?.trim();
  if (!path) return [];
  return [{ id: "legacy-ssh", label: path.split("/").pop() || "SSH key", path }];
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: "dark",
  gitExecutable: "",
  sshKeys: [],
  identities: [],
  repoAuth: {},
  defaultBranch: "main",
  branchTemplates: [
    { id: "feature", label: "Feature", pattern: "feature/{ticket}-{description}" },
    { id: "bugfix", label: "Bugfix", pattern: "bugfix/{ticket}-{description}" },
    { id: "hotfix", label: "Hotfix", pattern: "hotfix/{ticket}-{description}" },
    { id: "release", label: "Release", pattern: "release/{description}" },
  ],
  layout: defaultLayout(),
  hydrate: (config) =>
    set({
      theme: config.theme === "light" ? "light" : "dark",
      gitExecutable: config.gitExecutable ?? "",
      sshKeys: migratedKeys(config),
      identities: config.identities ?? [],
      repoAuth: config.repoAuth ?? {},
      defaultBranch: config.defaultBranch || "main",
      branchTemplates: config.branchTemplates,
      layout: { ...defaultLayout(), ...config.layout },
    }),
  setTheme: (theme) => set({ theme }),
  setGitExecutable: (gitExecutable) => set({ gitExecutable }),
  setSshKeys: (sshKeys) => set({ sshKeys }),
  setIdentities: (identities) => set({ identities }),
  rememberAuth: (repo, patch) =>
    set((state) => ({
      repoAuth: { ...state.repoAuth, [repo]: { ...state.repoAuth[repo], ...patch } },
    })),
  setDefaultBranch: (defaultBranch) => set({ defaultBranch }),
  setTemplates: (branchTemplates) => set({ branchTemplates }),
  setLayout: (layout) => set((state) => ({ layout: { ...state.layout, ...layout } })),
}));
