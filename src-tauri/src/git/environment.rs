use std::path::Path;
use std::process::Command;

use crate::error::{CommandError, ErrorKind};
use crate::git::executor::{resolve_git, Executor, RunOptions};
use crate::models::{EnvironmentInfo, SshTestResult};

pub async fn environment_info(
    executor: &Executor,
    preferred_git: Option<&str>,
    repo: Option<&Path>,
) -> EnvironmentInfo {
    if let Some(preferred) = preferred_git {
        if let Ok(path) = resolve_git(Some(preferred)) {
            executor.set_git_path(path);
        }
    }
    let git_path = executor.git_path();
    let (git_version, git_error) = match executor
        .run(RunOptions::program("Git version", vec!["--version".into()]))
        .await
    {
        Ok(output) => (Some(output.stdout_text().trim().to_string()), None),
        Err(error) => (None, Some(error.message)),
    };
    let ssh_path = which::which("ssh").ok();
    let ssh_version = ssh_path.as_ref().and_then(|path| ssh_version(path));
    let agent_socket = std::env::var("SSH_AUTH_SOCK").ok();
    let ssh_agent_available = agent_socket
        .as_ref()
        .is_some_and(|socket| Path::new(socket).exists());
    let identities = if ssh_agent_available {
        ssh_identities()
    } else {
        Vec::new()
    };
    let global_user_name = git_config(executor, None, "user.name", true).await;
    let global_user_email = git_config(executor, None, "user.email", true).await;
    let (local_user_name, local_user_email) = if let Some(repo) = repo {
        (
            git_config(executor, Some(repo), "user.name", false).await,
            git_config(executor, Some(repo), "user.email", false).await,
        )
    } else {
        (None, None)
    };
    EnvironmentInfo {
        git_path: Some(git_path.to_string_lossy().into_owned()),
        git_version,
        git_error,
        ssh_path: ssh_path.map(|path| path.to_string_lossy().into_owned()),
        ssh_version,
        ssh_agent_available,
        identities,
        public_key_files: public_key_names(),
        global_user_name,
        global_user_email,
        local_user_name,
        local_user_email,
    }
}

pub async fn set_identity(
    executor: &Executor,
    repo: Option<&Path>,
    name: &str,
    email: &str,
    global: bool,
) -> Result<(), CommandError> {
    if name.contains('\n') || email.contains('\n') || name.contains('\0') || email.contains('\0') {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Set identity",
            repo.map(|path| path.display().to_string()),
            "Name and email cannot contain newlines.",
        ));
    }
    if name.trim().is_empty() || email.trim().is_empty() {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Set identity",
            repo.map(|path| path.display().to_string()),
            "Enter both a name and an email.",
        ));
    }
    let scope = if global { "--global" } else { "--local" };
    if !global && repo.is_none() {
        return Err(CommandError::new(
            ErrorKind::InvalidRepository,
            "Set identity",
            None,
            "Open a repository before setting a local identity.",
        ));
    }
    let operation = if global {
        "Set global identity"
    } else {
        "Set repository identity"
    };
    for (key, value) in [("user.name", name.trim()), ("user.email", email.trim())] {
        let args = vec![
            "config".into(),
            scope.into(),
            key.into(),
            value.to_string(),
        ];
        let mut options = RunOptions::program(operation, args).mutating();
        if let Some(repo) = repo {
            options.repository = Some(repo.display().to_string());
            options.working_dir = Some(repo.to_path_buf());
        }
        executor.run(options).await?;
    }
    Ok(())
}

pub fn ssh_test(executor: &Executor, target: &str, key: Option<&str>) -> Result<SshTestResult, CommandError> {
    let target = target.trim();
    if target.is_empty()
        || target.chars().any(|ch| ch.is_whitespace() || ch == '\0')
        || target.starts_with('-')
    {
        return Err(CommandError::new(
            ErrorKind::Other,
            "SSH test",
            None,
            "Enter a host such as git@example.com.",
        ));
    }
    let ssh = which::which("ssh").map_err(|_| {
        CommandError::new(ErrorKind::Other, "SSH test", None, "ssh was not found on PATH.")
    })?;
    let mut command = Command::new(&ssh);
    let mut display = String::from("ssh");
    if let Some(key) = key.map(str::trim).filter(|key| !key.is_empty()) {
        crate::git::executor::ssh_command_for(&key).map_err(|message| {
            CommandError::new(ErrorKind::AuthFailed, "SSH test", None, message)
        })?;
        command.arg("-i").arg(&key);
        executor.arm_askpass(&mut command, &key);
        display.push_str(" -i ");
        display.push_str(&key);
    } else {
        command.args(["-o", "BatchMode=yes"]);
        display.push_str(" -o BatchMode=yes");
    }
    command.args(["-o", "ConnectTimeout=12", "-o", "StrictHostKeyChecking=yes", "-T", target]);
    display.push_str(" -o ConnectTimeout=12 -T ");
    display.push_str(target);
    let output = command
        .output()
        .map_err(|err| CommandError::new(ErrorKind::Io, "SSH test", None, err.to_string()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let code = output.status.code();
    Ok(SshTestResult {
        display,
        exit_code: code,
        success: output.status.success(),
        stdout,
        stderr,
    })
}

async fn git_config(
    executor: &Executor,
    repo: Option<&Path>,
    key: &str,
    global: bool,
) -> Option<String> {
    let mut args = vec!["config".into()];
    if global {
        args.push("--global".into());
    } else {
        args.push("--local".into());
    }
    args.push("--get".into());
    args.push(key.into());
    let mut options = RunOptions::program("Git config", args).allow_code(1);
    if let Some(repo) = repo {
        options.working_dir = Some(repo.to_path_buf());
        options.repository = Some(repo.display().to_string());
    }
    let output = executor.run(options).await.ok()?;
    if output.code != 0 {
        return None;
    }
    let value = output.stdout_text();
    let value = value.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn ssh_version(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("-V").output().ok()?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let text = if stderr.trim().is_empty() { stdout } else { stderr };
    let line = text.lines().next()?.trim().to_string();
    if line.is_empty() { None } else { Some(line) }
}

fn ssh_identities() -> Vec<String> {
    let Ok(ssh_add) = which::which("ssh-add") else {
        return Vec::new();
    };
    let Ok(output) = Command::new(ssh_add).arg("-l").output() else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect()
}

fn public_key_names() -> Vec<String> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    let directory = Path::new(&home).join(".ssh");
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut names = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.ends_with(".pub") {
            names.push(name);
        }
    }
    names.sort();
    names
}
