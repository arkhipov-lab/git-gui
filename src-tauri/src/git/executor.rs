use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chrono::SecondsFormat;
use dashmap::DashMap;
use uuid::Uuid;

use crate::error::{CommandError, ErrorKind};
use crate::git::util::{cap_string, display_command, redact_text};
use crate::models::{OperationRecord, ProgressEvent};

const LOG_CAP: usize = 400;
pub(crate) const OUTPUT_CAP: usize = 2_000_000;

pub trait EventBus: Send + Sync {
    fn emit_log(&self, entry: &OperationRecord);
    fn emit_progress(&self, event: &ProgressEvent);
}

pub struct NullBus;

impl EventBus for NullBus {
    fn emit_log(&self, _: &OperationRecord) {}
    fn emit_progress(&self, _: &ProgressEvent) {}
}

struct RepoLocks {
    map: DashMap<String, Arc<Mutex<()>>>,
}

impl RepoLocks {
    fn new() -> Self {
        Self { map: DashMap::new() }
    }

    fn lock(&self, key: &str) -> Arc<Mutex<()>> {
        self.map
            .entry(key.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }
}

struct CancelRegistry {
    running: DashMap<String, u32>,
    cancelled: DashMap<String, ()>,
}

impl CancelRegistry {
    fn new() -> Self {
        Self {
            running: DashMap::new(),
            cancelled: DashMap::new(),
        }
    }

    fn insert(&self, id: String, pid: u32) {
        self.running.insert(id, pid);
    }

    fn remove(&self, id: &str) {
        self.running.remove(id);
    }

    fn cancel(&self, id: &str) -> bool {
        self.cancelled.insert(id.to_string(), ());
        if let Some((_, pid)) = self.running.remove(id) {
            terminate_process_group(pid);
            let pid_for_kill = pid;
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(1200));
                force_kill_process_group(pid_for_kill);
            });
            true
        } else {
            false
        }
    }

    fn was_cancelled(&self, id: &str) -> bool {
        self.cancelled.remove(id).is_some()
    }
}

#[derive(Clone)]
pub struct Executor {
    inner: Arc<ExecutorInner>,
}

struct ExecutorInner {
    git: Mutex<PathBuf>,
    log: Mutex<std::collections::VecDeque<OperationRecord>>,
    locks: RepoLocks,
    cancel: CancelRegistry,
    activity: DashMap<String, Instant>,
    askpass: Mutex<Option<PathBuf>>,
    events: Arc<dyn EventBus>,
}

#[derive(Debug, Clone)]
pub struct RunOptions {
    pub operation: String,
    pub repository: Option<String>,
    pub working_dir: Option<PathBuf>,
    pub args: Vec<String>,
    pub mutating: bool,
    pub network: bool,
    pub stream: bool,
    pub routine: bool,
    pub operation_id: Option<String>,
    pub success_codes: Vec<i32>,
    pub stdin: Option<Vec<u8>>,
    pub ssh_key: Option<String>,
    pub author_name: Option<String>,
    pub author_email: Option<String>,
    pub committer_only: bool,
}

impl RunOptions {
    pub fn git(operation: &str, repo: &std::path::Path, args: Vec<String>) -> Self {
        Self {
            operation: operation.to_string(),
            repository: Some(repo.to_string_lossy().into_owned()),
            working_dir: Some(repo.to_path_buf()),
            args,
            mutating: false,
            network: false,
            stream: false,
            routine: false,
            operation_id: None,
            success_codes: vec![0],
            stdin: None,
            ssh_key: None,
            author_name: None,
            author_email: None,
            committer_only: false,
        }
    }

    pub fn program(operation: &str, args: Vec<String>) -> Self {
        Self {
            operation: operation.to_string(),
            repository: None,
            working_dir: None,
            args,
            mutating: false,
            network: false,
            stream: false,
            routine: false,
            operation_id: None,
            success_codes: vec![0],
            stdin: None,
            ssh_key: None,
            author_name: None,
            author_email: None,
            committer_only: false,
        }
    }

    pub fn mutating(mut self) -> Self {
        self.mutating = true;
        self
    }

    pub fn network(mut self) -> Self {
        self.network = true;
        self.stream = true;
        self
    }

