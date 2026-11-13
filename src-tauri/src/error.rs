use serde::Serialize;

use crate::git::util::{display_command, redact_text};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    GitNotFound,
    InvalidRepository,
    InvalidBranchName,
    BranchExists,
    CheckoutConflict,
    AuthFailed,
    RemoteNotFound,
    PushRejected,
    MergeConflict,
    RebaseConflict,
    LockFile,
    PermissionDenied,
    Network,
    DetachedHead,
    NoCommits,
    Cancelled,
    Io,
    Other,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub kind: ErrorKind,
    pub operation: String,
    pub repository: Option<String>,
    pub command: String,
    pub args: Vec<String>,
    pub exit_code: Option<i32>,
    pub message: String,
    pub stderr: String,
    pub stdout: String,
}

impl CommandError {
    pub fn new(
        kind: ErrorKind,
        operation: impl Into<String>,
        repository: Option<String>,
        message: impl Into<String>,
    ) -> Self {
        let message = message.into();
        Self {
            kind,
            operation: operation.into(),
            repository,
            command: "git".into(),
            args: Vec::new(),
            exit_code: None,
            message,
            stderr: String::new(),
            stdout: String::new(),
        }
    }

    pub fn from_output(
        operation: &str,
        repository: Option<String>,
        args: &[String],
        exit_code: Option<i32>,
        stdout: &str,
        stderr: &str,
    ) -> Self {
        let stdout = redact_text(stdout);
        let stderr = redact_text(stderr);
        let kind = classify(exit_code, &stdout, &stderr);
        let message = primary_message(&stderr, &stdout, exit_code);
        Self {
            kind,
            operation: operation.to_string(),
            repository,
            command: "git".into(),
            args: args.iter().map(|arg| redact_text(arg)).collect(),
            exit_code,
            message,
            stderr,
            stdout,
        }
    }

    pub fn display(&self) -> String {
        if self.args.is_empty() {
            self.command.clone()
        } else {
            display_command(&self.args)
        }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

pub fn classify(exit_code: Option<i32>, stdout: &str, stderr: &str) -> ErrorKind {
    let combined = format!("{stderr}\n{stdout}");
    let lower = combined.to_lowercase();
    if lower.contains("not a git repository") || lower.contains("but not a git repository") {
        return ErrorKind::InvalidRepository;
    }
    if lower.contains("index.lock")
        || (lower.contains("unable to create") && lower.contains(".lock"))
        || lower.contains("another git process")
    {
        return ErrorKind::LockFile;
    }
    if lower.contains("permission denied (publickey)")
        || lower.contains("authentication failed")
        || lower.contains("could not read username")
        || lower.contains("terminal prompts disabled")
        || lower.contains("authentication required")
    {
        return ErrorKind::AuthFailed;
    }
    if lower.contains("could not resolve host")
        || lower.contains("network is unreachable")
        || lower.contains("connection timed out")
        || lower.contains("connection refused")
        || lower.contains("failed to connect")
        || lower.contains("the remote end hung up")
        || lower.contains("could not read from remote repository")
            && !lower.contains("publickey")
    {
        return ErrorKind::Network;
    }
    if lower.contains("updates were rejected")
        || lower.contains("non-fast-forward")
        || lower.contains("failed to push some refs")
        || lower.contains("fetch first")
    {
        return ErrorKind::PushRejected;
    }
    if lower.contains("fix conflicts and then commit")
        || lower.contains("merge conflict")
        || lower.contains("conflict (content)")
        || lower.contains("automatic merge failed")
    {
        return ErrorKind::MergeConflict;
    }
    if lower.contains("could not apply") && lower.contains("rebase")
        || lower.contains("resolve all conflicts") && lower.contains("rebase")
        || lower.contains("rebasing") && lower.contains("conflict")
    {
        return ErrorKind::RebaseConflict;
    }
    if lower.contains("a branch named") && lower.contains("already exists")
        || lower.contains("already exists") && lower.contains("branch")
    {
        return ErrorKind::BranchExists;
    }
    if lower.contains("is not a valid branch name")
        || lower.contains("invalid ref")
        || lower.contains("not a valid ref")
    {
        return ErrorKind::InvalidBranchName;
    }
    if lower.contains("would be overwritten by checkout")
        || lower.contains("your local changes to the following files would be overwritten")
        || lower.contains("please commit your changes or stash them")
    {
        return ErrorKind::CheckoutConflict;
    }
    if lower.contains("you are not currently on a branch") || lower.contains("detached head") {
        return ErrorKind::DetachedHead;
    }
    if lower.contains("does not have any commits yet")
        || lower.contains("no commits yet")
        || lower.contains("your current branch") && lower.contains("does not have any commits")
        || lower.contains("ambiguous argument 'head'")
    {
        return ErrorKind::NoCommits;
    }
    if lower.contains("no such remote") || lower.contains("does not appear to be a git repository")
    {
        return ErrorKind::RemoteNotFound;
    }
    if lower.contains("permission denied") {
        return ErrorKind::PermissionDenied;
    }
    if exit_code.is_none() {
        return ErrorKind::Io;
    }
    ErrorKind::Other
}

fn primary_message(stderr: &str, stdout: &str, exit_code: Option<i32>) -> String {
    let source = if stderr.trim().is_empty() {
        stdout
    } else {
        stderr
    };
    for line in source.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let without_fatal = trimmed
            .strip_prefix("fatal: ")
            .or_else(|| trimmed.strip_prefix("error: "))
            .unwrap_or(trimmed);
        return without_fatal.to_string();
    }
    match exit_code {
        Some(code) => format!("Git exited with status {code}"),
        None => "Git command failed before it could exit".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_common_git_failures() {
        assert_eq!(
            classify(Some(128), "", "fatal: not a git repository"),
            ErrorKind::InvalidRepository
        );
        assert_eq!(
            classify(
                Some(1),
                "",
                "fatal: Unable to create '/repo/.git/index.lock': File exists."
            ),
            ErrorKind::LockFile
        );
        assert_eq!(
            classify(Some(128), "", "git@github.com: Permission denied (publickey)."),
            ErrorKind::AuthFailed
        );
        assert_eq!(
            classify(Some(1), "", "Updates were rejected because the remote contains work"),
            ErrorKind::PushRejected
        );
        assert_eq!(
            classify(
                Some(1),
                "",
                "error: Your local changes to the following files would be overwritten by checkout"
            ),
            ErrorKind::CheckoutConflict
        );
        assert_eq!(
            classify(Some(1), "", "Automatic merge failed; fix conflicts and then commit the result."),
            ErrorKind::MergeConflict
        );
    }
}
