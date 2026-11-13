use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use notify::RecommendedWatcher;
use notify_debouncer_mini::Debouncer;
use tauri::{AppHandle, Emitter};

use crate::git::executor::{EventBus, Executor};
use crate::services::terminal::TerminalSession;
use crate::models::{AppConfig, OperationRecord, ProgressEvent};

pub type RepoWatcher = Debouncer<RecommendedWatcher>;

pub struct AppState {
    pub app: AppHandle,
    pub config_path: PathBuf,
    pub writable: AtomicBool,
    pub config_error: Mutex<Option<String>>,
    pub config: Mutex<AppConfig>,
    pub executor: Executor,
    pub watchers: Mutex<HashMap<String, RepoWatcher>>,
    pub terminals: Mutex<HashMap<String, TerminalSession>>,
}

pub struct TauriBus {
    pub app: AppHandle,
}

impl EventBus for TauriBus {
    fn emit_log(&self, entry: &OperationRecord) {
        let _ = self.app.emit("git-log", entry);
    }

    fn emit_progress(&self, event: &ProgressEvent) {
        let _ = self.app.emit("git-progress", event);
    }
}
