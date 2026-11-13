use std::path::Path;

use crate::error::{CommandError, ErrorKind};
use crate::git::executor::{Executor, RunOptions};
use crate::models::TagInfo;

const TAG_FORMAT: &str = "%(objectname)%00%(objecttype)%00%(*objectname)%00%(refname:short)%00%(subject)%00%(*subject)%00%(taggername)%00%(taggerdate:iso-strict)%00END";

pub async fn list_tags(executor: &Executor, repo: &Path) -> Result<Vec<TagInfo>, CommandError> {
    let output = executor
        .run(RunOptions::git(
            "List tags",
            repo,
            vec![
                "for-each-ref".into(),
                format!("--format={TAG_FORMAT}"),
                "refs/tags".into(),
            ],
        ))
        .await?;
    Ok(parse_tags(&output.stdout_text()))
}

pub fn parse_tags(text: &str) -> Vec<TagInfo> {
    let mut tags = Vec::new();
    for line in text.lines() {
        let fields: Vec<&str> = line.split('\0').collect();
        if fields.len() < 9 {
            continue;
        }
        let annotated = fields[1] == "tag";
        let commit = if annotated && !fields[2].is_empty() {
            fields[2].to_string()
        } else {
            fields[0].to_string()
        };
        let message = if annotated {
            fields[4].to_string()
        } else {
            fields[5].to_string()
        };
        tags.push(TagInfo {
            name: fields[3].to_string(),
            commit,
            annotated,
            message,
            tagger_name: optional(fields[6]),
            tagger_date: optional(fields[7]),
        });
    }
    tags
}

fn optional(value: &str) -> Option<String> {
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

pub async fn create_tag(
    executor: &Executor,
    repo: &Path,
    name: &str,
    target: &str,
    annotated: bool,
    message: &str,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    validate_tag_name(executor, repo, name).await?;
    crate::git::util::validate_rev(target, "Create tag", Some(repo.display().to_string()))?;
    let args = if annotated {
        if message.trim().is_empty() {
            return Err(CommandError::new(
                ErrorKind::Other,
                "Create tag",
                Some(repo.display().to_string()),
                "Annotated tags need a message.",
            ));
        }
        vec![
            "tag".into(),
            "-a".into(),
            name.to_string(),
            "-m".into(),
            message.to_string(),
            target.to_string(),
        ]
    } else {
        vec!["tag".into(), name.to_string(), target.to_string()]
    };
    executor
        .run(
            RunOptions::git("Create tag", repo, args).mutating().authorize(
                None,
                if annotated { identity_name } else { None },
                if annotated { identity_email } else { None },
                false,
            )?,
        )
        .await?;
    Ok(())
}

pub async fn delete_tag(executor: &Executor, repo: &Path, name: &str) -> Result<(), CommandError> {
    validate_tag_name(executor, repo, name).await?;
    executor
        .run(
            RunOptions::git(
                "Delete tag",
                repo,
                vec!["tag".into(), "-d".into(), name.to_string()],
            )
            .mutating(),
        )
        .await?;
    Ok(())
}

pub async fn push_tag(
    executor: &Executor,
    repo: &Path,
    remote: &str,
    name: &str,
    ssh_key: Option<String>,
    operation_id: Option<String>,
) -> Result<(), CommandError> {
    if remote.is_empty() || remote.starts_with('-') {
        return Err(CommandError::new(
            ErrorKind::RemoteNotFound,
            "Push tag",
            Some(repo.display().to_string()),
            "Choose a remote.",
        ));
    }
    validate_tag_name(executor, repo, name).await?;
    let mut options = RunOptions::git(
        "Push tag",
        repo,
        vec![
            "push".into(),
            "--progress".into(),
            remote.to_string(),
            format!("refs/tags/{name}"),
        ],
    )
    .mutating()
    .network();
    options.operation_id = operation_id;
    executor.run(options.authorize(ssh_key, None, None, false)?).await?;
    Ok(())
}

async fn validate_tag_name(executor: &Executor, repo: &Path, name: &str) -> Result<(), CommandError> {
    if name.trim().is_empty() || name.contains('\n') {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Tag",
            Some(repo.display().to_string()),
            "Enter a tag name.",
        ));
    }
    let output = executor
        .run(
            RunOptions::git(
                "Validate tag",
                repo,
                vec![
                    "check-ref-format".into(),
                    format!("refs/tags/{name}"),
                ],
            )
            .allow_code(1),
        )
        .await?;
    if output.code != 0 {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Tag",
            Some(repo.display().to_string()),
            format!("`{name}` is not a valid tag name."),
        ));
    }
    Ok(())
}
