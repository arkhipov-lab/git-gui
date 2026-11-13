use std::collections::HashMap;

use serde::{Deserialize, Serialize};

pub const CONFIG_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepoKind {
    Normal,
    Bare,
    Worktree,
    Submodule,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OperationKind {
    None,
    Merge,
    Rebase,
    CherryPick,
    Revert,
    Bisect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictStages {
    pub base: Option<String>,
    pub ours: Option<String>,
    pub theirs: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub original_path: Option<String>,
    pub index_status: String,
    pub worktree_status: String,
    pub staged: bool,
    pub unstaged: bool,
    pub untracked: bool,
    pub ignored: bool,
    pub unmerged: bool,
    #[serde(default)]
    pub conflict_markers: bool,
    pub rename_score: Option<u32>,
    pub submodule: String,
    pub stages: Option<ConflictStages>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub path: String,
    pub name: String,
    pub kind: RepoKind,
    pub bare: bool,
    pub branch: Option<String>,
    pub head_oid: Option<String>,
    pub detached: bool,
    pub unborn: bool,
    pub upstream: Option<String>,
    pub ahead: Option<i64>,
    pub behind: Option<i64>,
    pub operation: OperationKind,
    pub files: Vec<FileEntry>,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub untracked_count: usize,
    pub conflict_count: usize,
    pub ignored_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiffLineKind {
    Context,
    Add,
    Delete,
    Meta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub text: String,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub header: String,
    pub raw: String,
    pub old_start: u32,
    pub old_count: u32,
    pub new_start: u32,
    pub new_count: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub path: String,
    pub binary: bool,
    pub truncated: bool,
    pub insertions: u64,
    pub deletions: u64,
    pub file_header: String,
    pub hunks: Vec<DiffHunk>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumstatFile {
    pub path: String,
    pub original_path: Option<String>,
    pub additions: u64,
    pub deletions: u64,
    pub binary: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RefKind {
    Head,
    Branch,
    Remote,
    Tag,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefLabel {
    pub kind: RefKind,
    pub name: String,
    pub head: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub author_date: String,
    pub committer_name: String,
    pub committer_email: String,
    pub committer_date: String,
    pub subject: String,
    pub refs: Vec<RefLabel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitLogPage {
    pub commits: Vec<CommitSummary>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetails {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub author_date: String,
    pub committer_name: String,
    pub committer_email: String,
    pub committer_date: String,
    pub subject: String,
    pub body: String,
    pub refs: Vec<RefLabel>,
    pub files: Vec<NumstatFile>,
    pub insertions: u64,
    pub deletions: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitPreview {
    pub branch: Option<String>,
    pub detached: bool,
    pub unborn: bool,
    pub files: Vec<NumstatFile>,
    pub file_count: usize,
    pub insertions: u64,
    pub deletions: u64,
    pub head_published: bool,
    pub has_staged_changes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub ref_name: String,
    pub commit: String,
    pub subject: String,
    pub date: String,
    pub upstream: Option<String>,
    pub ahead: Option<i64>,
    pub behind: Option<i64>,
    pub upstream_gone: bool,
    pub current: bool,
    pub remote: bool,
    /// The branch the remote advertises as its HEAD, or the configured initial branch when that ref is missing.
    #[serde(default)]
    pub primary: bool,
    /// The primary branch. Hosts usually reject a direct push to it; Git itself does not store that rule.
    #[serde(default)]
    pub push_protected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub fetch_url: String,
    pub push_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StashInfo {
    pub index: u32,
    pub reference: String,
    pub commit: String,
    pub message: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    pub commit: String,
    pub annotated: bool,
    pub message: String,
    pub tagger_name: Option<String>,
    pub tagger_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationRecord {
    pub id: String,
    pub timestamp: String,
    pub repository: Option<String>,
    pub operation: String,
    pub program: String,
    pub args: Vec<String>,
    pub display: String,
    pub duration_ms: u64,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
    /// Automatic reads such as status and rev-parse. They stay in the log, but they are not the user's latest action.
    #[serde(default)]
    pub routine: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub operation_id: Option<String>,
    pub repository: Option<String>,
    pub operation: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentInfo {
    pub git_path: Option<String>,
    pub git_version: Option<String>,
    pub git_error: Option<String>,
    pub ssh_path: Option<String>,
    pub ssh_version: Option<String>,
    pub ssh_agent_available: bool,
    pub identities: Vec<String>,
    pub public_key_files: Vec<String>,
    pub global_user_name: Option<String>,
    pub global_user_email: Option<String>,
    pub local_user_name: Option<String>,
    pub local_user_email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTestResult {
    pub display: String,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchTemplate {
    pub id: String,
    pub label: String,
    pub pattern: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutPrefs {
    pub nav_percent: f64,
    pub details_percent: f64,
    pub log_percent: f64,
    #[serde(default = "default_commit_info_percent")]
    pub commit_info_percent: f64,
    pub nav_collapsed: bool,
    pub details_collapsed: bool,
    pub log_collapsed: bool,
}

fn default_commit_info_percent() -> f64 {
    42.0
}

impl Default for LayoutPrefs {
    fn default() -> Self {
        Self {
            nav_percent: 18.0,
            details_percent: 34.0,
            log_percent: 22.0,
            commit_info_percent: default_commit_info_percent(),
            nav_collapsed: false,
            details_collapsed: false,
            log_collapsed: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoUiState {
    pub section: String,
    pub selected_paths: Vec<String>,
    pub selected_commit: Option<String>,
    pub diff_mode: String,
    pub show_ignored: bool,
}

impl Default for RepoUiState {
    fn default() -> Self {
        Self {
            section: "changes".into(),
            selected_paths: Vec::new(),
            selected_commit: None,
            diff_mode: "unified".into(),
            show_ignored: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepository {
    pub path: String,
    pub name: String,
    pub last_opened: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyRecord {
    pub id: String,
    pub label: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityRecord {
    pub id: String,
    pub label: String,
    pub name: String,
    pub email: String,
}

/// Choices made while working in one repository. An empty string is an explicit
/// "use Git's own default". A missing field means the user has not chosen yet.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepoAuthMemory {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh_key_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub git_executable: Option<String>,
    #[serde(default)]
    pub ssh_key_path: Option<String>,
    #[serde(default)]
    pub ssh_keys: Vec<SshKeyRecord>,
    #[serde(default)]
    pub identities: Vec<IdentityRecord>,
    #[serde(default)]
    pub repo_auth: HashMap<String, RepoAuthMemory>,
    #[serde(default = "default_branch_name")]
    pub default_branch: String,
    #[serde(default = "default_templates")]
    pub branch_templates: Vec<BranchTemplate>,
    #[serde(default)]
    pub layout: LayoutPrefs,
    #[serde(default)]
    pub tabs: Vec<String>,
    #[serde(default)]
    pub active_tab: Option<String>,
    #[serde(default)]
    pub recent: Vec<RecentRepository>,
    #[serde(default)]
    pub repo_ui: HashMap<String, RepoUiState>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            theme: "dark".into(),
            git_executable: None,
            ssh_key_path: None,
            ssh_keys: Vec::new(),
            identities: Vec::new(),
            repo_auth: HashMap::new(),
            default_branch: "main".into(),
            branch_templates: default_templates(),
            layout: LayoutPrefs::default(),
            tabs: Vec::new(),
            active_tab: None,
            recent: Vec::new(),
            repo_ui: HashMap::new(),
        }
    }
}

fn default_version() -> u32 {
    CONFIG_VERSION
}

fn default_theme() -> String {
    "dark".into()
}

fn default_branch_name() -> String {
    "main".into()
}

pub fn default_templates() -> Vec<BranchTemplate> {
    vec![
        BranchTemplate {
            id: "feature".into(),
            label: "Feature".into(),
            pattern: "feature/{ticket}-{description}".into(),
        },
        BranchTemplate {
            id: "bugfix".into(),
            label: "Bugfix".into(),
            pattern: "bugfix/{ticket}-{description}".into(),
        },
        BranchTemplate {
            id: "hotfix".into(),
            label: "Hotfix".into(),
            pattern: "hotfix/{ticket}-{description}".into(),
        },
        BranchTemplate {
            id: "release".into(),
            label: "Release".into(),
            pattern: "release/{description}".into(),
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub config: AppConfig,
    pub environment: EnvironmentInfo,
    pub config_error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ParsedStatus {
    pub branch: Option<String>,
    pub head_oid: Option<String>,
    pub detached: bool,
    pub unborn: bool,
    pub upstream: Option<String>,
    pub ahead: Option<i64>,
    pub behind: Option<i64>,
    pub files: Vec<FileEntry>,
}
