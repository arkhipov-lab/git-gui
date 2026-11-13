use std::collections::BTreeMap;
use std::path::Path;

use crate::error::{CommandError, ErrorKind};
use crate::git::executor::{Executor, RunOptions};
use crate::models::RemoteInfo;

pub async fn list_remotes(executor: &Executor, repo: &Path) -> Result<Vec<RemoteInfo>, CommandError> {
    let output = executor
        .run(RunOptions::git("List remotes", repo, vec!["remote".into(), "-v".into()]))
        .await?;
    Ok(parse_remotes(&output.stdout_text()))
}

pub fn parse_remotes(text: &str) -> Vec<RemoteInfo> {
    let mut fetch = BTreeMap::new();
    let mut push = BTreeMap::new();
    for line in text.lines() {
        let Some((name, rest)) = line.split_once('\t') else {
            continue;
        };
        if let Some(url) = rest.strip_suffix(" (fetch)") {
            fetch.insert(name.to_string(), url.to_string());
        } else if let Some(url) = rest.strip_suffix(" (push)") {
            push.insert(name.to_string(), url.to_string());
        }
    }
    fetch
        .into_iter()
        .map(|(name, fetch_url)| {
            let push_url = push.get(&name).cloned().unwrap_or_else(|| fetch_url.clone());
            RemoteInfo {
                name,
                fetch_url,
                push_url,
            }
        })
        .collect()
}

pub async fn add_remote(
    executor: &Executor,
    repo: &Path,
    name: &str,
    url: &str,
) -> Result<(), CommandError> {
    validate_remote_name(name, repo)?;
    if url.trim().is_empty() || url.contains('\n') {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Add remote",
            Some(repo.display().to_string()),
            "Enter a remote URL.",
        ));
    }
    executor
        .run(
            RunOptions::git(
                "Add remote",
                repo,
                vec!["remote".into(), "add".into(), name.to_string(), url.trim().to_string()],
            )
            .mutating(),
        )
        .await?;
    Ok(())
}

pub async fn remove_remote(
    executor: &Executor,
    repo: &Path,
    name: &str,
) -> Result<(), CommandError> {
    validate_remote_name(name, repo)?;
    executor
        .run(
            RunOptions::git(
                "Remove remote",
                repo,
                vec!["remote".into(), "remove".into(), name.to_string()],
            )
            .mutating(),
        )
        .await?;
    Ok(())
}

pub async fn fetch(
    executor: &Executor,
    repo: &Path,
    remote: Option<&str>,
    prune: bool,
    scope: &str,
    ssh_key: Option<String>,
    operation_id: Option<String>,
) -> Result<(), CommandError> {
    let mut args = vec!["fetch".into(), "--progress".into()];
    if prune {
        args.push("--prune".into());
    }
    match scope {
        "branches" => {}
        "tags" => args.push("--tags".into()),
        "tags-force" => {
            args.push("--tags".into());
            args.push("--force".into());
        }
        _ => {
            return Err(CommandError::new(
                ErrorKind::Other,
                "Fetch",
                Some(repo.display().to_string()),
                "Choose branches, tags, or tags with overwrite.",
            ));
        }
    }
    match remote.map(str::trim).filter(|remote| !remote.is_empty()) {
        None => {}
        Some("*") => args.push("--all".into()),
        Some(remote) => {
            validate_remote_name(remote, repo)?;
            args.push(remote.to_string());
        }
    }
    let mut options = RunOptions::git("Fetch", repo, args).mutating().network();
    options.operation_id = operation_id;
    executor.run(options.authorize(ssh_key, None, None, false)?).await?;
    Ok(())
}

