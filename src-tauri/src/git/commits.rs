use std::path::Path;

use chrono::{DateTime, FixedOffset};

use crate::error::{CommandError, ErrorKind};
use crate::git::executor::{Executor, RunOptions};
use crate::git::parse::{parse_decorations, parse_numstat};
use crate::git::util::{validate_rev, with_quotepath};
use crate::models::{CommitDetails, CommitLogPage, CommitSummary, NumstatFile};

pub async fn commit_log(
    executor: &Executor,
    repo: &Path,
    skip: u32,
    limit: u32,
    grep: Option<&str>,
    revision: Option<&str>,
) -> Result<CommitLogPage, CommandError> {
    let limit = limit.clamp(1, 200);
    let fetch = limit + 1;
    let mut args = vec![
        "log".into(),
        "--topo-order".into(),
        "--decorate=full".into(),
        format!("-n{fetch}"),
        format!("--skip={skip}"),
        "--format=format:%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%ce%x1f%cI%x1f%D%x1f%s"
            .into(),
    ];
    if let Some(pattern) = grep.map(str::trim).filter(|pattern| !pattern.is_empty()) {
        if pattern.contains('\n') || pattern.contains('\0') {
            return Err(CommandError::new(
                ErrorKind::Other,
                "Commit history",
                Some(repo.display().to_string()),
                "The search text contains unsupported characters.",
            ));
        }
        args.push(format!("--grep={pattern}"));
        args.push("-i".into());
    }
    if let Some(revision) = revision.map(str::trim).filter(|revision| !revision.is_empty()) {
        validate_rev(revision, "Commit history", Some(repo.display().to_string()))?;
        args.push(revision.to_string());
    } else {
        args.insert(1, "--all".into());
    }
    let output = executor
        .run(RunOptions::git("Commit history", repo, with_quotepath(args)).allow_code(128))
        .await?;
    if output.code == 128 && output.stderr.to_lowercase().contains("does not have any commits") {
        return Ok(CommitLogPage {
            commits: Vec::new(),
            has_more: false,
        });
    }
    if output.code != 0 {
        return Err(CommandError::from_output(
            "Commit history",
            Some(repo.display().to_string()),
            &output.args,
            Some(output.code),
            &output.stdout_text(),
            &output.stderr,
        ));
    }
    let mut commits = parse_commit_lines(&output.stdout_text()).map_err(|message| {
        CommandError::new(
            ErrorKind::Other,
            "Commit history",
            Some(repo.display().to_string()),
            message,
        )
    })?;
    let has_more = commits.len() > limit as usize;
    if has_more {
        commits.truncate(limit as usize);
    }
    Ok(CommitLogPage { commits, has_more })
}

pub fn parse_commit_lines(text: &str) -> Result<Vec<CommitSummary>, String> {
    let mut commits = Vec::new();
    for line in text.lines() {
        if line.is_empty() {
            continue;
        }
        let fields: Vec<&str> = line.split('\u{1f}').collect();
        if fields.len() < 11 {
            return Err("Unexpected git log record".into());
        }
        commits.push(CommitSummary {
            hash: fields[0].to_string(),
            short_hash: fields[1].to_string(),
            parents: fields[2]
                .split_whitespace()
                .filter(|parent| !parent.is_empty())
                .map(|parent| parent.to_string())
                .collect(),
            author_name: fields[3].to_string(),
            author_email: fields[4].to_string(),
            author_date: fields[5].to_string(),
            committer_name: fields[6].to_string(),
            committer_email: fields[7].to_string(),
            committer_date: fields[8].to_string(),
            subject: fields[10..].join("\u{1f}"),
            refs: parse_decorations(fields[9]),
        });
    }
    Ok(commits)
}

