use std::io::{Read, Write};
use std::sync::Mutex;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::error::{CommandError, ErrorKind};
use crate::services::state::AppState;

pub struct TerminalSession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
}

#[derive(Clone, Serialize)]
struct TerminalData {
    id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct TerminalExit {
    id: String,
}

pub fn open(state: &AppState, repo: &str) -> Result<String, CommandError> {
    let root = std::path::Path::new(repo);
    if !root.is_dir() {
        return Err(CommandError::new(
            ErrorKind::InvalidRepository,
            "Terminal",
            Some(repo.to_string()),
            "The repository folder does not exist.",
        ));
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let system = native_pty_system();
    let pair = system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|err| terminal_error(repo, format!("Could not open a terminal: {err}")))?;
    let mut command = CommandBuilder::new(shell);
    command.arg("-l");
    command.cwd(root);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|err| terminal_error(repo, format!("Could not start the shell: {err}")))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|err| terminal_error(repo, format!("Could not read the terminal: {err}")))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|err| terminal_error(repo, format!("Could not write to the terminal: {err}")))?;
    let id = Uuid::new_v4().to_string();
    spawn_reader(state.app.clone(), id.clone(), reader);
    state
        .terminals
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .insert(
            id.clone(),
            TerminalSession {
                writer: Mutex::new(writer),
                master: Mutex::new(pair.master),
                child: Mutex::new(child),
            },
        );
    Ok(id)
}

pub fn write(state: &AppState, id: &str, data: &str) -> Result<(), CommandError> {
    let sessions = state.terminals.lock().unwrap_or_else(|err| err.into_inner());
    let Some(session) = sessions.get(id) else {
        return Err(missing(id));
    };
    let mut writer = session.writer.lock().unwrap_or_else(|err| err.into_inner());
    writer
        .write_all(data.as_bytes())
        .map_err(|err| terminal_error(id, format!("Could not write to the terminal: {err}")))?;
    writer
        .flush()
        .map_err(|err| terminal_error(id, format!("Could not write to the terminal: {err}")))?;
    Ok(())
}

pub fn resize(state: &AppState, id: &str, rows: u16, cols: u16) -> Result<(), CommandError> {
    let sessions = state.terminals.lock().unwrap_or_else(|err| err.into_inner());
    let Some(session) = sessions.get(id) else {
        return Err(missing(id));
    };
    session
        .master
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|err| terminal_error(id, format!("Could not resize the terminal: {err}")))?;
    Ok(())
}

pub fn close(state: &AppState, id: &str) {
    let Some(session) = state
        .terminals
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .remove(id)
    else {
        return;
    };
    let _ = session
        .child
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .kill();
}

fn spawn_reader(app: AppHandle, id: String, mut reader: Box<dyn Read + Send>) {
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(size) => {
                    let _ = app.emit(
                        "terminal-data",
                        TerminalData {
                            id: id.clone(),
                            data: base64_encode(&buf[..size]),
                        },
                    );
                }
            }
        }
        let _ = app.emit("terminal-exit", TerminalExit { id });
    });
}

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in data.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (a << 16) | (b << 8) | c;
        out.push(TABLE[((triple >> 18) & 63) as usize] as char);
        out.push(TABLE[((triple >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn terminal_error(repo: &str, message: String) -> CommandError {
    CommandError::new(ErrorKind::Io, "Terminal", Some(repo.to_string()), message)
}

fn missing(id: &str) -> CommandError {
    CommandError::new(
        ErrorKind::Other,
        "Terminal",
        None,
        format!("Terminal {id} is not open."),
    )
}
