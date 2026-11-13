use std::path::Path;
use std::sync::atomic::Ordering;

use tauri::State;

use crate::error::{CommandError, ErrorKind};
use crate::git::branches;
use crate::git::commits;
use crate::git::environment;
use crate::git::executor::resolve_git;
use crate::git::remotes;
use crate::git::repository;
use crate::git::staging;
use crate::git::stash;
use crate::git::status;
use crate::git::tags;
use crate::models::{
    AppConfig, Bootstrap, BranchInfo, CommitDetails, CommitLogPage, CommitPreview, DiffResult,
    EnvironmentInfo, NumstatFile, OperationRecord, RemoteInfo, RepoStatus, SshTestResult, StashInfo,
    TagInfo, CONFIG_VERSION,
};
use crate::services::config;
use crate::services::state::AppState;
use crate::services::watcher;

fn repo_path(path: &str) -> &Path {
    Path::new(path)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn bootstrap(state: State<'_, AppState>) -> Result<Bootstrap, CommandError> {
    let config = state
        .config
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    let environment = environment::environment_info(
        &state.executor,
        config.git_executable.as_deref(),
        None,
    )
    .await;
    let config_error = state
        .config_error
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    Ok(Bootstrap {
        config,
        environment,
        config_error,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_config(state: State<'_, AppState>, mut config: AppConfig) -> Result<(), CommandError> {
    if !state.writable.load(Ordering::Relaxed) {
        return Err(CommandError::new(
            crate::error::ErrorKind::Io,
            "Save settings",
            None,
            "The configuration file was not writable, so changes were kept in memory only.",
        ));
    }
    config.version = CONFIG_VERSION;
    config.ssh_key_path = None;
    config::save(&state.config_path, &config)?;
    if let Some(preferred) = config.git_executable.clone() {
        if let Ok(resolved) = resolve_git(Some(&preferred)) {
            state.executor.set_git_path(resolved);
        }
    } else if let Ok(resolved) = resolve_git(None) {
        state.executor.set_git_path(resolved);
    }
    *state
        .config
        .lock()
        .unwrap_or_else(|err| err.into_inner()) = config;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn repository_status(
    state: State<'_, AppState>,
    path: String,
    include_ignored: bool,
) -> Result<RepoStatus, CommandError> {
    status::load_status(&state.executor, repo_path(&path), include_ignored).await
}

#[tauri::command(rename_all = "camelCase")]
pub fn watch_repository(state: State<'_, AppState>, path: String) -> Result<(), CommandError> {
    watcher::watch(&state, &path)
}

#[tauri::command(rename_all = "camelCase")]
pub fn unwatch_repository(state: State<'_, AppState>, path: String) {
    watcher::unwatch(&state, &path);
}

#[tauri::command(rename_all = "camelCase")]
pub async fn init_repository(
    state: State<'_, AppState>,
    path: String,
    branch: String,
) -> Result<RepoStatus, CommandError> {
    repository::init_repository(&state.executor, repo_path(&path), &branch).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn clone_repository(
    state: State<'_, AppState>,
    url: String,
    parent: String,
    directory_name: Option<String>,
    ssh_key: Option<String>,
    operation_id: Option<String>,
) -> Result<RepoStatus, CommandError> {
    repository::clone_repository(
        &state.executor,
        &url,
        repo_path(&parent),
        directory_name.as_deref(),
        ssh_key,
        operation_id,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn file_diff(
    state: State<'_, AppState>,
    path: String,
    kind: String,
    file_path: String,
    rev: Option<String>,
    from: Option<String>,
    to: Option<String>,
) -> Result<DiffResult, CommandError> {
    staging::file_diff(
        &state.executor,
        repo_path(&path),
        &kind,
        &file_path,
        rev.as_deref(),
        from.as_deref(),
        to.as_deref(),
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn compare_revisions(
    state: State<'_, AppState>,
    path: String,
    from: String,
    to: String,
) -> Result<Vec<NumstatFile>, CommandError> {
    commits::compare_numstat(
        &state.executor,
        repo_path(&path),
        Some(&from),
        Some(&to),
        false,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stage_paths(
    state: State<'_, AppState>,
    path: String,
    paths: Vec<String>,
) -> Result<(), CommandError> {
    staging::stage_paths(&state.executor, repo_path(&path), &paths).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn unstage_paths(
    state: State<'_, AppState>,
    path: String,
    paths: Vec<String>,
) -> Result<(), CommandError> {
    staging::unstage_paths(&state.executor, repo_path(&path), &paths).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stage_all(state: State<'_, AppState>, path: String) -> Result<(), CommandError> {
    staging::stage_all(&state.executor, repo_path(&path)).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn unstage_all(state: State<'_, AppState>, path: String) -> Result<(), CommandError> {
    staging::unstage_all(&state.executor, repo_path(&path)).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn discard_unstaged(
    state: State<'_, AppState>,
    path: String,
    paths: Vec<String>,
) -> Result<(), CommandError> {
    staging::discard_unstaged(&state.executor, repo_path(&path), &paths).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn apply_hunks(
    state: State<'_, AppState>,
    path: String,
    file_path: String,
    reverse: bool,
    hunks: Vec<String>,
) -> Result<(), CommandError> {
    staging::apply_hunks(
        &state.executor,
        repo_path(&path),
        &file_path,
        reverse,
        &hunks,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn commit_preview(
    state: State<'_, AppState>,
    path: String,
) -> Result<CommitPreview, CommandError> {
    staging::commit_preview(&state.executor, repo_path(&path)).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn commit(
    state: State<'_, AppState>,
    path: String,
    subject: String,
    body: String,
    amend: bool,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    staging::commit(
        &state.executor,
        repo_path(&path),
        &subject,
        &body,
        amend,
        identity_name,
        identity_email,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_branches(
    state: State<'_, AppState>,
    path: String,
    fallback: Option<String>,
) -> Result<Vec<BranchInfo>, CommandError> {
    branches::list_branches(&state.executor, repo_path(&path), fallback.as_deref()).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_branch(
    state: State<'_, AppState>,
    path: String,
    name: String,
    source: String,
    checkout: bool,
) -> Result<(), CommandError> {
    branches::create_branch(&state.executor, repo_path(&path), &name, &source, checkout).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn switch_branch(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<(), CommandError> {
    branches::switch_branch(&state.executor, repo_path(&path), &name).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn rename_branch(
    state: State<'_, AppState>,
    path: String,
    old_name: String,
    new_name: String,
) -> Result<(), CommandError> {
    branches::rename_branch(&state.executor, repo_path(&path), &old_name, &new_name).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_branch(
    state: State<'_, AppState>,
    path: String,
    name: String,
    force: bool,
) -> Result<(), CommandError> {
    branches::delete_branch(&state.executor, repo_path(&path), &name, force).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_upstream(
    state: State<'_, AppState>,
    path: String,
    branch: String,
    upstream: String,
) -> Result<(), CommandError> {
    branches::set_upstream(&state.executor, repo_path(&path), &branch, &upstream).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn validate_branch_name(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<(), CommandError> {
    branches::validate_branch_name(&state.executor, repo_path(&path), &name).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn commit_log(
    state: State<'_, AppState>,
    path: String,
    skip: u32,
    limit: u32,
    grep: Option<String>,
    revision: Option<String>,
) -> Result<CommitLogPage, CommandError> {
    commits::commit_log(
        &state.executor,
        repo_path(&path),
        skip,
        limit,
        grep.as_deref(),
        revision.as_deref(),
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn commit_details(
    state: State<'_, AppState>,
    path: String,
    rev: String,
) -> Result<CommitDetails, CommandError> {
    commits::commit_details(&state.executor, repo_path(&path), &rev).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_remotes(
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<RemoteInfo>, CommandError> {
    remotes::list_remotes(&state.executor, repo_path(&path)).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn add_remote(
    state: State<'_, AppState>,
    path: String,
    name: String,
    url: String,
) -> Result<(), CommandError> {
    remotes::add_remote(&state.executor, repo_path(&path), &name, &url).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn remove_remote(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<(), CommandError> {
    remotes::remove_remote(&state.executor, repo_path(&path), &name).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn fetch_remote(
    state: State<'_, AppState>,
    path: String,
    remote: Option<String>,
    prune: bool,
    scope: String,
    ssh_key: Option<String>,
    operation_id: Option<String>,
) -> Result<(), CommandError> {
    remotes::fetch(
        &state.executor,
        repo_path(&path),
        remote.as_deref(),
        prune,
        &scope,
        ssh_key,
        operation_id,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn pull(
    state: State<'_, AppState>,
    path: String,
    remote: String,
    branch: String,
    strategy: String,
    checked_out: bool,
    local_branch: Option<String>,
    force: bool,
    ssh_key: Option<String>,
    identity_name: Option<String>,
    identity_email: Option<String>,
    operation_id: Option<String>,
) -> Result<(), CommandError> {
    remotes::pull(
        &state.executor,
        repo_path(&path),
        &remote,
        &branch,
        &strategy,
        checked_out,
        local_branch.as_deref(),
        force,
        ssh_key,
        identity_name,
        identity_email,
        operation_id,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn push(
    state: State<'_, AppState>,
    path: String,
    remote: String,
    branch: String,
    set_upstream: bool,
    force: bool,
    ssh_key: Option<String>,
    operation_id: Option<String>,
) -> Result<(), CommandError> {
    remotes::push(
        &state.executor,
        repo_path(&path),
        &remote,
        &branch,
        set_upstream,
        force,
        ssh_key,
        operation_id,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_stashes(
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<StashInfo>, CommandError> {
    stash::list_stashes(&state.executor, repo_path(&path)).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_stash(
    state: State<'_, AppState>,
    path: String,
    message: String,
    include_untracked: bool,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    stash::create_stash(
        &state.executor,
        repo_path(&path),
        &message,
        include_untracked,
        identity_name,
        identity_email,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stash_action(
    state: State<'_, AppState>,
    path: String,
    action: String,
    index: u32,
) -> Result<(), CommandError> {
    stash::stash_action(&state.executor, repo_path(&path), &action, index).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stash_diff(
    state: State<'_, AppState>,
    path: String,
    index: u32,
) -> Result<DiffResult, CommandError> {
    stash::stash_diff(&state.executor, repo_path(&path), index).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_tags(
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<TagInfo>, CommandError> {
    tags::list_tags(&state.executor, repo_path(&path)).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_tag(
    state: State<'_, AppState>,
    path: String,
    name: String,
    target: String,
    annotated: bool,
    message: String,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    tags::create_tag(
        &state.executor,
        repo_path(&path),
        &name,
        &target,
        annotated,
        &message,
        identity_name,
        identity_email,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_tag(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<(), CommandError> {
    tags::delete_tag(&state.executor, repo_path(&path), &name).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn push_tag(
    state: State<'_, AppState>,
    path: String,
    remote: String,
    name: String,
    ssh_key: Option<String>,
    operation_id: Option<String>,
) -> Result<(), CommandError> {
    tags::push_tag(
        &state.executor,
        repo_path(&path),
        &remote,
        &name,
        ssh_key,
        operation_id,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub fn operation_log(state: State<'_, AppState>) -> Vec<OperationRecord> {
    state.executor.log_snapshot()
}

#[tauri::command(rename_all = "camelCase")]
pub fn clear_operation_log(state: State<'_, AppState>) {
    state.executor.clear_log();
}

#[tauri::command(rename_all = "camelCase")]
pub fn cancel_operation(state: State<'_, AppState>, operation_id: String) -> bool {
    state.executor.cancel(&operation_id)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn environment_info(
    state: State<'_, AppState>,
    path: Option<String>,
) -> Result<EnvironmentInfo, CommandError> {
    let config = state
        .config
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    Ok(environment::environment_info(
        &state.executor,
        config.git_executable.as_deref(),
        path.as_deref().map(Path::new),
    )
    .await)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_identity(
    state: State<'_, AppState>,
    path: Option<String>,
    name: String,
    email: String,
    global: bool,
) -> Result<(), CommandError> {
    environment::set_identity(
        &state.executor,
        path.as_deref().map(Path::new),
        &name,
        &email,
        global,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub fn ssh_test(
    state: State<'_, AppState>,
    target: String,
    key_path: Option<String>,
) -> Result<SshTestResult, CommandError> {
    environment::ssh_test(&state.executor, &target, key_path.as_deref())
}

#[tauri::command(rename_all = "camelCase")]
pub fn ssh_passphrase_stored(key_path: String) -> Result<bool, CommandError> {
    crate::services::keychain::exists(key_path.trim()).map_err(|message| {
        CommandError::new(ErrorKind::Other, "SSH passphrase", Some(key_path), message)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_ssh_passphrase(key_path: String, passphrase: String) -> Result<(), CommandError> {
    let mut bytes = passphrase.into_bytes();
    let result = (|| {
        crate::services::keychain::validate_passphrase(std::str::from_utf8(&bytes).unwrap_or(""))
            .map_err(|message| message)?;
        crate::services::keychain::store(key_path.trim(), &bytes)
    })();
    bytes.fill(0);
    result.map_err(|message| {
        CommandError::new(
            ErrorKind::Other,
            "SSH passphrase",
            Some(key_path),
            message,
        )
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn clear_ssh_passphrase(key_path: String) -> Result<(), CommandError> {
    crate::services::keychain::clear(key_path.trim()).map_err(|message| {
        CommandError::new(ErrorKind::Other, "SSH passphrase", Some(key_path), message)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn detect_git(state: State<'_, AppState>, preferred: Option<String>) -> Result<String, CommandError> {
    let resolved = resolve_git(preferred.as_deref())?;
    let display = resolved.to_string_lossy().into_owned();
    state.executor.set_git_path(resolved);
    Ok(display)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn reset_soft(state: State<'_, AppState>, path: String, target: String) -> Result<(), CommandError> {
    commits::reset_soft(&state.executor, repo_path(&path), &target).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn revert_commit(
    state: State<'_, AppState>,
    path: String,
    rev: String,
    mainline: bool,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    commits::revert_commit(
        &state.executor,
        repo_path(&path),
        &rev,
        mainline,
        identity_name,
        identity_email,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn cherry_pick(
    state: State<'_, AppState>,
    path: String,
    revs: Vec<String>,
    branch: Option<String>,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    commits::cherry_pick(
        &state.executor,
        repo_path(&path),
        &revs,
        branch.as_deref(),
        identity_name,
        identity_email,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn sequence_action(
    state: State<'_, AppState>,
    path: String,
    action: String,
    identity_name: Option<String>,
    identity_email: Option<String>,
) -> Result<(), CommandError> {
    commits::sequence_action(
        &state.executor,
        repo_path(&path),
        &action,
        identity_name,
        identity_email,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub fn terminal_open(state: State<'_, AppState>, path: String) -> Result<String, CommandError> {
    crate::services::terminal::open(&state, &path)
}

#[tauri::command(rename_all = "camelCase")]
pub fn terminal_write(state: State<'_, AppState>, id: String, data: String) -> Result<(), CommandError> {
    crate::services::terminal::write(&state, &id, &data)
}

#[tauri::command(rename_all = "camelCase")]
pub fn terminal_resize(state: State<'_, AppState>, id: String, rows: u16, cols: u16) -> Result<(), CommandError> {
    crate::services::terminal::resize(&state, &id, rows, cols)
}

#[tauri::command(rename_all = "camelCase")]
pub fn terminal_close(state: State<'_, AppState>, id: String) {
    crate::services::terminal::close(&state, &id)
}
