use std::path::Path;

use crate::error::{CommandError, ErrorKind};
use crate::git::commits::compare_numstat;
use crate::git::executor::{Executor, RunOptions};
use crate::git::parse::{build_patch, parse_unified_diff};
use crate::git::status::load_status;
use crate::git::util::{safe_join, validate_path_arg};
use crate::models::{CommitPreview, DiffResult};

pub async fn stage_paths(
    executor: &Executor,
    repo: &Path,
    paths: &[String],
) -> Result<(), CommandError> {
    run_path_command(executor, repo, "Add", paths, |args| {
        let mut command = vec!["add".into(), "--".into()];
        command.extend(args);
        command
    })
    .await
}

pub async fn unstage_paths(
    executor: &Executor,
    repo: &Path,
    paths: &[String],
) -> Result<(), CommandError> {
    let unborn = is_unborn(executor, repo).await?;
    if unborn {
        return run_path_command(executor, repo, "Reset", paths, |args| {
            let mut command = vec!["rm".into(), "--cached".into(), "--ignore-unmatch".into(), "--".into()];
            command.extend(args);
            command
        })
        .await;
    }
    run_path_command(executor, repo, "Reset", paths, |args| {
        let mut command = vec!["reset".into(), "-q".into(), "--".into()];
        command.extend(args);
        command
    })
    .await
}

pub async fn stage_all(executor: &Executor, repo: &Path) -> Result<(), CommandError> {
    executor
        .run(RunOptions::git("Add", repo, vec!["add".into(), "--all".into()]).mutating())
        .await?;
    Ok(())
}

pub async fn unstage_all(executor: &Executor, repo: &Path) -> Result<(), CommandError> {
    if is_unborn(executor, repo).await? {
        executor
            .run(
                RunOptions::git(
                    "Reset",
                    repo,
                    vec![
                        "rm".into(),
                        "-r".into(),
                        "--cached".into(),
                        "--ignore-unmatch".into(),
                        "--".into(),
                        ".".into(),
                    ],
                )
                .mutating(),
            )
            .await?;
    } else {
        executor
            .run(
                RunOptions::git(
                    "Reset",
                    repo,
                    vec!["reset".into(), "-q".into()],
                )
                .mutating(),
            )
            .await?;
    }
    Ok(())
}

pub async fn discard_unstaged(
    executor: &Executor,
    repo: &Path,
    paths: &[String],
) -> Result<(), CommandError> {
    let repo_label = Some(repo.to_string_lossy().into_owned());
    let status = load_status(executor, repo, true).await?;
    let mut restore = Vec::new();
    for path in paths {
        validate_path_arg(path, "Restore", repo_label.clone())?;
        let Some(file) = status.files.iter().find(|file| file.path == *path) else {
            continue;
        };
        if file.unmerged {
            return Err(CommandError::new(
                ErrorKind::MergeConflict,
                "Restore",
                repo_label,
                format!("{path} has unresolved conflicts. Resolve them explicitly; nothing was discarded."),
            ));
        }
        if file.untracked || file.ignored {
            let target = safe_join(repo, path)?;
            let metadata = std::fs::symlink_metadata(&target);
            if let Ok(metadata) = metadata {
                let result = if metadata.is_dir() {
                    std::fs::remove_dir_all(&target)
                } else {
                    std::fs::remove_file(&target)
                };
                result.map_err(|err| {
                    CommandError::new(
                        ErrorKind::Io,
                        "Restore",
                        repo_label.clone(),
                        format!("Could not remove {path}: {err}"),
                    )
                })?;
            }
        } else if file.unstaged {
            restore.push(path.clone());
        }
    }
    if !restore.is_empty() {
        let mut args = vec!["restore".into(), "--worktree".into(), "--".into()];
        args.extend(restore);
        executor
            .run(RunOptions::git("Restore", repo, args).mutating())
            .await?;
    }
    Ok(())
}

