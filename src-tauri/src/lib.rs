mod commands;
pub mod error;
pub mod git;
pub mod models;
mod services;

use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

use crate::git::executor::{resolve_git, Executor};
use crate::services::state::{AppState, TauriBus};

pub fn ssh_askpass_entry() -> i32 {
    services::keychain::print_for_askpass()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let config_dir = app.path().app_config_dir()?;
            std::fs::create_dir_all(&config_dir)?;
            let config_path = config_dir.join("config.json");
            let loaded = services::config::load(&config_path);
            let git = resolve_git(loaded.config.git_executable.as_deref())
                .unwrap_or_else(|_| std::path::PathBuf::from("git"));
            let executor = Executor::new(git, Arc::new(TauriBus { app: handle.clone() }));
            if let Ok(askpass) = services::keychain::install_askpass(&config_dir) {
                executor.set_askpass(askpass);
            }
            app.manage(AppState {
                app: handle,
                config_path,
                writable: AtomicBool::new(loaded.writable),
                config_error: std::sync::Mutex::new(loaded.error),
                config: std::sync::Mutex::new(loaded.config),
                executor,
                watchers: std::sync::Mutex::new(std::collections::HashMap::new()),
                terminals: std::sync::Mutex::new(std::collections::HashMap::new()),
            });
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                let _ = app.emit("menu-event", event.id().as_ref());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::save_config,
            commands::repository_status,
            commands::watch_repository,
            commands::unwatch_repository,
            commands::init_repository,
            commands::clone_repository,
            commands::file_diff,
            commands::compare_revisions,
            commands::stage_paths,
            commands::unstage_paths,
            commands::stage_all,
            commands::unstage_all,
            commands::discard_unstaged,
            commands::apply_hunks,
            commands::commit_preview,
            commands::commit,
            commands::list_branches,
            commands::create_branch,
            commands::switch_branch,
            commands::rename_branch,
            commands::delete_branch,
            commands::set_upstream,
            commands::validate_branch_name,
            commands::commit_log,
            commands::commit_details,
            commands::list_remotes,
            commands::add_remote,
            commands::remove_remote,
            commands::fetch_remote,
            commands::pull,
            commands::push,
            commands::list_stashes,
            commands::create_stash,
            commands::stash_action,
            commands::stash_diff,
            commands::list_tags,
            commands::create_tag,
            commands::delete_tag,
            commands::push_tag,
            commands::operation_log,
            commands::clear_operation_log,
            commands::cancel_operation,
            commands::environment_info,
            commands::set_identity,
            commands::ssh_test,
            commands::ssh_passphrase_stored,
            commands::save_ssh_passphrase,
            commands::clear_ssh_passphrase,
            commands::detect_git,
            commands::reset_soft,
            commands::revert_commit,
            commands::cherry_pick,
            commands::sequence_action,
            commands::terminal_open,
            commands::terminal_write,
            commands::terminal_resize,
            commands::terminal_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Git Desktop");
}

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let app_menu = Submenu::with_items(
        app,
        "Git Desktop",
        true,
        &[
            &MenuItem::with_id(app, "about", "About Git Desktop", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, "open", "Open Repository…", true, Some("CmdOrCtrl+O"))?,
            &MenuItem::with_id(app, "clone", "Clone Repository…", true, None::<&str>)?,
            &MenuItem::with_id(app, "init", "Initialize Repository…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "close-tab", "Close Repository", true, Some("CmdOrCtrl+W"))?,
        ],
    )?;
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let repo_menu = Submenu::with_items(
        app,
        "Repository",
        true,
        &[
            &MenuItem::with_id(app, "refresh", "Refresh", true, Some("CmdOrCtrl+R"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "fetch", "Fetch…", true, None::<&str>)?,
            &MenuItem::with_id(app, "pull", "Pull…", true, None::<&str>)?,
            &MenuItem::with_id(app, "push", "Push…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "commit", "Commit…", true, Some("CmdOrCtrl+Enter"))?,
            &MenuItem::with_id(app, "cherry-pick", "Cherry-pick…", true, None::<&str>)?,
            &MenuItem::with_id(app, "branch", "New Branch…", true, None::<&str>)?,
            &MenuItem::with_id(app, "stash", "Stash Changes…", true, None::<&str>)?,
        ],
    )?;
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "toggle-nav", "Toggle Navigation", true, None::<&str>)?,
            &MenuItem::with_id(app, "toggle-details", "Toggle Details", true, None::<&str>)?,
            &MenuItem::with_id(app, "toggle-log", "Toggle Operation Log", true, None::<&str>)?,
        ],
    )?;
    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
        ],
    )?;
    Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &repo_menu, &view_menu, &window_menu],
    )
}
