# Architecture

Git Desktop keeps four boundaries:

```text
React UI
  -> frontend services (typed invoke wrappers and Zustand)
  -> Tauri commands
  -> Rust Git services
  -> system Git
```

The webview cannot start a process. Every Git operation goes through `Executor` in `src-tauri/src/git/executor.rs`.

## Git is the engine

Repository identity, status, history, and mutations come from Git command output. The app does not vendor libgit2 or reimplement refs, the index, or packfiles. Worktrees and submodules are classified from `git rev-parse` rather than by assuming `.git` is a directory.

## Command execution

`Executor` builds `std::process::Command` with an argument vector. User-controlled branch names, paths, and messages are individual arguments, never interpolated into a shell string. Network commands set `GIT_TERMINAL_PROMPT=0` and, when `GIT_SSH_COMMAND` is unset, ask SSH to use `BatchMode` so a missing key fails instead of waiting for a passphrase prompt.

Mutating commands for one repository take a standard mutex inside the blocking thread. Reads do not take that lock, so status for one repository can run while another repository is fetching. Cancellation sends `SIGTERM` to the process group, then `SIGKILL` if it is still alive.

The executor emits `git-log` and `git-progress`. Tests use a null event bus, so they do not need a Tauri runtime.

## Interface

There is one window and no client-side router. The active view is either the workspace or Settings. Repository UI state is keyed by the canonical path returned by Git, so two directories with the same folder name do not share selection, section, or diff mode.

TanStack Query stores read models (`status`, `branches`, `log`, diffs, and the other listings). Zustand stores the open tabs, settings, the operation log shown in the window, and transient UI such as the open dialog and the current error. Query keys include the repository path, so background reads for inactive tabs stay independent.

The commit graph is laid out in the frontend from parent hashes. Rust returns the parent list from `git log`; it does not invent columns from dates.

## Persistence

`config.json` in the application config directory is schema version 1. Saves are atomic (write a temporary file, then rename). A future schema version is loaded for display when possible and is not overwritten. Secrets, tokens, and SSH passphrases are not part of the schema.

## Extension points

New Git operations should be a Rust function that calls `Executor`, a typed command, a method on `src/services/git/api.ts`, and a user-initiated control. Operation detection already distinguishes merge, rebase, cherry-pick, revert, bisect, detached HEAD, and an unborn branch, so those flows can be added without a new status model. The commit context menu reserves cherry-pick, revert, reset, and interactive rebase as disabled entries.
