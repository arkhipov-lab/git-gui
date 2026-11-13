use std::fs;
use std::path::Path;
use std::sync::Arc;

use git_desktop_lib::git::branches;
use git_desktop_lib::git::commits;
use git_desktop_lib::git::executor::{Executor, NullBus};
use git_desktop_lib::git::repository;
use git_desktop_lib::git::staging;
use git_desktop_lib::git::stash;
use git_desktop_lib::git::status;
use git_desktop_lib::git::tags;
use git_desktop_lib::models::OperationKind;

fn executor() -> Executor {
    let git = which::which("git").expect("git");
    Executor::new(git, Arc::new(NullBus))
}

struct Repo {
    _dir: tempfile::TempDir,
    path: std::path::PathBuf,
}

impl Repo {
    fn init(branch: &str) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_path_buf();
        fs::create_dir_all(&path).unwrap();
        let exec = executor();
        futures_run(repository::init_repository(&exec, &path, branch)).unwrap();
        configure(&path);
        Self { _dir: dir, path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

fn configure(path: &Path) {
    let git = which::which("git").unwrap();
    for args in [
        ["config", "user.name", "Test User"].as_slice(),
        ["config", "user.email", "test@example.com"].as_slice(),
        ["config", "commit.gpgsign", "false"].as_slice(),
        ["config", "tag.gpgsign", "false"].as_slice(),
    ] {
        let status = std::process::Command::new(&git)
            .args(args)
            .current_dir(path)
            .status()
            .unwrap();
        assert!(status.success(), "git config failed");
    }
    let hooks = path.join("empty-hooks");
    fs::create_dir_all(&hooks).unwrap();
    let status = std::process::Command::new(git)
        .args(["config", "core.hooksPath", hooks.to_str().unwrap()])
        .current_dir(path)
        .status()
        .unwrap();
    assert!(status.success());
}

fn futures_run<F, T>(future: F) -> T
where
    F: std::future::Future<Output = T>,
{
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(future)
}

fn write(path: &Path, name: &str, contents: &str) {
    let file = path.join(name);
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(file, contents).unwrap();
}

#[test]
fn initializes_unborn_repository_and_creates_history() {
    let exec = executor();
    let repo = Repo::init("main");
    let status = futures_run(status::load_status(&exec, repo.path(), false)).unwrap();
    assert!(status.unborn);
    assert_eq!(status.branch.as_deref(), Some("main"));
    assert_eq!(status.operation, OperationKind::None);
    assert!(status.files.is_empty());

    write(repo.path(), "README.md", "hello\n");
    futures_run(staging::stage_paths(
        &exec,
        repo.path(),
        &["README.md".into()],
    ))
    .unwrap();
    let staged = futures_run(status::load_status(&exec, repo.path(), false)).unwrap();
    assert_eq!(staged.staged_count, 1);
    futures_run(staging::commit(&exec, repo.path(), "Initial commit", "", false)).unwrap();

    let committed = futures_run(status::load_status(&exec, repo.path(), false)).unwrap();
    assert!(!committed.unborn);
    assert_eq!(committed.branch.as_deref(), Some("main"));
    assert_eq!(committed.staged_count, 0);

    let log = futures_run(commits::commit_log(&exec, repo.path(), 0, 20, None, None)).unwrap();
    assert_eq!(log.commits.len(), 1);
    assert!(log.commits[0].parents.is_empty());
    assert_eq!(log.commits[0].subject, "Initial commit");
}

#[test]
fn stages_unstages_and_commits_partial_file_state() {
    let exec = executor();
    let repo = Repo::init("main");
    write(repo.path(), "notes.txt", "one\n");
    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    futures_run(staging::commit(&exec, repo.path(), "add notes", "", false)).unwrap();

    fs::write(repo.path().join("notes.txt"), "one\nstaged\n").unwrap();
    futures_run(staging::stage_paths(&exec, repo.path(), &["notes.txt".into()])).unwrap();
    fs::write(repo.path().join("notes.txt"), "one\nstaged\nunstaged\n").unwrap();

    let status = futures_run(status::load_status(&exec, repo.path(), false)).unwrap();
    let file = status.files.iter().find(|file| file.path == "notes.txt").unwrap();
    assert!(file.staged && file.unstaged);
    assert_eq!(status.staged_count, 1);
    assert_eq!(status.unstaged_count, 1);

    let unstaged = futures_run(staging::file_diff(
        &exec,
        repo.path(),
        "unstaged",
        "notes.txt",
        None,
        None,
        None,
    ))
    .unwrap();
    assert!(unstaged.insertions >= 1);
    let staged = futures_run(staging::file_diff(
        &exec,
        repo.path(),
        "staged",
        "notes.txt",
        None,
        None,
        None,
    ))
    .unwrap();
    assert!(staged.insertions >= 1);

    futures_run(staging::commit(&exec, repo.path(), "stage only", "body line", false)).unwrap();
    let after = futures_run(status::load_status(&exec, repo.path(), false)).unwrap();
    assert_eq!(after.staged_count, 0);
    assert_eq!(after.unstaged_count, 1);
    let details = futures_run(commits::commit_details(
        &exec,
        repo.path(),
        after.head_oid.as_deref().unwrap(),
    ))
    .unwrap();
    assert_eq!(details.subject, "stage only");
    assert!(details.body.contains("body line"));
}

#[test]
fn stages_a_single_hunk_without_touching_the_other() {
    let exec = executor();
    let repo = Repo::init("main");
    let original: String = (1..=20).map(|n| format!("line {n}\n")).collect();
    write(repo.path(), "long.txt", &original);
    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    futures_run(staging::commit(&exec, repo.path(), "base", "", false)).unwrap();

    let mut lines: Vec<String> = original.lines().map(|line| line.to_string()).collect();
    lines[0] = "changed first".into();
    lines[19] = "changed last".into();
    fs::write(repo.path().join("long.txt"), format!("{}\n", lines.join("\n"))).unwrap();

    let diff = futures_run(staging::file_diff(
        &exec,
        repo.path(),
        "unstaged",
        "long.txt",
        None,
        None,
        None,
    ))
    .unwrap();
    assert!(diff.hunks.len() >= 2, "expected separate hunks, got {}", diff.hunks.len());
    futures_run(staging::apply_hunks(
        &exec,
        repo.path(),
        "long.txt",
        false,
        &[diff.hunks[0].raw.clone()],
    ))
    .unwrap();
    let status = futures_run(status::load_status(&exec, repo.path(), false)).unwrap();
    let file = status.files.iter().find(|file| file.path == "long.txt").unwrap();
    assert!(file.staged && file.unstaged);
    let worktree = fs::read_to_string(repo.path().join("long.txt")).unwrap();
    assert!(worktree.contains("changed first"));
    assert!(worktree.contains("changed last"));
}

#[test]
fn creates_switches_and_merges_branches() {
    let exec = executor();
    let repo = Repo::init("main");
    write(repo.path(), "file.txt", "base\n");
    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    futures_run(staging::commit(&exec, repo.path(), "base", "", false)).unwrap();
    futures_run(branches::create_branch(
        &exec,
        repo.path(),
        "feature/unicode-имя",
        "HEAD",
        true,
    ))
    .unwrap();
    write(repo.path(), "file.txt", "feature\n");
    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    futures_run(staging::commit(&exec, repo.path(), "feature work", "", false)).unwrap();
    futures_run(branches::switch_branch(&exec, repo.path(), "main")).unwrap();
    write(repo.path(), "other.txt", "main\n");
    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    futures_run(staging::commit(&exec, repo.path(), "main work", "", false)).unwrap();

    let status_code = std::process::Command::new(which::which("git").unwrap())
        .args(["merge", "--no-ff", "feature/unicode-имя", "-m", "merge feature"])
        .current_dir(repo.path())
        .status()
        .unwrap();
    assert!(status_code.success());

    let log = futures_run(commits::commit_log(&exec, repo.path(), 0, 20, None, None)).unwrap();
    assert!(log.commits[0].parents.len() == 2);
    let details = futures_run(commits::commit_details(
        &exec,
        repo.path(),
        &log.commits[0].hash,
    ))
    .unwrap();
    assert_eq!(details.parents.len(), 2);
}

#[test]
fn handles_spaces_unicode_and_newline_names() {
    let exec = executor();
    let repo = Repo::init("main");
    write(repo.path(), "my file.txt", "spaces\n");
    write(repo.path(), "ünicode/файл.txt", "юникод\n");
    let weird = repo.path().join("we\nird.txt");
    fs::write(&weird, "newline\n").unwrap();
    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    let status = futures_run(status::load_status(&exec, repo.path(), false)).unwrap();
    let paths: Vec<_> = status.files.iter().map(|file| file.path.clone()).collect();
    assert!(paths.iter().any(|path| path == "my file.txt"));
    assert!(paths.iter().any(|path| path == "ünicode/файл.txt"));
    assert!(paths.iter().any(|path| path == "we\nird.txt"));
    futures_run(staging::commit(&exec, repo.path(), "unusual names", "", false)).unwrap();
    let clean = futures_run(status::load_status(&exec, repo.path(), false)).unwrap();
    assert_eq!(clean.staged_count, 0);
    assert_eq!(clean.untracked_count, 0);
}

#[test]
fn stashes_tags_amends_and_detects_detached_head() {
    let exec = executor();
    let repo = Repo::init("main");
    write(repo.path(), "file.txt", "v1\n");
    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    futures_run(staging::commit(&exec, repo.path(), "first", "", false)).unwrap();
    write(repo.path(), "file.txt", "v2\n");
    futures_run(stash::create_stash(&exec, repo.path(), "wip", false)).unwrap();
    let stashes = futures_run(stash::list_stashes(&exec, repo.path())).unwrap();
    assert_eq!(stashes.len(), 1);
    assert!(stashes[0].message.contains("wip"));
    futures_run(stash::stash_action(&exec, repo.path(), "apply", 0)).unwrap();
    let restored = fs::read_to_string(repo.path().join("file.txt")).unwrap();
    assert!(restored.contains("v2"));

    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    futures_run(staging::commit(&exec, repo.path(), "second", "", false)).unwrap();
    futures_run(staging::commit(&exec, repo.path(), "second amended", "", true)).unwrap();
    let log = futures_run(commits::commit_log(&exec, repo.path(), 0, 10, None, None)).unwrap();
    assert_eq!(log.commits[0].subject, "second amended");

    let head = log.commits[0].hash.clone();
    futures_run(tags::create_tag(
        &exec,
        repo.path(),
        "v0.1",
        &head,
        true,
        "annotated",
    ))
    .unwrap();
    let tags = futures_run(tags::list_tags(&exec, repo.path())).unwrap();
    assert_eq!(tags.len(), 1);
    assert!(tags[0].annotated);
    assert_eq!(tags[0].commit, head);

    let switch = std::process::Command::new(which::which("git").unwrap())
        .args(["checkout", "--detach", "HEAD"])
        .current_dir(repo.path())
        .status()
        .unwrap();
    assert!(switch.success());
    let detached = futures_run(status::load_status(&exec, repo.path(), false)).unwrap();
    assert!(detached.detached);
    assert_eq!(detached.operation, OperationKind::None);
}

#[test]
fn records_commands_without_using_a_shell() {
    let exec = executor();
    let repo = Repo::init("main");
    write(repo.path(), "file.txt", "data\n");
    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    let message = "hello; echo pwned && rm -rf /";
    futures_run(staging::commit(&exec, repo.path(), message, "", false)).unwrap();
    let log = futures_run(commits::commit_log(&exec, repo.path(), 0, 5, None, None)).unwrap();
    assert_eq!(log.commits[0].subject, message);
    let entries = exec.log_snapshot();
    assert!(entries.iter().any(|entry| entry.operation == "Commit" && entry.success));
    assert!(entries.iter().all(|entry| entry.display.starts_with("git ")));
}

#[test]
fn resolves_repository_root_from_a_subdirectory() {
    let exec = executor();
    let repo = Repo::init("main");
    write(repo.path(), "nested/file.txt", "x\n");
    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    futures_run(staging::commit(&exec, repo.path(), "nested", "", false)).unwrap();
    let nested = repo.path().join("nested");
    let status = futures_run(status::load_status(&exec, &nested, false)).unwrap();
    assert_eq!(
        std::fs::canonicalize(&status.path).unwrap(),
        std::fs::canonicalize(repo.path()).unwrap()
    );
}

#[test]
fn rejects_paths_outside_the_repository_when_discarding() {
    let exec = executor();
    let repo = Repo::init("main");
    let error = futures_run(staging::discard_unstaged(
        &exec,
        repo.path(),
        &["../outside.txt".into()],
    ))
    .unwrap_err();
    assert!(error.message.to_lowercase().contains("outside") || error.message.contains("Path"));
}

#[test]
fn soft_resets_and_cherry_picks_a_commit() {
    let exec = executor();
    let repo = Repo::init("main");
    write(repo.path(), "a.txt", "a\n");
    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    futures_run(staging::commit(&exec, repo.path(), "one", "", false)).unwrap();
    write(repo.path(), "b.txt", "b\n");
    futures_run(staging::stage_all(&exec, repo.path())).unwrap();
    futures_run(staging::commit(&exec, repo.path(), "two", "", false)).unwrap();
    let before = futures_run(commits::commit_log(&exec, repo.path(), 0, 5, None, None)).unwrap();
    let undone = before.commits[0].hash.clone();
    futures_run(commits::reset_soft(&exec, repo.path(), "HEAD~1")).unwrap();
    let reset = futures_run(status::load_status(&exec, repo.path(), false)).unwrap();
    assert_eq!(reset.staged_count, 1);
    futures_run(staging::unstage_all(&exec, repo.path())).unwrap();
    fs::remove_file(repo.path().join("b.txt")).unwrap();
    futures_run(branches::create_branch(&exec, repo.path(), "side", "HEAD", true)).unwrap();
    futures_run(commits::cherry_pick(&exec, repo.path(), &[undone], None)).unwrap();
    let after = futures_run(commits::commit_log(&exec, repo.path(), 0, 5, None, None)).unwrap();
    assert_eq!(after.commits[0].subject, "two");
    let status = futures_run(status::load_status(&exec, repo.path(), false)).unwrap();
    assert_eq!(status.branch.as_deref(), Some("side"));
}
