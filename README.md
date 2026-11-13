# Git Desktop

Git Desktop is a local macOS application for working with ordinary Git repositories. It presents repository state and runs Git operations through the Git executable already installed on the machine. It does not implement a Git engine, and it does not talk to GitHub, GitLab, or any other hosting API.

## Requirements

- macOS on Apple Silicon
- Git on `PATH`, or a path chosen in Settings
- OpenSSH for SSH remotes, using the existing SSH configuration and agent
- Node.js 20 or newer and Rust stable, for development

## Technology

- Tauri 2 and Rust for the desktop shell, filesystem dialogs, and Git process execution
- React, TypeScript (strict), and Vite for the interface
- Mantine for controls, Zustand for workspace and settings, TanStack Query for Git reads

## Development

```bash
npm install
npm run tauri dev
```

Other commands:

```bash
npm run typecheck
npm test
npm run test:rust
npm run build
npm run tauri build
```

`npm run tauri dev` starts the Vite dev server and the desktop window. `npm run tauri build` produces a `.app` and a `.dmg`.

## Application structure

```text
src/                  React interface, stores, and the typed Tauri client
src-tauri/src/git/    Git execution, parsing, and repository operations
src-tauri/src/commands.rs
src-tauri/tests/      Integration tests against temporary Git repositories
docs/                 Architecture and operating notes
```

The interface calls typed Tauri commands. Those commands call a single Rust executor, which starts `git` with an argument array. The webview never starts a shell.

## Current functionality

- Open, initialize, and clone repositories, including SSH and HTTPS URLs
- Several repositories at once, with draggable tabs restored after restart
- Status, upstream, ahead/behind, staged, unstaged, untracked, ignored, and conflicted paths
- Refresh, plus a debounced filesystem watch
- Unified and side-by-side diffs, including hunk staging through `git apply --cached`
- Stage, unstage, discard (with confirmation), commit, and explicit amend
- Branches, history with a parent-based graph, remotes, fetch, pull, and push
- Stashes and tags
- An operation log containing the command, duration, exit code, and output
- Settings for theme, Git path, identity, branch templates, and SSH diagnostics

Pull requires an explicit merge, rebase, or fast-forward-only choice. Push never uses `--force`.

## Known limitations

- Line-level staging, cherry-pick, merge, rebase execution, revert, reset, and interactive rebase are recognized in the model or reserved in menus, and are not implemented as actions.
- Commit history loads 100 commits at a time. The graph covers the loaded page, not an entire large repository.
- Scroll positions inside panels are kept only while the window stays open.
- An unsigned local build is blocked by Gatekeeper until you open it with the Finder shortcut menu. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- Syntax highlighting is a small tokenizer, not a language grammar.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Git execution](docs/GIT_EXECUTION.md)
- [State management](docs/STATE_MANAGEMENT.md)
- [Security](docs/SECURITY.md)
- [Development and packaging](docs/DEVELOPMENT.md)
- [Roadmap](docs/ROADMAP.md)