pub async fn commit_details(
    executor: &Executor,
    repo: &Path,
    rev: &str,
) -> Result<CommitDetails, CommandError> {
    let repo_label = Some(repo.display().to_string());
    validate_rev(rev, "Commit details", repo_label.clone())?;
    let verified = executor
        .run(RunOptions::git(
            "Commit details",
            repo,
            vec![
                "rev-parse".into(),
                "--verify".into(),
                "--quiet".into(),
                format!("{rev}^{{commit}}"),
            ],
        ))
        .await?;
    let hash = verified.stdout_text().trim().to_string();
    let object = executor
        .run(RunOptions::git(
            "Commit details",
            repo,
            vec!["cat-file".into(), "commit".into(), hash.clone()],
        ))
        .await?;
    let parsed = parse_commit_object(&object.stdout_text()).map_err(|message| {
        CommandError::new(ErrorKind::Other, "Commit details", repo_label.clone(), message)
    })?;
    let decorated = executor
        .run(RunOptions::git(
            "Commit details",
            repo,
            vec![
                "log".into(),
                "-1".into(),
                "--decorate=full".into(),
                "--format=%h%x1f%D".into(),
                hash.clone(),
            ],
        ))
        .await?;
    let decoration_line = decorated.stdout_text();
    let decoration_fields: Vec<&str> = decoration_line.trim().split('\u{1f}').collect();
    let short_hash = decoration_fields
        .first()
        .copied()
        .unwrap_or("")
        .to_string();
    let refs = parse_decorations(decoration_fields.get(1).copied().unwrap_or(""));
    let mut numstat_args = vec![
        "diff-tree".into(),
        "--no-commit-id".into(),
        "-r".into(),
        "--root".into(),
        "--numstat".into(),
        "-M".into(),
        "-z".into(),
    ];
    if parsed.parents.len() > 1 {
        numstat_args.push("-m".into());
        numstat_args.push("--first-parent".into());
    }
    numstat_args.push(hash.clone());
    let numstat = executor
        .run(RunOptions::git(
            "Commit details",
            repo,
            with_quotepath(numstat_args),
        ))
        .await?;
    let files = parse_numstat(&numstat.stdout);
    let insertions = files.iter().map(|file| file.additions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();
    let (subject, body) = split_message(&parsed.message);
    Ok(CommitDetails {
        hash,
        short_hash,
        parents: parsed.parents,
        author_name: parsed.author_name,
        author_email: parsed.author_email,
        author_date: parsed.author_date,
        committer_name: parsed.committer_name,
        committer_email: parsed.committer_email,
        committer_date: parsed.committer_date,
        subject,
        body,
        refs,
        files,
        insertions,
        deletions,
    })
}

pub async fn compare_numstat(
    executor: &Executor,
    repo: &Path,
    from: Option<&str>,
    to: Option<&str>,
    cached: bool,
) -> Result<Vec<NumstatFile>, CommandError> {
    let mut args = vec!["diff".into(), "--numstat".into(), "-z".into(), "-M".into()];
    if cached {
        args.push("--cached".into());
    }
    if let Some(from) = from {
        validate_rev(from, "Compare", Some(repo.display().to_string()))?;
        args.push(from.to_string());
    }
    if let Some(to) = to {
        validate_rev(to, "Compare", Some(repo.display().to_string()))?;
        args.push(to.to_string());
    }
    let output = executor
        .run(RunOptions::git("Compare", repo, with_quotepath(args)))
        .await?;
    Ok(parse_numstat(&output.stdout))
}

struct RawCommit {
    parents: Vec<String>,
    author_name: String,
    author_email: String,
    author_date: String,
    committer_name: String,
    committer_email: String,
    committer_date: String,
    message: String,
}

fn parse_commit_object(text: &str) -> Result<RawCommit, String> {
    let mut lines = text.split('\n').peekable();
    let mut parents = Vec::new();
    let mut author = None;
    let mut committer = None;
    while let Some(line) = lines.next() {
        if line.is_empty() {
            break;
        }
        if let Some(rest) = line.strip_prefix("parent ") {
            parents.push(rest.to_string());
        } else if let Some(rest) = line.strip_prefix("author ") {
            author = Some(parse_identity(rest)?);
        } else if let Some(rest) = line.strip_prefix("committer ") {
            committer = Some(parse_identity(rest)?);
        } else if line.starts_with("gpgsig") {
            while lines.peek().is_some_and(|next| next.starts_with(' ')) {
                lines.next();
            }
        }
    }
    let author = author.ok_or("Commit is missing an author")?;
    let committer = committer.unwrap_or_else(|| author.clone());
    let message = lines.collect::<Vec<_>>().join("\n");
    Ok(RawCommit {
        parents,
        author_name: author.0,
        author_email: author.1,
        author_date: author.2,
        committer_name: committer.0,
        committer_email: committer.1,
        committer_date: committer.2,
        message,
    })
}

fn parse_identity(value: &str) -> Result<(String, String, String), String> {
    let open = value.rfind('<').ok_or("Commit identity is missing an email")?;
    let close = value.rfind('>').ok_or("Commit identity is missing an email")?;
    if close < open {
        return Err("Commit identity is malformed".into());
    }
    let name = value[..open].trim().to_string();
    let email = value[open + 1..close].to_string();
    let mut tail = value[close + 1..].split_whitespace();
    let timestamp = tail.next().unwrap_or("0");
    let timezone = tail.next().unwrap_or("+0000");
    Ok((name, email, format_git_date(timestamp, timezone)))
}

fn format_git_date(timestamp: &str, timezone: &str) -> String {
    let seconds = timestamp.parse::<i64>().unwrap_or(0);
    let sign = if timezone.starts_with('-') { -1 } else { 1 };
    let digits = timezone.trim_start_matches(['+', '-']);
    let hours = digits.get(..2).and_then(|value| value.parse::<i32>().ok()).unwrap_or(0);
    let minutes = digits.get(2..4).and_then(|value| value.parse::<i32>().ok()).unwrap_or(0);
    let offset = FixedOffset::east_opt(sign * (hours * 3600 + minutes * 60))
        .unwrap_or_else(|| FixedOffset::east_opt(0).unwrap());
    DateTime::from_timestamp(seconds, 0)
        .map(|date| date.with_timezone(&offset).to_rfc3339())
        .unwrap_or_default()
}

fn split_message(message: &str) -> (String, String) {
    let mut lines = message.lines();
    let subject = lines.next().unwrap_or("").to_string();
    let rest: Vec<&str> = lines.collect();
    let body = if rest.first().is_some_and(|line| line.is_empty()) {
        rest[1..].join("\n")
    } else {
        rest.join("\n")
    };
    (subject, body)
}

pub async fn reset_soft(executor: &Executor, repo: &Path, target: &str) -> Result<(), CommandError> {
    let label = Some(repo.display().to_string());
    validate_rev(target, "Reset", label)?;
    executor
        .run(
            RunOptions::git(
                "Reset",
                repo,
                vec!["reset".into(), "--soft".into(), target.to_string()],
            )
            .mutating(),
        )
        .await?;
    Ok(())
}

pub async fn revert_commit(
    executor: &Executor,
    repo: &Path,
    rev: &str,
    mainline: bool,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    let label = Some(repo.display().to_string());
    validate_rev(rev, "Revert", label)?;
    let mut args = vec!["revert".into(), "--no-edit".into()];
    if mainline {
        args.push("-m".into());
        args.push("1".into());
    }
    args.push(rev.to_string());
    executor
        .run(
            RunOptions::git("Revert", repo, args)
                .mutating()
                .authorize(None, identity_name, identity_email, false)?,
        )
        .await?;
    Ok(())
}

pub async fn cherry_pick(
    executor: &Executor,
    repo: &Path,
    revs: &[String],
    branch: Option<&str>,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    let label = Some(repo.display().to_string());
    if revs.is_empty() {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Cherry-pick",
            label,
            "Choose at least one commit.",
        ));
    }
    for rev in revs {
        validate_rev(rev, "Cherry-pick", label.clone())?;
    }
    if let Some(branch) = branch.map(str::trim).filter(|branch| !branch.is_empty()) {
        validate_rev(branch, "Cherry-pick", label)?;
        executor
            .run(
                RunOptions::git(
                    "Cherry-pick",
                    repo,
                    vec!["switch".into(), "--".into(), branch.to_string()],
                )
                .mutating(),
            )
            .await?;
    }
    let mut args = vec!["cherry-pick".into()];
    args.extend(revs.iter().cloned());
    executor
        .run(
            RunOptions::git("Cherry-pick", repo, args)
                .mutating()
                .authorize(None, identity_name, identity_email, true)?,
        )
        .await?;
    Ok(())
}