    /// A read the application repeats on its own. It is still logged, but it must not look like the user's latest action.
    pub fn routine(mut self) -> Self {
        self.routine = true;
        self
    }

    pub fn allow_code(mut self, code: i32) -> Self {
        self.success_codes.push(code);
        self
    }

    pub fn stdin_bytes(mut self, data: Vec<u8>) -> Self {
        self.stdin = Some(data);
        self
    }

    pub fn operation_id(mut self, id: impl Into<String>) -> Self {
        self.operation_id = Some(id.into());
        self
    }

    pub fn in_dir(mut self, dir: PathBuf) -> Self {
        self.working_dir = Some(dir);
        self
    }

    /// Attach the SSH key and the name/email pair for this one Git process.
    /// An empty key or an empty pair leaves Git on its own defaults.
    pub fn authorize(
        mut self,
        ssh_key: Option<String>,
        name: Option<String>,
        email: Option<String>,
        committer_only: bool,
    ) -> Result<Self, CommandError> {
        self.ssh_key = ssh_key.and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
        if let Some(path) = &self.ssh_key {
            if path.contains(['\n', '\r', '\0']) || !path.starts_with('/') {
                return Err(self.auth_error("Choose an absolute path to a private SSH key."));
            }
        }
        let name = blank_to_none(name);
        let email = blank_to_none(email);
        match (name, email) {
            (None, None) => Ok(self),
            (Some(name), Some(email)) => {
                if name.contains(['\n', '\r', '\0']) || email.contains(['\n', '\r', '\0']) {
                    return Err(self.auth_error("Name and email cannot contain line breaks."));
                }
                self.author_name = Some(name);
                self.author_email = Some(email);
                self.committer_only = committer_only;
                Ok(self)
            }
            _ => Err(self.auth_error("Choose both a name and an email, or leave the identity empty.")),
        }
    }

    fn auth_error(&self, message: &str) -> CommandError {
        CommandError::new(
            ErrorKind::Other,
            &self.operation,
            self.repository.clone(),
            message.to_string(),
        )
    }
}

