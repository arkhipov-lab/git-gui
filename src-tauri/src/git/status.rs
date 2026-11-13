use std::path::Path;

use crate::error::{CommandError, ErrorKind};
use crate::git::executor::{Executor, RunOptions, OUTPUT_CAP};
use crate::git::parse::parse_porcelain_v2;
use crate::git::repository::{
    absolute_git_dir, classify_kind, detect_operation, display_name, resolve_repository,
};
use crate::git::util::with_quotepath;
use crate::models::{FileEntry, OperationKind, RepoKind, RepoStatus};

pub async fn load_status(
    executor: &Executor,
    requested: &Path,
    include_ignored: bool,
) -> Result<RepoStatus, CommandError> {
    let root = resolve_repository(executor, requested).await?;
    let mut args = vec![
        "status".into(),
        "--porcelain=v2".into(),
        "--branch".into(),
        "-z".into(),
        "--untracked-files=all".into(),
    ];
    if include_ignored {
        args.push("--ignored=matching".into());
    }
    let (status_result, git_dir_result) = tokio::join!(
        executor.run(
            RunOptions::git("Status", &root, with_quotepath(args)).routine(),
        ),
        absolute_git_dir(executor, &root),
    );

    let git_dir = git_dir_result?;
    let (kind, bare) = classify_kind(&root, &git_dir);
    let operation = detect_operation(&git_dir);

    if bare {
        return bare_status(executor, &root, kind, operation).await;
    }

    let output = match status_result {
        Ok(output) => output,
        Err(error)
            if error
                .stderr
                .to_lowercase()
                .contains("must be run in a work tree") =>
        {
            return bare_status(executor, &root, RepoKind::Bare, operation).await;
        }
        Err(error) => return Err(error),
    };
    if output.stdout.len() >= OUTPUT_CAP {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Status",
            Some(root.to_string_lossy().into_owned()),
            "Git status output is too large to display safely. Refresh after narrowing the working tree.",
        ));
    }
    let parsed = parse_porcelain_v2(&output.stdout).map_err(|message| {
        CommandError::new(
            ErrorKind::Other,
            "Status",
            Some(root.to_string_lossy().into_owned()),
            format!("Could not parse git status output: {message}"),
        )
    })?;
    let mut status = RepoStatus {
        path: root.to_string_lossy().into_owned(),
        name: display_name(&root),
        kind,
        bare,
        branch: parsed.branch,
        head_oid: parsed.head_oid,
        detached: parsed.detached,
        unborn: parsed.unborn,
        upstream: parsed.upstream,
        ahead: parsed.ahead,
        behind: parsed.behind,
        operation,
        files: parsed.files,
        staged_count: 0,
        unstaged_count: 0,
        untracked_count: 0,
        conflict_count: 0,
        ignored_count: 0,
    };
    mark_conflict_markers(&root, &mut status.files);
    apply_counts(&mut status);
    Ok(status)
}

async fn bare_status(
    executor: &Executor,
    root: &Path,
    kind: RepoKind,
    operation: OperationKind,
) -> Result<RepoStatus, CommandError> {
    let symbolic = executor
        .run(
            RunOptions::git(
                "Status",
                root,
                vec!["symbolic-ref".into(), "--short".into(), "HEAD".into()],
            )
            .allow_code(1)
            .allow_code(128)
            .routine(),
        )
        .await?;
    let mut branch = None;
    let mut detached = false;
    let mut unborn = false;
    let mut head_oid = None;
    if symbolic.code == 0 {
        let name = symbolic.stdout_text();
        let name = name.trim();
        if !name.is_empty() {
            branch = Some(name.to_string());
        }
    } else {
        let oid = executor
            .run(
                RunOptions::git("Status", root, vec!["rev-parse".into(), "HEAD".into()])
                    .allow_code(128)
                    .routine(),
            )
            .await?;
        if oid.code == 0 {
            detached = true;
            head_oid = Some(oid.stdout_text().trim().to_string());
        } else {
            unborn = true;
        }
    }
    Ok(RepoStatus {
        path: root.to_string_lossy().into_owned(),
        name: display_name(root),
        kind,
        bare: true,
        branch,
        head_oid,
        detached,
        unborn,
        upstream: None,
        ahead: None,
        behind: None,
        operation,
        files: Vec::<FileEntry>::new(),
        staged_count: 0,
        unstaged_count: 0,
        untracked_count: 0,
        conflict_count: 0,
        ignored_count: 0,
    })
}

fn apply_counts(status: &mut RepoStatus) {
    for file in &status.files {
        if file.unmerged {
            status.conflict_count += 1;
            continue;
        }
        if file.ignored {
            status.ignored_count += 1;
            continue;
        }
        if file.untracked {
            status.untracked_count += 1;
            continue;
        }
        if file.staged {
            status.staged_count += 1;
        }
        if file.unstaged {
            status.unstaged_count += 1;
        }
    }
}

fn mark_conflict_markers(root: &Path, files: &mut [FileEntry]) {
    for file in files.iter_mut().filter(|file| file.unmerged) {
        file.conflict_markers = file_has_conflict_markers(root, &file.path);
    }
}

fn file_has_conflict_markers(root: &Path, relative: &str) -> bool {
    if relative.is_empty() || relative.contains('\0') {
        return true;
    }
    let full = root.join(relative);
    let Ok(canon_root) = std::fs::canonicalize(root) else {
        return true;
    };
    let Ok(canon) = std::fs::canonicalize(&full) else {
        return true;
    };
    if !canon.starts_with(&canon_root) {
        return true;
    }
    let file = match std::fs::File::open(canon) {
        Ok(file) => file,
        Err(_) => return true,
    };
    let mut reader = std::io::BufReader::new(file);
    let mut line = String::new();
    let mut read = 0usize;
    loop {
        line.clear();
        let count = std::io::BufRead::read_line(&mut reader, &mut line).unwrap_or(0);
        if count == 0 {
            return false;
        }
        read += count;
        if line.trim_end().starts_with("<<<<<<<") {
            return true;
        }
        if read > 2_000_000 {
            return true;
        }
    }
}