pub async fn file_diff(
    executor: &Executor,
    repo: &Path,
    kind: &str,
    path: &str,
    rev: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<DiffResult, CommandError> {
    let repo_label = Some(repo.to_string_lossy().into_owned());
    if !path.is_empty() {
        validate_path_arg(path, "Diff", repo_label.clone())?;
    }
    let (args, allow_difference) = match kind {
        "unstaged" => (
            vec![
                "diff".into(),
                "--no-color".into(),
                "--no-ext-diff".into(),
                "-U3".into(),
                "--".into(),
                path.to_string(),
            ],
            false,
        ),
        "staged" => (
            vec![
                "diff".into(),
                "--cached".into(),
                "--no-color".into(),
                "--no-ext-diff".into(),
                "-U3".into(),
                "--".into(),
                path.to_string(),
            ],
            false,
        ),
        "untracked" => (
            vec![
                "diff".into(),
                "--no-color".into(),
                "--no-ext-diff".into(),
                "--no-index".into(),
                "-U3".into(),
                "--".into(),
                "/dev/null".into(),
                path.to_string(),
            ],
            true,
        ),
        "commit" => {
            let rev = required_rev(rev, "Diff", repo_label.clone())?;
            (
                vec![
                    "show".into(),
                    "--format=".into(),
                    "--no-color".into(),
                    "--no-ext-diff".into(),
                    "--first-parent".into(),
                    "-U3".into(),
                    rev,
                    "--".into(),
                    path.to_string(),
                ],
                false,
            )
        }
        "range" => {
            let from = required_rev(from, "Diff", repo_label.clone())?;
            let to = required_rev(to, "Diff", repo_label.clone())?;
            let mut args = vec![
                "diff".into(),
                "--no-color".into(),
                "--no-ext-diff".into(),
                "-U3".into(),
                from,
                to,
                "--".into(),
            ];
            if !path.is_empty() {
                args.push(path.to_string());
            }
            (args, false)
        }
        _ => {
            return Err(CommandError::new(
                ErrorKind::Other,
                "Diff",
                repo_label,
                "Unknown diff kind.",
            ))
        }
    };
    let mut options = RunOptions::git("Diff", repo, crate::git::util::with_quotepath(args));
    if allow_difference {
        options = options.allow_code(1);
    }
    let output = executor.run(options).await?;
    if output.stdout.len() >= crate::git::executor::OUTPUT_CAP {
        return Ok(DiffResult {
            path: path.to_string(),
            binary: false,
            truncated: true,
            insertions: 0,
            deletions: 0,
            file_header: String::new(),
            hunks: Vec::new(),
            message: Some(
                "This diff is too large to render in full. Stage or inspect the file outside the truncated view."
                    .into(),
            ),
        });
    }
    let text = output.stdout_text();
    Ok(parse_unified_diff(path, &text))
}

pub async fn apply_hunks(
    executor: &Executor,
    repo: &Path,
    path: &str,
    reverse: bool,
    hunks: &[String],
) -> Result<(), CommandError> {
    let repo_label = Some(repo.to_string_lossy().into_owned());
    if hunks.is_empty() {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Stage hunk",
            repo_label,
            "Select at least one hunk.",
        ));
    }
    let kind = if reverse { "staged" } else { "unstaged" };
    let diff = file_diff(executor, repo, kind, path, None, None, None).await?;
    if diff.binary || diff.truncated {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Stage hunk",
            repo_label,
            "Hunk staging is unavailable for this file. Stage or unstage the whole file instead.",
        ));
    }
    let mut matched = Vec::new();
    for wanted in hunks {
        match diff.hunks.iter().find(|hunk| hunk.raw == *wanted) {
            Some(hunk) => matched.push(hunk.raw.clone()),
            None => {
                return Err(CommandError::new(
                    ErrorKind::Other,
                    "Stage hunk",
                    repo_label,
                    "The diff changed before the hunk could be applied. Refresh and try again.",
                ));
            }
        }
    }
    let patch = build_patch(&diff.file_header, &matched);
    let mut args = vec!["apply".into(), "--cached".into()];
    if reverse {
        args.push("--reverse".into());
    }
    args.push("-".into());
    executor
        .run(
            RunOptions::git(if reverse { "Unstage hunk" } else { "Stage hunk" }, repo, args)
                .mutating()
                .stdin_bytes(patch.into_bytes()),
        )
        .await?;
    Ok(())
}