fn blank_to_none(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

#[derive(Debug, Clone)]
pub struct GitOutput {
    pub stdout: Vec<u8>,
    pub stderr: String,
    pub code: i32,
    pub duration_ms: u64,
    pub args: Vec<String>,
}

impl GitOutput {
    pub fn stdout_text(&self) -> String {
        String::from_utf8_lossy(&self.stdout).into_owned()
    }
}

impl Executor {
    pub fn new(git: PathBuf, events: Arc<dyn EventBus>) -> Self {
        Self {
            inner: Arc::new(ExecutorInner {
                git: Mutex::new(git),
                log: Mutex::new(std::collections::VecDeque::new()),
                locks: RepoLocks::new(),
                cancel: CancelRegistry::new(),
                activity: DashMap::new(),
                askpass: Mutex::new(None),
                events,
            }),
        }
    }

    pub fn git_path(&self) -> PathBuf {
        self.inner
            .git
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .clone()
    }

    pub fn set_askpass(&self, path: PathBuf) {
        *self
            .inner
            .askpass
            .lock()
            .unwrap_or_else(|err| err.into_inner()) = Some(path);
    }

    pub fn arm_askpass(&self, command: &mut Command, key: &str) {
        let script = self
            .inner
            .askpass
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .clone();
        apply_askpass(script.as_deref(), command, key);
    }

    pub fn set_git_path(&self, path: PathBuf) {
        *self
            .inner
            .git
            .lock()
            .unwrap_or_else(|err| err.into_inner()) = path;
    }

    pub fn log_snapshot(&self) -> Vec<OperationRecord> {
        self.inner
            .log
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .iter()
            .cloned()
            .collect()
    }

    pub fn clear_log(&self) {
        self.inner
            .log
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .clear();
    }

    pub fn cancel(&self, id: &str) -> bool {
        self.inner.cancel.cancel(id)
    }

    /// True while a command in this repository may still be flushing files Git rewrites, such as `.git/index`.
    pub fn wrote_recently(&self, repository: &str) -> bool {
        let window = Duration::from_millis(1500);
        path_aliases(repository).iter().any(|alias| {
            self.inner
                .activity
                .get(alias)
                .is_some_and(|stamp| stamp.elapsed() < window)
        })
    }

    pub async fn run(&self, opts: RunOptions) -> Result<GitOutput, CommandError> {
        let inner = Arc::clone(&self.inner);
        tokio::task::spawn_blocking(move || inner.run_blocking(opts))
            .await
            .map_err(|err| {
                CommandError::new(
                    ErrorKind::Io,
                    "Git",
                    None,
                    format!("Failed to schedule Git command: {err}"),
                )
            })?
    }
}

impl ExecutorInner {
    fn run_blocking(&self, opts: RunOptions) -> Result<GitOutput, CommandError> {
        let lock_mutex = if opts.mutating {
            opts.repository.as_deref().map(|repo| self.locks.lock(repo))
        } else {
            None
        };
        let _guard = lock_mutex.as_ref().map(|mutex| {
            mutex
                .lock()
                .unwrap_or_else(|err| err.into_inner())
        });

        let git = self
            .git
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .clone();
        let started = Instant::now();
        let redacted_args: Vec<String> = opts.args.iter().map(|arg| redact_text(arg)).collect();
        let display = display_command(&opts.args);

        if !git_exists(&git) {
            let error = CommandError::new(
                ErrorKind::GitNotFound,
                &opts.operation,
                opts.repository.clone(),
                format!(
                    "Git executable was not found at {}. Install Git or set the path in Settings.",
                    git.display()
                ),
            );
            self.record(&opts, &redacted_args, &display, 0, None, "", &error.message, false);
            return Err(error);
        }

        let mut command = Command::new(&git);
        command.args(&opts.args);
        if let Some(dir) = &opts.working_dir {
            command.current_dir(dir);
        }
        command.env("GIT_TERMINAL_PROMPT", "0");
        command.env("LC_MESSAGES", "C");
        if let (Some(name), Some(email)) = (opts.author_name.clone(), opts.author_email.clone()) {
            command.env("GIT_COMMITTER_NAME", &name);
            command.env("GIT_COMMITTER_EMAIL", &email);
            if !opts.committer_only {
                command.env("GIT_AUTHOR_NAME", &name);
                command.env("GIT_AUTHOR_EMAIL", &email);
            }
        }
        if opts.network {
            let selected = opts.ssh_key.clone();
            if let Some(path) = selected {
                match ssh_command_for(&path) {
                    Ok(command_line) => {
                        command.env("GIT_SSH_COMMAND", command_line);
                        let script = self
                            .askpass
                            .lock()
                            .unwrap_or_else(|err| err.into_inner())
                            .clone();
                        apply_askpass(script.as_deref(), &mut command, &path);
                    }
                    Err(message) => {
                        let error = CommandError::new(
                            ErrorKind::AuthFailed,
                            &opts.operation,
                            opts.repository.clone(),
                            message,
                        );
                        self.record(
                            &opts,
                            &redacted_args,
                            &display,
                            0,
                            None,
                            "",
                            &error.message,
                            false,
                        );
                        return Err(error);
                    }
                }
            } else if std::env::var_os("GIT_SSH_COMMAND").is_none() {
                command.env(
                    "GIT_SSH_COMMAND",
                    "ssh -o BatchMode=yes -o ConnectTimeout=20",
                );
            }
        }
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());
        command.stdin(if opts.stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        });
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(err) => {
                let kind = if err.kind() == std::io::ErrorKind::NotFound {
                    ErrorKind::GitNotFound
                } else {
                    ErrorKind::Io
                };
                let error = CommandError::new(
                    kind,
                    &opts.operation,
                    opts.repository.clone(),
                    format!("Failed to start Git: {err}"),
                );
                self.record(
                    &opts,
                    &redacted_args,
                    &display,
                    started.elapsed().as_millis() as u64,
                    None,
                    "",
                    &error.message,
                    false,
                );
                return Err(error);
            }
        };

        if let Some(id) = &opts.operation_id {
            let pid = child.id();
            if pid != 0 {
                self.cancel.insert(id.clone(), pid);
            }
        }

        let stdout_pipe = child.stdout.take();
        let stderr_pipe = child.stderr.take();
        let stdout_thread = std::thread::spawn(move || read_capped(stdout_pipe));
        let stream = opts.stream;
        let events = Arc::clone(&self.events);
        let progress_meta = ProgressEvent {
            operation_id: opts.operation_id.clone(),
            repository: opts.repository.clone(),
            operation: opts.operation.clone(),
            line: String::new(),
        };
        let stderr_thread = std::thread::spawn(move || {
            read_stderr(stderr_pipe, stream, events, progress_meta)
        });

        if let (Some(data), Some(mut stdin)) = (opts.stdin.clone(), child.stdin.take()) {
            let _ = stdin.write_all(&data);
        }

        let status = child.wait();
        let stdout = stdout_thread.join().unwrap_or_else(|_| Ok(Vec::new()));
        let stderr = stderr_thread.join().unwrap_or_else(|_| Ok(Vec::new()));
        if let Some(id) = &opts.operation_id {
            self.cancel.remove(id);
        }

        let duration_ms = started.elapsed().as_millis() as u64;
        let stdout = stdout.unwrap_or_default();
        let stderr_bytes = stderr.unwrap_or_default();
        let stderr_text = String::from_utf8_lossy(&stderr_bytes).into_owned();
        let (stderr_text, _) = cap_string(&stderr_text, OUTPUT_CAP);

        let code = match status {
            Ok(status) => status.code().unwrap_or(128),
            Err(err) => {
                let error = CommandError::new(
                    ErrorKind::Io,
                    &opts.operation,
                    opts.repository.clone(),
                    format!("Failed while waiting for Git: {err}"),
                );
                self.record(
                    &opts,
                    &redacted_args,
                    &display,
                    duration_ms,
                    None,
                    "",
                    &error.message,
                    false,
                );
                return Err(error);
            }
        };

        let cancelled = opts
            .operation_id
            .as_deref()
            .is_some_and(|id| self.cancel.was_cancelled(id));
        let success = !cancelled && opts.success_codes.contains(&code);
        let stdout_text = String::from_utf8_lossy(&stdout).into_owned();
        let (logged_stdout, _) = cap_string(&redact_text(&stdout_text), OUTPUT_CAP);
        let logged_stderr = redact_text(&stderr_text);
        self.record(
            &opts,
            &redacted_args,
            &display,
            duration_ms,
            Some(code),
            &logged_stdout,
            &logged_stderr,
            success,
        );

        if cancelled {
            return Err(CommandError {
                kind: ErrorKind::Cancelled,
                operation: opts.operation,
                repository: opts.repository,
                command: "git".into(),
                args: redacted_args,
                exit_code: Some(code),
                message: "The Git operation was cancelled.".into(),
                stderr: logged_stderr,
                stdout: logged_stdout,
            });
        }

        if !success {
            return Err(CommandError::from_output(
                &opts.operation,
                opts.repository,
                &redacted_args,
                Some(code),
                &stdout_text,
                &stderr_text,
            ));
        }

        Ok(GitOutput {
            stdout,
            stderr: stderr_text,
            code,
            duration_ms,
            args: redacted_args,
        })
    }

    fn record(
        &self,
        opts: &RunOptions,
        args: &[String],
        display: &str,
        duration_ms: u64,
        exit_code: Option<i32>,
        stdout: &str,
        stderr: &str,
        success: bool,
    ) {
        let entry = OperationRecord {
            id: Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
            repository: opts.repository.clone(),
            operation: opts.operation.clone(),
            program: "git".into(),
            args: args.to_vec(),
            display: display.to_string(),
            duration_ms,
            exit_code,
            stdout: stdout.to_string(),
            stderr: stderr.to_string(),
            success,
            routine: opts.routine,
        };
        if let Some(repo) = &opts.repository {
            let now = Instant::now();
            for alias in path_aliases(repo) {
                self.activity.insert(alias, now);
            }
        }
        {
            let mut log = self.log.lock().unwrap_or_else(|err| err.into_inner());
            log.push_back(entry.clone());
            while log.len() > LOG_CAP {
                log.pop_front();
            }
        }
        self.events.emit_log(&entry);
    }
}

