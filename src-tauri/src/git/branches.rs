use std::path::Path;

use chrono::DateTime;

use crate::error::{CommandError, ErrorKind};
use crate::git::executor::{Executor, RunOptions};
use crate::git::parse::parse_track;
use crate::models::BranchInfo;

const REF_FORMAT: &str = "%(objectname)%00%(refname)%00%(refname:short)%00%(upstream:short)%00%(upstream:track)%00%(HEAD)%00%(committerdate:iso-strict)%00%(subject)%00END";

pub async fn list_branches(
    executor: &Executor,
    repo: &Path,
    fallback: Option<&str>,
) -> Result<Vec<BranchInfo>, CommandError> {
    let output = executor
        .run(
            RunOptions::git(
                "List branches",
                repo,
                vec![
                    "for-each-ref".into(),
                    format!("--format={REF_FORMAT}"),
                    "refs/heads".into(),
                    "refs/remotes".into(),
                ],
            )
            .routine(),
        )
        .await?;
    let mut branches = parse_branch_records(&output.stdout_text());
    let primary = detect_primary(executor, repo, fallback).await;
    arrange_branches(&mut branches, primary.as_ref());
    Ok(branches)
}

struct Primary {
    local: String,
    remote: Option<String>,
}

async fn detect_primary(executor: &Executor, repo: &Path, fallback: Option<&str>) -> Option<Primary> {
    if let Some(found) = remote_head(executor, repo).await {
        return Some(found);
    }
    if let Some(name) = fallback.map(str::trim).filter(|name| !name.is_empty()) {
        return Some(Primary {
            local: name.to_string(),
            remote: None,
        });
    }
    configured_initial_branch(executor, repo)
        .await
        .map(|name| Primary { local: name, remote: None })
}

async fn remote_head(executor: &Executor, repo: &Path) -> Option<Primary> {
    let output = executor
        .run(
            RunOptions::git(
                "Default branch",
                repo,
                vec![
                    "for-each-ref".into(),
                    "--format=%(refname:short)%00%(symref:short)".into(),
                    "refs/remotes".into(),
                ],
            )
            .routine(),
        )
        .await
        .ok()?;
    parse_remote_head(&output.stdout_text())
}

async fn configured_initial_branch(executor: &Executor, repo: &Path) -> Option<String> {
    let output = executor
        .run(
            RunOptions::git(
                "Default branch",
                repo,
                vec!["config".into(), "--get".into(), "init.defaultBranch".into()],
            )
            .routine()
            .allow_code(1),
        )
        .await
        .ok()?;
    if output.code != 0 {
        return None;
    }
    let name = output.stdout_text();
    let name = name.trim();
    if name.is_empty() { None } else { Some(name.to_string()) }
}

fn parse_remote_head(text: &str) -> Option<Primary> {
    let mut other: Option<Primary> = None;
    for line in text.lines() {
        let mut fields = line.split('\0');
        let short = fields.next().unwrap_or("");
        let symref = fields.next().unwrap_or("").trim();
        if symref.is_empty() || !short.ends_with("/HEAD") {
            continue;
        }
        let remote = short.trim_end_matches("/HEAD");
        let local = symref
            .strip_prefix(&format!("{remote}/"))
            .unwrap_or(symref)
            .to_string();
        let found = Primary {
            local,
            remote: Some(symref.to_string()),
        };
        if remote == "origin" {
            return Some(found);
        }
        if other.is_none() {
            other = Some(found);
        }
    }
    other
}

fn arrange_branches(branches: &mut [BranchInfo], primary: Option<&Primary>) {
    for branch in branches.iter_mut() {
        let is_primary = primary.is_some_and(|primary| branch_is_primary(branch, primary));
        branch.primary = is_primary;
        branch.push_protected = is_primary;
    }
    branches.sort_by(|left, right| {
        left.remote
            .cmp(&right.remote)
            .then(right.primary.cmp(&left.primary))
            .then(commit_time(&right.date).cmp(&commit_time(&left.date)))
            .then(left.name.cmp(&right.name))
    });
}

fn branch_is_primary(branch: &BranchInfo, primary: &Primary) -> bool {
    if branch.remote {
        return primary.remote.as_deref() == Some(branch.name.as_str())
            || primary.remote.is_none()
                && branch
                    .name
                    .split_once('/')
                    .is_some_and(|(_, name)| name == primary.local);
    }
    branch.name == primary.local
}

fn commit_time(value: &str) -> i64 {
    DateTime::parse_from_rfc3339(value.trim())
        .map(|date| date.timestamp())
        .unwrap_or(i64::MIN)
}

pub fn parse_branch_records(text: &str) -> Vec<BranchInfo> {
    let mut branches = Vec::new();
    for line in text.lines() {
        if line.is_empty() {
            continue;
        }
        let fields: Vec<&str> = line.split('\0').collect();
        if fields.len() < 9 || fields[8] != "END" && !fields.contains(&"END") {
            continue;
        }
        let end = fields.iter().position(|field| *field == "END").unwrap_or(fields.len());
        if end < 8 {
            continue;
        }
        let ref_name = fields[1].to_string();
        let remote = ref_name.starts_with("refs/remotes/");
        if remote && ref_name.ends_with("/HEAD") {
            continue;
        }
        let upstream = if fields[3].is_empty() {
            None
        } else {
            Some(fields[3].to_string())
        };
        let (ahead, behind, gone) = if upstream.is_some() {
            parse_track(fields[4])
        } else {
            (None, None, false)
        };
        branches.push(BranchInfo {
            name: fields[2].to_string(),
            ref_name,
            commit: fields[0].to_string(),
            subject: fields[7].to_string(),
            date: fields[6].to_string(),
            upstream,
            ahead,
            behind,
            upstream_gone: gone,
            current: fields[5].trim() == "*",
            remote,
            primary: false,
            push_protected: false,
        });
    }
    branches
}

