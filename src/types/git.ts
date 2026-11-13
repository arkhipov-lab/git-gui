export type RepoKind = "normal" | "bare" | "worktree" | "submodule";

export type OperationKind = "none" | "merge" | "rebase" | "cherryPick" | "revert" | "bisect";

export type ErrorKind =
  | "gitNotFound"
  | "invalidRepository"
  | "invalidBranchName"
  | "branchExists"
  | "checkoutConflict"
  | "authFailed"
  | "remoteNotFound"
  | "pushRejected"
  | "mergeConflict"
  | "rebaseConflict"
  | "lockFile"
  | "permissionDenied"
  | "network"
  | "detachedHead"
  | "noCommits"
  | "cancelled"
  | "io"
  | "other";

export interface GitError {
  kind: ErrorKind;
  operation: string;
  repository?: string | null;
  command: string;
  args: string[];
  exitCode?: number | null;
  message: string;
  stderr: string;
  stdout: string;
}

export interface ConflictStages {
  base?: string | null;
  ours?: string | null;
  theirs?: string | null;
}

export interface FileEntry {
  path: string;
  originalPath?: string | null;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  ignored: boolean;
  unmerged: boolean;
  conflictMarkers?: boolean;
  renameScore?: number | null;
  submodule: string;
  stages?: ConflictStages | null;
}

export interface RepoStatus {
  path: string;
  name: string;
  kind: RepoKind;
  bare: boolean;
  branch?: string | null;
  headOid?: string | null;
  detached: boolean;
  unborn: boolean;
  upstream?: string | null;
  ahead?: number | null;
  behind?: number | null;
  operation: OperationKind;
  files: FileEntry[];
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictCount: number;
  ignoredCount: number;
}

export type DiffLineKind = "context" | "add" | "delete" | "meta";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldLine?: number | null;
  newLine?: number | null;
}

export interface DiffHunk {
  header: string;
  raw: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffResult {
  path: string;
  binary: boolean;
  truncated: boolean;
  insertions: number;
  deletions: number;
  fileHeader: string;
  hunks: DiffHunk[];
  message?: string | null;
}

export interface NumstatFile {
  path: string;
  originalPath?: string | null;
  additions: number;
  deletions: number;
  binary: boolean;
}

export type RefKind = "head" | "branch" | "remote" | "tag";

export interface RefLabel {
  kind: RefKind;
  name: string;
  head: boolean;
}

export interface CommitSummary {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDate: string;
  committerName: string;
  committerEmail: string;
  committerDate: string;
  subject: string;
  refs: RefLabel[];
}

export interface CommitLogPage {
  commits: CommitSummary[];
  hasMore: boolean;
}

export interface CommitDetails {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDate: string;
  committerName: string;
  committerEmail: string;
  committerDate: string;
  subject: string;
  body: string;
  refs: RefLabel[];
  files: NumstatFile[];
  insertions: number;
  deletions: number;
}

export interface CommitPreview {
  branch?: string | null;
  detached: boolean;
  unborn: boolean;
  files: NumstatFile[];
  fileCount: number;
  insertions: number;
  deletions: number;
  headPublished: boolean;
  hasStagedChanges: boolean;
}

export interface BranchInfo {
  name: string;
  refName: string;
  commit: string;
  subject: string;
  date: string;
  upstream?: string | null;
  ahead?: number | null;
  behind?: number | null;
  upstreamGone: boolean;
  current: boolean;
  remote: boolean;
  primary?: boolean;
  pushProtected?: boolean;
}

export interface RemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface StashInfo {
  index: number;
  reference: string;
  commit: string;
  message: string;
  date: string;
}

export interface TagInfo {
  name: string;
  commit: string;
  annotated: boolean;
  message: string;
  taggerName?: string | null;
  taggerDate?: string | null;
}

export interface OperationRecord {
  id: string;
  timestamp: string;
  repository?: string | null;
  operation: string;
  program: string;
  args: string[];
  display: string;
  durationMs: number;
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  success: boolean;
  routine?: boolean;
}

export interface ProgressEvent {
  operationId?: string | null;
  repository?: string | null;
  operation: string;
  line: string;
}

export interface EnvironmentInfo {
  gitPath?: string | null;
  gitVersion?: string | null;
  gitError?: string | null;
  sshPath?: string | null;
  sshVersion?: string | null;
  sshAgentAvailable: boolean;
  identities: string[];
  publicKeyFiles: string[];
  globalUserName?: string | null;
  globalUserEmail?: string | null;
  localUserName?: string | null;
  localUserEmail?: string | null;
}

export interface SshTestResult {
  display: string;
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  success: boolean;
}

export interface BranchTemplate {
  id: string;
  label: string;
  pattern: string;
}

export interface LayoutPrefs {
  navPercent: number;
  detailsPercent: number;
  logPercent: number;
  commitInfoPercent: number;
  navCollapsed: boolean;
  detailsCollapsed: boolean;
  logCollapsed: boolean;
}

export type RepoSection = "changes" | "history" | "branch-log" | "branches" | "remotes" | "tags" | "stashes";

export interface RepoUiState {
  section: RepoSection;
  selectedPaths: string[];
  selectedCommit?: string | null;
  diffMode: "unified" | "split";
  showIgnored: boolean;
}

export interface RecentRepository {
  path: string;
  name: string;
  lastOpened: string;
}

export interface SshKeyRecord {
  id: string;
  label: string;
  path: string;
}

export interface IdentityRecord {
  id: string;
  label: string;
  name: string;
  email: string;
}

export interface RepoAuthMemory {
  sshKeyId?: string;
  identityId?: string;
}

export interface AppConfig {
  version: number;
  theme: "dark" | "light";
  gitExecutable?: string | null;
  sshKeyPath?: string | null;
  sshKeys?: SshKeyRecord[];
  identities?: IdentityRecord[];
  repoAuth?: Record<string, RepoAuthMemory>;
  defaultBranch: string;
  branchTemplates: BranchTemplate[];
  layout: LayoutPrefs;
  tabs: string[];
  activeTab?: string | null;
  recent: RecentRepository[];
  repoUi: Record<string, RepoUiState>;
}

export interface Bootstrap {
  config: AppConfig;
  environment: EnvironmentInfo;
  configError?: string | null;
}

export interface RepoChanged {
  path: string;
}

export type FileDiffKind = "staged" | "unstaged" | "untracked" | "commit" | "range";