fn apply_askpass(script: Option<&std::path::Path>, command: &mut Command, key: &str) {
    let Some(script) = script.filter(|path| path.is_file()) else {
        return;
    };
    if !crate::services::keychain::exists(key).unwrap_or(false) {
        return;
    }
    command.env("SSH_ASKPASS", script);
    command.env("SSH_ASKPASS_REQUIRE", "force");
    command.env("GIT_DESKTOP_SSH_ACCOUNT", key);
}

pub(crate) fn ssh_command_for(path: &str) -> Result<String, String> {
    if path.contains(['\n', '\r', '\0']) || !path.starts_with('/') {
        return Err("Choose an absolute path to a private SSH key.".into());
    }
    if !std::path::Path::new(path).is_file() {
        return Err(format!("SSH key was not found at {path}."));
    }
    let quoted = format!("'{}'", path.replace('\'', "'\\''"));
    Ok(format!("ssh -i {quoted}"))
}

fn path_aliases(path: &str) -> Vec<String> {
    let trimmed = path.trim_end_matches('/');
    let mut aliases = vec![trimmed.to_string()];
    if let Some(rest) = trimmed.strip_prefix("/private") {
        if !rest.is_empty() {
            aliases.push(rest.to_string());
        }
    } else if trimmed.starts_with('/') {
        aliases.push(format!("/private{trimmed}"));
    }
    aliases
}

