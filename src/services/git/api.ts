import { invokeCommand } from "../tauri/client";
import type {
  AppConfig,
  Bootstrap,
  BranchInfo,
  CommitDetails,
  CommitLogPage,
  CommitPreview,
  DiffResult,
  EnvironmentInfo,
  NumstatFile,
  OperationRecord,
  RemoteInfo,
  RepoStatus,
  SshTestResult,
  StashInfo,
  TagInfo,
} from "../../types/git";

export const api = {
  bootstrap: () => invokeCommand<Bootstrap>("bootstrap"),
  saveConfig: (config: AppConfig) => invokeCommand<void>("save_config", { config }),
  repositoryStatus: (path: string, includeIgnored: boolean) =>
    invokeCommand<RepoStatus>("repository_status", { path, includeIgnored }),
  watchRepository: (path: string) => invokeCommand<void>("watch_repository", { path }),
  unwatchRepository: (path: string) => invokeCommand<void>("unwatch_repository", { path }),
  initRepository: (path: string, branch: string) =>
    invokeCommand<RepoStatus>("init_repository", { path, branch }),
  cloneRepository: (url: string, parent: string, directoryName: string | null, sshKey: string | null, operationId: string) =>
    invokeCommand<RepoStatus>("clone_repository", { url, parent, directoryName, sshKey, operationId }),
  fileDiff: (path: string, kind: string, filePath: string, rev?: string, from?: string, to?: string) =>
    invokeCommand<DiffResult>("file_diff", { path, kind, filePath, rev, from, to }),
  compareRevisions: (path: string, from: string, to: string) =>
    invokeCommand<NumstatFile[]>("compare_revisions", { path, from, to }),
  stagePaths: (path: string, paths: string[]) => invokeCommand<void>("stage_paths", { path, paths }),
  unstagePaths: (path: string, paths: string[]) => invokeCommand<void>("unstage_paths", { path, paths }),
  stageAll: (path: string) => invokeCommand<void>("stage_all", { path }),
  unstageAll: (path: string) => invokeCommand<void>("unstage_all", { path }),
  discardUnstaged: (path: string, paths: string[]) =>
    invokeCommand<void>("discard_unstaged", { path, paths }),
  applyHunks: (path: string, filePath: string, reverse: boolean, hunks: string[]) =>
    invokeCommand<void>("apply_hunks", { path, filePath, reverse, hunks }),
  commitPreview: (path: string) => invokeCommand<CommitPreview>("commit_preview", { path }),
  commit: (path: string, subject: string, body: string, amend: boolean, identity: GitIdentity | null) =>
    invokeCommand<void>("commit", { path, subject, body, amend, ...identityFields(identity) }),
  listBranches: (path: string, fallback?: string) =>
    invokeCommand<BranchInfo[]>("list_branches", { path, fallback: fallback || null }),
  createBranch: (path: string, name: string, source: string, checkout: boolean) =>
    invokeCommand<void>("create_branch", { path, name, source, checkout }),
  switchBranch: (path: string, name: string) => invokeCommand<void>("switch_branch", { path, name }),
  renameBranch: (path: string, oldName: string, newName: string) =>
    invokeCommand<void>("rename_branch", { path, oldName, newName }),
  deleteBranch: (path: string, name: string, force: boolean) =>
    invokeCommand<void>("delete_branch", { path, name, force }),
  setUpstream: (path: string, branch: string, upstream: string) =>
    invokeCommand<void>("set_upstream", { path, branch, upstream }),
  validateBranchName: (path: string, name: string) =>
    invokeCommand<void>("validate_branch_name", { path, name }),
  commitLog: (path: string, skip: number, limit: number, grep?: string, revision?: string | null) =>
    invokeCommand<CommitLogPage>("commit_log", { path, skip, limit, grep: grep ?? null, revision: revision ?? null }),
  commitDetails: (path: string, rev: string) =>
    invokeCommand<CommitDetails>("commit_details", { path, rev }),
  listRemotes: (path: string) => invokeCommand<RemoteInfo[]>("list_remotes", { path }),
  addRemote: (path: string, name: string, url: string) =>
    invokeCommand<void>("add_remote", { path, name, url }),
  removeRemote: (path: string, name: string) => invokeCommand<void>("remove_remote", { path, name }),
  fetchRemote: (path: string, remote: string | null, prune: boolean, scope: "branches" | "tags" | "tags-force", sshKey: string | null, operationId: string) =>
    invokeCommand<void>("fetch_remote", { path, remote, prune, scope, sshKey, operationId }),
  pull: (
    path: string,
    remote: string,
    branch: string,
    strategy: string,
    operationId: string,
    checkedOut = true,
    localBranch: string | null = null,
    force = false,
    sshKey: string | null = null,
    identity: GitIdentity | null = null,
  ) => invokeCommand<void>("pull", { path, remote, branch, strategy, operationId, checkedOut, localBranch, force, sshKey, ...identityFields(identity) }),
  push: (path: string, remote: string, branch: string, setUpstream: boolean, operationId: string, force = false, sshKey: string | null = null) =>
    invokeCommand<void>("push", { path, remote, branch, setUpstream, operationId, force, sshKey }),
  listStashes: (path: string) => invokeCommand<StashInfo[]>("list_stashes", { path }),
  createStash: (path: string, message: string, includeUntracked: boolean, identity: GitIdentity | null) =>
    invokeCommand<void>("create_stash", { path, message, includeUntracked, ...identityFields(identity) }),
  stashAction: (path: string, action: "apply" | "pop" | "drop", index: number) =>
    invokeCommand<void>("stash_action", { path, action, index }),
  stashDiff: (path: string, index: number) => invokeCommand<DiffResult>("stash_diff", { path, index }),
  listTags: (path: string) => invokeCommand<TagInfo[]>("list_tags", { path }),
  createTag: (path: string, name: string, target: string, annotated: boolean, message: string, identity: GitIdentity | null) =>
    invokeCommand<void>("create_tag", { path, name, target, annotated, message, ...identityFields(identity) }),
  deleteTag: (path: string, name: string) => invokeCommand<void>("delete_tag", { path, name }),
  pushTag: (path: string, remote: string, name: string, sshKey: string | null, operationId: string) =>
    invokeCommand<void>("push_tag", { path, remote, name, sshKey, operationId }),
  operationLog: () => invokeCommand<OperationRecord[]>("operation_log"),
  clearOperationLog: () => invokeCommand<void>("clear_operation_log"),
  cancelOperation: (operationId: string) => invokeCommand<boolean>("cancel_operation", { operationId }),
  environmentInfo: (path?: string) => invokeCommand<EnvironmentInfo>("environment_info", { path }),
  setIdentity: (path: string | null, name: string, email: string, global: boolean) =>
    invokeCommand<void>("set_identity", { path, name, email, global }),
  sshTest: (target: string, keyPath: string | null) => invokeCommand<SshTestResult>("ssh_test", { target, keyPath }),
  sshPassphraseStored: (keyPath: string) => invokeCommand<boolean>("ssh_passphrase_stored", { keyPath }),
  saveSshPassphrase: (keyPath: string, passphrase: string) =>
    invokeCommand<void>("save_ssh_passphrase", { keyPath, passphrase }),
  clearSshPassphrase: (keyPath: string) => invokeCommand<void>("clear_ssh_passphrase", { keyPath }),
  detectGit: (preferred?: string) => invokeCommand<string>("detect_git", { preferred }),
  resetSoft: (path: string, target: string) => invokeCommand<void>("reset_soft", { path, target }),
  revertCommit: (path: string, rev: string, mainline: boolean, identity: GitIdentity | null) =>
    invokeCommand<void>("revert_commit", { path, rev, mainline, ...identityFields(identity) }),
  cherryPick: (path: string, revs: string[], branch: string | null, identity: GitIdentity | null) =>
    invokeCommand<void>("cherry_pick", { path, revs, branch, ...identityFields(identity) }),
  sequenceAction: (path: string, action: "continue" | "skip" | "abort", identity: GitIdentity | null) =>
    invokeCommand<void>("sequence_action", { path, action, ...identityFields(identity) }),
  terminalOpen: (path: string) => invokeCommand<string>("terminal_open", { path }),
  terminalWrite: (id: string, data: string) => invokeCommand<void>("terminal_write", { id, data }),
  terminalResize: (id: string, rows: number, cols: number) =>
    invokeCommand<void>("terminal_resize", { id, rows, cols }),
  terminalClose: (id: string) => invokeCommand<void>("terminal_close", { id }),
};

export interface GitIdentity {
  name: string;
  email: string;
}

function identityFields(identity: GitIdentity | null) {
  return {
    identityName: identity?.name ?? null,
    identityEmail: identity?.email ?? null,
  };
}
