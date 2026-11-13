# Roadmap

## Implemented

- Tauri 2 shell, native menu, folder picker, and macOS `.app` / `.dmg` configuration
- Git executable detection and a single argument-array executor with logging, cancellation, and classified errors
- Open, initialize, and clone, including progress output from the Git process
- Multiple repository tabs, drag reordering, deduplicated paths, and restored workspace
- Status, upstream, ahead/behind, external refresh, and filesystem watching
- Working tree groups, diffs, stage, unstage, hunk staging, discard, commit, and amend
- Branch create, switch, rename, delete, upstream, and publish
- Commit history, parent-based graph, and commit details for refs that point at the commit
- Fetch, pull with an explicit strategy, and non-force push
- Remotes, stashes, tags, SSH diagnostics, and branch name templates
- Rust tests against real repositories and frontend tests for tabs, status, errors, and independent repository state

## Planned

These are not available as actions yet. The status model already detects several of the in-progress states.

- Line-level staging
- Cherry-pick, merge, rebase, and interactive rebase
- Revert, reset, squash, and fixup
- A three-way conflict editor
- Reflog, blame, and bisect
- Worktree and submodule management
- Git LFS
- Rich history search and branch or commit-range comparison beyond the current diff
- Force push with lease, only behind a separate confirmation
- Multi-repository workspaces that are more than a set of tabs
- Configurable keyboard shortcuts
- Scroll-position restoration

Disabled commit-menu entries mark the history actions that should be added without changing the commit list model.