fn git_exists(path: &std::path::Path) -> bool {
    if path.as_os_str() == "git" {
        return which::which("git").is_ok();
    }
    path.is_file()
}

fn read_capped(pipe: Option<std::process::ChildStdout>) -> std::io::Result<Vec<u8>> {
    let mut pipe = match pipe {
        Some(pipe) => pipe,
        None => return Ok(Vec::new()),
    };
    let mut buf = Vec::new();
    let mut chunk = [0u8; 16 * 1024];
    loop {
        let read = pipe.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        if buf.len() < OUTPUT_CAP {
            let room = OUTPUT_CAP - buf.len();
            let take = read.min(room);
            buf.extend_from_slice(&chunk[..take]);
        }
    }
    Ok(buf)
}

fn read_stderr(
    pipe: Option<std::process::ChildStderr>,
    stream: bool,
    events: Arc<dyn EventBus>,
    meta: ProgressEvent,
) -> std::io::Result<Vec<u8>> {
    let mut pipe = match pipe {
        Some(pipe) => pipe,
        None => return Ok(Vec::new()),
    };
    let mut acc = Vec::new();
    let mut line = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        let read = pipe.read(&mut byte)?;
        if read == 0 {
            break;
        }
        acc.push(byte[0]);
        if acc.len() > OUTPUT_CAP {
            let overflow = acc.len() - OUTPUT_CAP / 2;
            acc.drain(..overflow);
        }
        if byte[0] == b'\n' || byte[0] == b'\r' {
            emit_line(&line, stream, &events, &meta);
            line.clear();
        } else {
            line.push(byte[0]);
            if line.len() > 8_000 {
                emit_line(&line, stream, &events, &meta);
                line.clear();
            }
        }
    }
    emit_line(&line, stream, &events, &meta);
    Ok(acc)
}

fn emit_line(line: &[u8], stream: bool, events: &Arc<dyn EventBus>, meta: &ProgressEvent) {
    if !stream || line.is_empty() {
        return;
    }
    let text = String::from_utf8_lossy(line).trim().to_string();
    if text.is_empty() {
        return;
    }
    let mut event = meta.clone();
    event.line = redact_text(&text);
    events.emit_progress(&event);
}

fn terminate_process_group(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(unix)]
    unsafe {
        libc::kill(-(pid as i32), libc::SIGTERM);
    }
}

fn force_kill_process_group(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(unix)]
    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
}

pub fn resolve_git(preferred: Option<&str>) -> Result<PathBuf, CommandError> {
    if let Some(preferred) = preferred.map(str::trim).filter(|value| !value.is_empty()) {
        let path = PathBuf::from(preferred);
        if path.is_file() {
            return Ok(path);
        }
        return Err(CommandError::new(
            ErrorKind::GitNotFound,
            "Detect Git",
            None,
            format!("Git was not found at {preferred}"),
        ));
    }
    if let Ok(found) = which::which("git") {
        return Ok(found);
    }
    for candidate in ["/usr/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Ok(path);
        }
    }
    Err(CommandError::new(
        ErrorKind::GitNotFound,
        "Detect Git",
        None,
        "Git executable was not found. Install Git or set the path in Settings.",
    ))
}
