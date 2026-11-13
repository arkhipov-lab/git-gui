use std::path::Path;

use crate::error::{CommandError, ErrorKind};
use crate::git::executor::{Executor, RunOptions};
use crate::git::parse::parse_unified_diff;
use crate::models::{DiffResult, StashInfo};

pub async fn list_stashes(executor: &Executor, repo: &Path) -> Result<Vec<StashInfo>, CommandError> {
    let output = executor
        .run(RunOptions::git(
            "List stashes",
            repo,
            vec![
                "stash".into(),
                "list".into(),
                "--format=%gd%x1f%H%x1f%gs%x1f%aI".into(),
            ],
        ))
        .await?;
    Ok(parse_stashes(&output.stdout_text()))
}

pub fn parse_stashes(text: &str) -> Vec<StashInfo> {
    text.lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split('\u{1f}').collect();
            if fields.len() < 4 {
                return None;
            }
            let reference = fields[0].to_string();
            let index = reference
                .trim_start_matches("stash@{")
                .trim_end_matches('}')
                .parse()
                .unwrap_or(0);
            Some(StashInfo {
                index,
                reference,
                commit: fields[1].to_string(),
                message: fields[2].to_string(),
                date: fields[3].to_string(),
            })
        })
        .collect()
}

pub async fn create_stash(
    executor: &Executor,
    repo: &Path,
    message: &str,
    include_untracked: bool,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    if message.contains('\n') || message.contains('\0') {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Create stash",
            Some(repo.display().to_string()),
            "Stash messages must be a single line.",
        ));
    }
    let mut args = vec!["stash".into(), "push".into()];
    if include_untracked {
        args.push("--include-untracked".into());
    }
    if !message.trim().is_empty() {
        args.push("-m".into());
        args.push(message.trim().to_string());
    }
    executor
        .run(
            RunOptions::git("Create stash", repo, args)
                .mutating()
                .authorize(None, identity_name, identity_email, false)?,
        )
        .await?;
    Ok(())
}

pub async fn stash_action(
    executor: &Executor,
    repo: &Path,
    action: &str,
    index: u32,
) -> Result<(), CommandError> {
    let verb = match action {
        "apply" => "apply",
        "pop" => "pop",
        "drop" => "drop",
        _ => {
            return Err(CommandError::new(
                ErrorKind::Other,
                "Stash",
                Some(repo.display().to_string()),
                "Unknown stash action.",
            ))
        }
    };
    executor
        .run(
            RunOptions::git(
                match verb {
                    "apply" => "Apply stash",
                    "pop" => "Pop stash",
                    _ => "Drop stash",
                },
                repo,
                vec!["stash".into(), verb.into(), format!("stash@{{{index}}}")],
            )
            .mutating(),
        )
        .await?;
    Ok(())
}

pub async fn stash_diff(
    executor: &Executor,
    repo: &Path,
    index: u32,
) -> Result<DiffResult, CommandError> {
    let reference = format!("stash@{{{index}}}");
    let output = executor
        .run(RunOptions::git(
            "Stash diff",
            repo,
            vec![
                "stash".into(),
                "show".into(),
                "-p".into(),
                "--no-color".into(),
                reference.clone(),
            ],
        ))
        .await?;
    Ok(parse_unified_diff(&reference, &output.stdout_text()))
}
