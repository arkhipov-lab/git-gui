use std::path::Path;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use tauri::Emitter;

use crate::error::{CommandError, ErrorKind};
use crate::services::state::AppState;

pub fn watch(state: &AppState, path: &str) -> Result<(), CommandError> {
    let root = Path::new(path);
    if !root.exists() {
        return Err(CommandError::new(
            ErrorKind::InvalidRepository,
            "Watch repository",
            Some(path.to_string()),
            "The repository path does not exist.",
        ));
    }
    let app = state.app.clone();
    let executor = state.executor.clone();
    let repo_path = path.to_string();
    let mut debouncer = new_debouncer(Duration::from_millis(400), move |result: DebounceEventResult| {
            let Ok(events) = result else {
                return;
            };
            let suppress_index = executor.wrote_recently(&repo_path);
            let repo = Path::new(&repo_path);
            let relevant = events
                .iter()
                .any(|event| is_relevant(&event.path, repo, suppress_index));
            if relevant {
                let _ = app.emit("repo-changed", RepoChanged { path: repo_path.clone() });
            }
        },
    )
    .map_err(|err| {
        CommandError::new(
            ErrorKind::Io,
            "Watch repository",
            Some(path.to_string()),
            format!("Could not watch the repository: {err}"),
        )
    })?;
    debouncer
        .watcher()
        .watch(root, RecursiveMode::Recursive)
        .map_err(|err| {
            CommandError::new(
                ErrorKind::Io,
                "Watch repository",
                Some(path.to_string()),
                format!("Could not watch the repository: {err}"),
            )
        })?;
    state
        .watchers
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .insert(path.to_string(), debouncer);
    Ok(())
}

pub fn unwatch(state: &AppState, path: &str) {
    state
        .watchers
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .remove(path);
}

fn is_relevant(path: &Path, repo: &Path, suppress_index: bool) -> bool {
    let text = path.to_string_lossy();
    if text.contains("/.git/objects")
        || text.contains("/.git/hooks")
        || text.contains("/.git/lfs")
        || text.contains("/.git/logs/")
        || text.contains("/.git/info/")
    {
        return false;
    }
    if is_index_lock(path) {
        return false;
    }
    // `git status` rewrites `.git/index`. macOS may report that write as the index, the `.git` directory, or the repository root.
    if suppress_index && (is_own_git_write(path) || same_path(path, repo)) {
        return false;
    }
    true
}

fn same_path(left: &Path, right: &Path) -> bool {
    fn normalize(path: &Path) -> String {
        let text = path.to_string_lossy();
        text.strip_prefix("/private")
            .unwrap_or(&text)
            .trim_end_matches('/')
            .to_string()
    }
    normalize(left) == normalize(right)
}

fn is_index_lock(path: &Path) -> bool {
    path.file_name().and_then(|name| name.to_str()) == Some("index.lock") && inside_git_dir(path)
}

fn is_own_git_write(path: &Path) -> bool {
    let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
    if name == "index" && inside_git_dir(path) {
        return true;
    }
    name == ".git"
}

fn inside_git_dir(path: &Path) -> bool {
    path.components().any(|component| component.as_os_str() == ".git")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_status_index_writes_and_keeps_real_edits() {
        let file = Path::new("/repo/src/main.rs");
        let index = Path::new("/repo/.git/index");
        let lock = Path::new("/repo/.git/index.lock");
        let head = Path::new("/repo/.git/HEAD");
        let git_dir = Path::new("/repo/.git");
        let repo = Path::new("/repo");
        assert!(is_relevant(file, repo, true));
        assert!(!is_relevant(index, repo, true));
        assert!(is_relevant(index, repo, false));
        assert!(!is_relevant(lock, repo, false));
        assert!(is_relevant(head, repo, true));
        assert!(!is_relevant(git_dir, repo, true));
        assert!(is_relevant(git_dir, repo, false));
        assert!(!is_relevant(repo, repo, true));
        assert!(is_relevant(repo, repo, false));
        assert!(!is_relevant(Path::new("/repo/.git/objects/ab/cd"), repo, false));
    }
}

#[derive(Clone, serde::Serialize)]
struct RepoChanged {
    path: String,
}