pub async fn create_branch(
    executor: &Executor,
    repo: &Path,
    name: &str,
    source: &str,
    checkout: bool,
) -> Result<(), CommandError> {
    validate_branch_name(executor, repo, name).await?;
    let source = source.trim();
    if !source.is_empty() {
        crate::git::util::validate_rev(source, "Create branch", Some(repo.display().to_string()))?;
    }
    let args = if checkout {
        let mut args = vec!["switch".into(), "-c".into(), name.to_string()];
        if !source.is_empty() {
            args.push("--".into());
            args.push(source.to_string());
        }
        args
    } else if source.is_empty() {
        vec!["branch".into(), name.to_string()]
    } else {
        vec!["branch".into(), name.to_string(), source.to_string()]
    };
    executor
        .run(RunOptions::git("Create branch", repo, args).mutating())
        .await?;
    Ok(())
}

pub async fn switch_branch(
    executor: &Executor,
    repo: &Path,
    name: &str,
) -> Result<(), CommandError> {
    crate::git::util::validate_rev(name, "Switch branch", Some(repo.display().to_string()))?;
    let local = executor
        .run(
            RunOptions::git(
                "Switch branch",
                repo,
                vec![
                    "show-ref".into(),
                    "--verify".into(),
                    "--quiet".into(),
                    format!("refs/heads/{name}"),
                ],
            )
            .allow_code(1),
        )
        .await?;
    let args = if local.code == 0 {
        vec!["switch".into(), "--".into(), name.to_string()]
    } else {
        vec!["switch".into(), "--track".into(), name.to_string()]
    };
    executor
        .run(RunOptions::git("Switch branch", repo, args).mutating())
        .await?;
    Ok(())
}

pub async fn rename_branch(
    executor: &Executor,
    repo: &Path,
    old: &str,
    new: &str,
) -> Result<(), CommandError> {
    validate_branch_name(executor, repo, new).await?;
    executor
        .run(
            RunOptions::git(
                "Rename branch",
                repo,
                vec!["branch".into(), "-m".into(), old.to_string(), new.to_string()],
            )
            .mutating(),
        )
        .await?;
    Ok(())
}

pub async fn delete_branch(
    executor: &Executor,
    repo: &Path,
    name: &str,
    force: bool,
) -> Result<(), CommandError> {
    let flag = if force { "-D" } else { "-d" };
    executor
        .run(
            RunOptions::git(
                "Delete branch",
                repo,
                vec!["branch".into(), flag.into(), "--".into(), name.to_string()],
            )
            .mutating(),
        )
        .await?;
    Ok(())
}

pub async fn set_upstream(
    executor: &Executor,
    repo: &Path,
    branch: &str,
    upstream: &str,
) -> Result<(), CommandError> {
    executor
        .run(
            RunOptions::git(
                "Set upstream",
                repo,
                vec![
                    "branch".into(),
                    format!("--set-upstream-to={upstream}"),
                    branch.to_string(),
                ],
            )
            .mutating(),
        )
        .await?;
    Ok(())
}

pub async fn validate_branch_name(
    executor: &Executor,
    repo: &Path,
    name: &str,
) -> Result<(), CommandError> {
    if name.trim().is_empty() {
        return Err(CommandError::new(
            ErrorKind::InvalidBranchName,
            "Validate branch",
            Some(repo.display().to_string()),
            "Enter a branch name.",
        ));
    }
    let output = executor
        .run(
            RunOptions::git(
                "Validate branch",
                repo,
                vec!["check-ref-format".into(), "--branch".into(), name.to_string()],
            )
            .allow_code(1)
            .allow_code(128),
        )
        .await?;
    if output.code != 0 {
        let detail = output.stderr.trim();
        return Err(CommandError::new(
            ErrorKind::InvalidBranchName,
            "Validate branch",
            Some(repo.display().to_string()),
            if detail.is_empty() {
                format!("`{name}` is not a valid branch name.")
            } else {
                detail.to_string()
            },
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{arrange_branches, parse_branch_records, parse_remote_head, Primary};

    fn record(name: &str, remote: bool, date: &str) -> String {
        let prefix = if remote { "refs/remotes" } else { "refs/heads" };
        format!("abc\0{prefix}/{name}\0{name}\0\0\0 \0{date}\0subject\0END\n")
    }

    #[test]
    fn reads_origin_head_without_a_hardcoded_name() {
        let text = "origin/main\0\norigin/HEAD\0origin/dev\nupstream/HEAD\0upstream/main\n";
        let primary = parse_remote_head(text).unwrap();
        assert_eq!(primary.local, "dev");
        assert_eq!(primary.remote.as_deref(), Some("origin/dev"));
    }

    #[test]
    fn puts_the_default_branch_first_and_sorts_the_rest_by_commit_date() {
        let text = format!(
            "{}{}{}",
            record("feature", false, "2026-11-01T00:00:00Z"),
            record("main", false, "2026-01-01T00:00:00Z"),
            record("dev", false, "2026-11-10T00:00:00Z"),
        );
        let mut branches = parse_branch_records(&text);
        arrange_branches(
            &mut branches,
            Some(&Primary {
                local: "main".into(),
                remote: Some("origin/main".into()),
            }),
        );
        let names: Vec<_> = branches.iter().map(|branch| branch.name.as_str()).collect();
        assert_eq!(names, ["main", "dev", "feature"]);
        assert!(branches[0].primary);
        assert!(branches[0].push_protected);
        assert!(!branches[1].push_protected);
    }
}
