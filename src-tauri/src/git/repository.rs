use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use crate::error::{CommandError, ErrorKind};
use crate::git::executor::{Executor, RunOptions};
use crate::git::status::load_status;
use crate::git::util::repo_name;
use crate::models::{OperationKind, RepoKind, RepoStatus};

pub async fn resolve_repository(executor: &Executor, requested: &Path) -> Result<PathBuf, CommandError> {
    if !requested.exists() {
        return Err(CommandError::new(
            ErrorKind::InvalidRepository,
            "Open repository",
            Some(requested.to_string_lossy().into_owned()),
            "The selected path does not exist.",
        ));
    }
    if requested.join(".git").exists() {
        return Ok(canonicalize_existing(requested));
    }
    let toplevel = executor
        .run(
            RunOptions::git(
                "Resolve repository",
                requested,
                vec!["rev-parse".into(), "--show-toplevel".into()],
            )
            .routine(),
        )
        .await;
    if let Ok(output) = toplevel {
        let text = output.stdout_text();
        let root = PathBuf::from(text.trim());
        return Ok(canonicalize_existing(&root));
    }

    let bare = executor
        .run(
            RunOptions::git(
                "Resolve repository",
                requested,
                vec!["rev-parse".into(), "--is-bare-repository".into()],
            )
            .routine(),
        )
        .await?;
    if bare.stdout_text().trim() == "true" {
        let git_dir = executor
            .run(
                RunOptions::git(
                    "Resolve repository",
                    requested,
                    vec!["rev-parse".into(), "--absolute-git-dir".into()],
                )
                .routine(),
            )
            .await?;
        let root = PathBuf::from(git_dir.stdout_text().trim());
        return Ok(canonicalize_existing(&root));
    }

    Err(CommandError::new(
        ErrorKind::InvalidRepository,
        "Open repository",
        Some(requested.to_string_lossy().into_owned()),
        "The selected folder is not a Git repository.",
    ))
}

pub fn canonicalize_existing(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

pub fn detect_operation(git_dir: &Path) -> OperationKind {
    if git_dir.join("rebase-merge").is_dir() || git_dir.join("rebase-apply").is_dir() {
        OperationKind::Rebase
    } else if git_dir.join("MERGE_HEAD").is_file() {
        OperationKind::Merge
    } else if git_dir.join("CHERRY_PICK_HEAD").is_file() {
        OperationKind::CherryPick
    } else if git_dir.join("REVERT_HEAD").is_file() {
        OperationKind::Revert
    } else if git_dir.join("BISECT_LOG").is_file() {
        OperationKind::Bisect
    } else {
        OperationKind::None
    }
}

pub fn classify_kind(root: &Path, git_dir: &Path) -> (RepoKind, bool) {
    if paths_equal(root, git_dir) {
        return (RepoKind::Bare, true);
    }
    let git_dir_text = git_dir.to_string_lossy();
    if git_dir_text.contains("/worktrees/") {
        return (RepoKind::Worktree, false);
    }
    if root.join(".git").is_file() {
        return (RepoKind::Submodule, false);
    }
    (RepoKind::Normal, false)
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    canonicalize_existing(left) == canonicalize_existing(right)
}

pub async fn absolute_git_dir(executor: &Executor, root: &Path) -> Result<PathBuf, CommandError> {
    let root = canonicalize_existing(root);
    if let Some(cached) = git_dir_cache()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .get(&root)
        .cloned()
    {
        return Ok(cached);
    }
    let output = executor
        .run(
            RunOptions::git(
                "Repository",
                &root,
                vec!["rev-parse".into(), "--absolute-git-dir".into()],
            )
            .routine(),
        )
        .await?;
    let git_dir = PathBuf::from(output.stdout_text().trim());
    git_dir_cache()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .insert(root, git_dir.clone());
    Ok(git_dir)
}

fn git_dir_cache() -> &'static Mutex<HashMap<PathBuf, PathBuf>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, PathBuf>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub async fn init_repository(
    executor: &Executor,
    path: &Path,
    branch: &str,
) -> Result<RepoStatus, CommandError> {
    if branch.trim().is_empty() || branch.contains('\n') || branch.starts_with('-') {
        return Err(CommandError::new(
            ErrorKind::InvalidBranchName,
            "Initialize repository",
            Some(path.to_string_lossy().into_owned()),
            "Enter a valid initial branch name.",
        ));
    }
    if path.join(".git").exists() {
        return Err(CommandError::new(
            ErrorKind::InvalidRepository,
            "Initialize repository",
            Some(path.to_string_lossy().into_owned()),
            "This folder is already a Git repository.",
        ));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            CommandError::new(
                ErrorKind::Io,
                "Initialize repository",
                Some(path.to_string_lossy().into_owned()),
                format!("Could not create the parent folder: {err}"),
            )
        })?;
    }
    let mut options = RunOptions::program(
        "Initialize repository",
        vec![
            "init".into(),
            "-b".into(),
            branch.to_string(),
            path.to_string_lossy().into_owned(),
        ],
    );
    options.repository = Some(path.to_string_lossy().into_owned());
    options.mutating = true;
    if let Some(parent) = path.parent().filter(|parent| parent.exists()) {
        options.working_dir = Some(parent.to_path_buf());
    }
    executor.run(options).await?;
    load_status(executor, path, false).await
}

pub async fn clone_repository(
    executor: &Executor,
    url: &str,
    parent: &Path,
    directory_name: Option<&str>,
    ssh_key: Option<String>,
    operation_id: Option<String>,
) -> Result<RepoStatus, CommandError> {
    let url = url.trim();
    if url.is_empty() || url.contains('\n') || url.contains('\0') {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Clone repository",
            None,
            "Enter a remote URL.",
        ));
    }
    if !parent.is_dir() {
        return Err(CommandError::new(
            ErrorKind::Io,
            "Clone repository",
            Some(parent.to_string_lossy().into_owned()),
            "The destination folder does not exist.",
        ));
    }
    let name = directory_name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string())
        .unwrap_or_else(|| repo_name_from_url(url));
    if name.contains('/') || name.contains('\\') || name == "." || name == ".." {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Clone repository",
            None,
            "The local directory name must be a single folder name.",
        ));
    }
    let destination = parent.join(&name);
    if destination.exists() {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Clone repository",
            Some(destination.to_string_lossy().into_owned()),
            "The destination already exists.",
        ));
    }
    let mut options = RunOptions::program(
        "Clone repository",
        vec![
            "clone".into(),
            "--progress".into(),
            "--".into(),
            url.to_string(),
            destination.to_string_lossy().into_owned(),
        ],
    );
    options.repository = Some(destination.to_string_lossy().into_owned());
    options.working_dir = Some(parent.to_path_buf());
    options.mutating = true;
    options.network = true;
    options.stream = true;
    options.operation_id = operation_id;
    executor.run(options.authorize(ssh_key, None, None, false)?).await?;
    load_status(executor, &destination, false).await
}

fn repo_name_from_url(url: &str) -> String {
    let trimmed = url.trim_end_matches('/').trim_end_matches(".git");
    trimmed
        .rsplit(['/', ':'])
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or("repository")
        .to_string()
}

pub fn display_name(path: &Path) -> String {
    repo_name(path)
}