pub async fn commit_preview(executor: &Executor, repo: &Path) -> Result<CommitPreview, CommandError> {
    let status = load_status(executor, repo, false).await?;
    let files = compare_numstat(executor, repo, None, None, true)
        .await
        .unwrap_or_default();
    let insertions = files.iter().map(|file| file.additions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();
    let head_published = if status.unborn || status.head_oid.is_none() {
        false
    } else {
        head_is_published(executor, repo).await
    };
    Ok(CommitPreview {
        branch: status.branch,
        detached: status.detached,
        unborn: status.unborn,
        file_count: files.len(),
        has_staged_changes: !files.is_empty() || status.staged_count > 0,
        files,
        insertions,
        deletions,
        head_published,
    })
}

pub async fn commit(
    executor: &Executor,
    repo: &Path,
    subject: &str,
    body: &str,
    amend: bool,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    let subject = subject.trim();
    if subject.is_empty() || subject.contains('\0') {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Commit",
            Some(repo.to_string_lossy().into_owned()),
            "Enter a commit summary.",
        ));
    }
    let mut args = vec!["commit".into()];
    if amend {
        args.push("--amend".into());
    }
    args.push("-m".into());
    args.push(subject.to_string());
    if !body.trim().is_empty() {
        args.push("-m".into());
        args.push(body.to_string());
    }
    executor
        .run(
            RunOptions::git(if amend { "Amend commit" } else { "Commit" }, repo, args)
                .mutating()
                .authorize(None, identity_name, identity_email, false)?,
        )
        .await?;
    Ok(())
}

async fn head_is_published(executor: &Executor, repo: &Path) -> bool {
    let result = executor
        .run(
            RunOptions::git(
                "Commit",
                repo,
                vec!["branch".into(), "-r".into(), "--contains".into(), "HEAD".into()],
            )
            .allow_code(1)
            .allow_code(128)
            .allow_code(129),
        )
        .await;
    match result {
        Ok(output) if output.code == 0 => !output.stdout_text().trim().is_empty(),
        _ => false,
    }
}

async fn is_unborn(executor: &Executor, repo: &Path) -> Result<bool, CommandError> {
    let output = executor
        .run(
            RunOptions::git(
                "Repository",
                repo,
                vec!["rev-parse".into(), "--verify".into(), "HEAD".into()],
            )
            .allow_code(128),
        )
        .await?;
    Ok(output.code != 0)
}

async fn run_path_command<F>(
    executor: &Executor,
    repo: &Path,
    operation: &str,
    paths: &[String],
    build: F,
) -> Result<(), CommandError>
where
    F: Fn(Vec<String>) -> Vec<String>,
{
    let repo_label = Some(repo.to_string_lossy().into_owned());
    if paths.is_empty() {
        return Ok(());
    }
    for path in paths {
        validate_path_arg(path, operation, repo_label.clone())?;
    }
    for chunk in paths.chunks(80) {
        let args = build(chunk.to_vec());
        executor
            .run(RunOptions::git(operation, repo, args).mutating())
            .await?;
    }
    Ok(())
}

fn required_rev(
    rev: Option<&str>,
    operation: &str,
    repo: Option<String>,
) -> Result<String, CommandError> {
    let rev = rev.unwrap_or("").trim();
    crate::git::util::validate_rev(rev, operation, repo)?;
    Ok(rev.to_string())
}
