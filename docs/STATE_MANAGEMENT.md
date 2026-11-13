# State management

Repository facts and window preferences are stored separately so a refresh cannot wipe a selection, and a selection cannot be mistaken for Git state.

## Zustand

| Store | Contents |
| --- | --- |
| `workspaceStore` | Tab order, active tab, per-repository UI, recent repositories |
| `settingsStore` | Theme, Git executable, default branch, branch templates, panel sizes |
| `uiStore` | Open dialog, busy label, progress lines, errors, focused file, search |
| `logStore` | Operation log entries received from the backend |

Per-repository UI is `{ section, selectedPaths, selectedCommit, diffMode, showIgnored }`, keyed by canonical path. Switching tabs reads that record again. In-memory focus, stash selection, and history file selection are also keyed by path. Scroll offsets are not written to disk.

## TanStack Query

Reads use query keys that start with the repository path:

- `status` also includes whether ignored files were requested. Stale time is four seconds. There is no interval polling.
- `log` is an infinite query of 100 commits.
- Diffs, commit details, branches, remotes, stashes, and tags load when the panel that needs them is active.

A mutation clears the repository error, sets a busy label, runs the command, then invalidates that repository's queries. The filesystem watcher emits `repo-changed` after a 400 ms debounce and invalidates status. Object, hook, LFS, and reflog paths are ignored so ordinary Git writes do not cause a second full scan for every object.

Inactive tabs are not polled. Their cached status remains until the watcher fires, the user refreshes, or a mutation invalidates it.

## Persistence

On startup the backend returns `config.json` and the frontend hydrates both stores. Later changes are saved after 300 ms. The saved document is version 1 and includes tabs, the active tab, recents, theme, layout, templates, and the optional Git path. If the file's version is newer than the app, the backend refuses to overwrite it.

Opening a directory resolves the repository root through Git. The same root replaces an existing tab instead of duplicating it.

## Errors and the log

Failed invokes become a `GitError` on the active repository and stay visible in the repository pane. If a dialog is open, the same error is also shown above the dialog. The backend log is a separate record of the actual process and is not duplicated by the invoke error path.