pub async fn pull(
    executor: &Executor,
    repo: &Path,
    remote: &str,
    branch: &str,
    strategy: &str,
    checked_out: bool,
    local_branch: Option<&str>,
    force: bool,
    ssh_key: Option<String>,
    identity_name: Option<String>,
    identity_email: Option<String>,
    operation_id: Option<String>,
) -> Result<(), CommandError> {
    validate_remote_name(remote, repo)?;
    crate::git::util::validate_rev(branch, "Pull", Some(repo.display().to_string()))?;
    if force {
        return force_pull(executor, repo, remote, branch, checked_out, local_branch, ssh_key, operation_id).await;
    }
    if !checked_out {
        if strategy != "ff-only" {
            return Err(CommandError::new(
                ErrorKind::Other,
                "Pull",
                Some(repo.display().to_string()),
                "Merge and rebase update the checked-out branch. Check out this branch first, or fast-forward it.",
            ));
        }
        let local = local_branch.unwrap_or(branch);
        crate::git::util::validate_rev(local, "Pull", Some(repo.display().to_string()))?;
        if branch.contains(':') || local.contains(':') {
            return Err(CommandError::new(
                ErrorKind::Other,
                "Pull",
                Some(repo.display().to_string()),
                "The branch name cannot contain ':'.",
            ));
        }
        let spec = format!("refs/heads/{branch}:refs/heads/{local}");
        let mut options = RunOptions::git("Pull", repo, vec!["fetch".into(), "--progress".into(), remote.to_string(), spec])
            .mutating()
            .network();
        options.operation_id = operation_id;
        executor.run(options.authorize(ssh_key, None, None, false)?).await?;
        return Ok(());
    }
    let strategy_arg = match strategy {
        "merge" => "--no-rebase",
        "rebase" => "--rebase",
        "ff-only" => "--ff-only",
        _ => {
            return Err(CommandError::new(
                ErrorKind::Other,
                "Pull",
                Some(repo.display().to_string()),
                "Choose merge, rebase, or fast-forward only.",
            ))
        }
    };
    let mut options = RunOptions::git(
        "Pull",
        repo,
        vec![
            "pull".into(),
            "--progress".into(),
            strategy_arg.into(),
            remote.to_string(),
            branch.to_string(),
        ],
    )
    .mutating()
    .network();
    options.operation_id = operation_id;
    let writes_commit = strategy == "merge" || strategy == "rebase";
    executor
        .run(options.authorize(
            ssh_key,
            if writes_commit { identity_name } else { None },
            if writes_commit { identity_email } else { None },
            strategy == "rebase",
        )?)
        .await?;
    Ok(())
}

pub async fn push(
    executor: &Executor,
    repo: &Path,
    remote: &str,
    branch: &str,
    set_upstream: bool,
    force: bool,
    ssh_key: Option<String>,
    operation_id: Option<String>,
) -> Result<(), CommandError> {
    validate_remote_name(remote, repo)?;
    crate::git::util::validate_rev(branch, "Push", Some(repo.display().to_string()))?;
    let mut args = vec!["push".into(), "--progress".into()];
    if force {
        args.push("--force".into());
    }
    if set_upstream {
        args.push("-u".into());
    }
    args.push(remote.to_string());
    args.push(branch.to_string());
    let mut options = RunOptions::git("Push", repo, args).mutating().network();
    options.operation_id = operation_id;
    executor.run(options.authorize(ssh_key, None, None, false)?).await?;
    Ok(())
}

async fn force_pull(
    executor: &Executor,
    repo: &Path,
    remote: &str,
    branch: &str,
    checked_out: bool,
    local_branch: Option<&str>,
    ssh_key: Option<String>,
    operation_id: Option<String>,
) -> Result<(), CommandError> {
    let local = local_branch.unwrap_or(branch);
    crate::git::util::validate_rev(local, "Pull", Some(repo.display().to_string()))?;
    if branch.contains(':') || local.contains(':') {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Pull",
            Some(repo.display().to_string()),
            "The branch name cannot contain ':'.",
        ));
    }
    if checked_out {
        let mut fetch = RunOptions::git(
            "Pull",
            repo,
            vec!["fetch".into(), "--progress".into(), remote.to_string(), branch.to_string()],
        )
        .mutating()
        .network();
        fetch.operation_id = operation_id.clone();
        executor.run(fetch.authorize(ssh_key.clone(), None, None, false)?).await?;
        let target = format!("{remote}/{branch}");
        crate::git::util::validate_rev(&target, "Pull", Some(repo.display().to_string()))?;
        let mut reset = RunOptions::git(
            "Pull",
            repo,
            vec!["reset".into(), "--hard".into(), target],
        )
        .mutating();
        reset.operation_id = operation_id;
        executor.run(reset).await?;
        return Ok(());
    }
    let spec = format!("+refs/heads/{branch}:refs/heads/{local}");
    let mut options = RunOptions::git("Pull", repo, vec!["fetch".into(), "--progress".into(), remote.to_string(), spec])
        .mutating()
        .network();
    options.operation_id = operation_id;
    executor.run(options.authorize(ssh_key, None, None, false)?).await?;
    Ok(())
}

fn validate_remote_name(name: &str, repo: &Path) -> Result<(), CommandError> {
    if name.is_empty()
        || name.starts_with('-')
        || name.contains([' ', '\n', '\0', '/'])
    {
        return Err(CommandError::new(
            ErrorKind::RemoteNotFound,
            "Remote",
            Some(repo.display().to_string()),
            format!("`{name}` is not a valid remote name."),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_remote_verbose_output() {
        let remotes = parse_remotes("origin\tgit@example.com:org/repo.git (fetch)\norigin\tgit@example.com:org/repo.git (push)\n");
        assert_eq!(remotes.len(), 1);
        assert_eq!(remotes[0].name, "origin");
        assert_eq!(remotes[0].fetch_url, "git@example.com:org/repo.git");
    }
}