pub async fn sequence_action(
    executor: &Executor,
    repo: &Path,
    action: &str,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    let label = Some(repo.display().to_string());
    if !matches!(action, "continue" | "skip" | "abort") {
        return Err(CommandError::new(ErrorKind::Other, "Continue", label, "Choose continue, skip, or abort."));
    }
    let git_dir = crate::git::repository::absolute_git_dir(executor, repo).await?;
    let operation = crate::git::repository::detect_operation(&git_dir);
    let verb = match (operation, action) {
        (crate::models::OperationKind::CherryPick, _) => "cherry-pick",
        (crate::models::OperationKind::Revert, _) => "revert",
        (crate::models::OperationKind::Rebase, _) => "rebase",
        (crate::models::OperationKind::Merge, "skip") => {
            return Err(CommandError::new(
                ErrorKind::Other,
                "Continue",
                label,
                "A merge cannot be skipped. Stage the resolved files and continue, or abort the merge.",
            ));
        }
        (crate::models::OperationKind::Merge, _) => "merge",
        _ => {
            return Err(CommandError::new(
                ErrorKind::Other,
                "Continue",
                label,
                "No merge, cherry-pick, revert, or rebase is in progress.",
            ));
        }
    };
    let args = if action == "continue" {
        vec!["-c".into(), "core.editor=true".into(), verb.into(), "--continue".into()]
    } else {
        vec![verb.into(), format!("--{action}")]
    };
    let name = match action {
        "skip" => "Skip",
        "abort" => "Abort",
        _ => "Continue",
    };
    let committer_only = matches!(verb, "cherry-pick" | "rebase");
    let (identity_name, identity_email) = if action == "abort" {
        (None, None)
    } else {
        (identity_name, identity_email)
    };
    executor
        .run(
            RunOptions::git(name, repo, args)
                .mutating()
                .authorize(None, identity_name, identity_email, committer_only)?,
        )
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_log_records_and_root_commit() {
        let text = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\u{1f}aaaaaaa\u{1f}bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\u{1f}Ada\u{1f}ada@example.com\u{1f}2026-01-01T00:00:00+01:00\u{1f}Ada\u{1f}ada@example.com\u{1f}2026-01-01T00:00:00+01:00\u{1f}HEAD -> refs/heads/main\u{1f}subject line\n\
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\u{1f}bbbbbbb\u{1f}\u{1f}Ada\u{1f}ada@example.com\u{1f}2026-01-01T00:00:00+01:00\u{1f}Ada\u{1f}ada@example.com\u{1f}2026-01-01T00:00:00+01:00\u{1f}\u{1f}init\n";
        let commits = parse_commit_lines(text).unwrap();
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].parents, vec!["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);
        assert!(commits[1].parents.is_empty());
        assert_eq!(commits[0].refs[0].name, "main");
        assert!(commits[0].refs[0].head);
    }

    #[test]
    fn parses_commit_object_with_two_parents() {
        let object = "\
tree abc
parent 1111111111111111111111111111111111111111
parent 2222222222222222222222222222222222222222
author Ada Lovelace <ada@example.com> 1700000000 +0100
committer Ada Lovelace <ada@example.com> 1700000000 +0100

Merge branch 'feature'

Keep both histories.
";
        let parsed = parse_commit_object(object).unwrap();
        assert_eq!(parsed.parents.len(), 2);
        assert_eq!(parsed.author_name, "Ada Lovelace");
        assert_eq!(parsed.author_email, "ada@example.com");
        let (subject, body) = split_message(&parsed.message);
        assert_eq!(subject, "Merge branch 'feature'");
        assert_eq!(body, "Keep both histories.");
    }
}
