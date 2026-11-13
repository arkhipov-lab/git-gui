# Security

Git Desktop is a local application. It has no account, no cloud sync, and no hosting-provider token.

## Credentials

Private keys and passphrases are not written to `config.json` or the operation log. Settings may store an absolute path to a private key. Fetch, pull, push, and clone then set `GIT_SSH_COMMAND` to `ssh -i` that path for that one Git process. The path is not written into Git config, SSH config, or the embedded terminal. The key bytes stay in the file the user already has. Git uses the system credential helper and SSH configuration that already exist for the user. The app reads public key filenames under `~/.ssh` and fingerprints from `ssh-add -l` for the settings screen. It does not copy private keys.

An optional passphrase for that selected key can be stored in the macOS login Keychain under the service `Git Desktop SSH`. The settings file never contains it. When a remote Git command's `ssh` asks for the key passphrase, that process gets `SSH_ASKPASS` pointing at a helper which answers only passphrase prompts by reading the Keychain. The passphrase is not passed on the command line, not exported into the embedded terminal, and not added to `ssh-agent`.

SSH connection tests run `ssh` with `BatchMode=yes`, `StrictHostKeyChecking=yes`, and a 12 second connect timeout. A host test does not disable host-key checking.

Remote URLs recorded in the operation log have userinfo removed. Environment variables are not logged.

## Process boundary

Commands are argument vectors. Branch names, paths, commit messages, and remote URLs are not passed through a shell. Path arguments used for discard and diff cannot be absolute, cannot start with `-`, and cannot contain `..`.

Network Git commands disable Git's own terminal prompts. If no SSH key is selected and `GIT_SSH_COMMAND` is unset, SSH is asked to fail instead of prompting. A selected key can receive its Keychain passphrase through `SSH_ASKPASS`.

## Filesystem

The macOS bundle is not App Sandboxed. A sandboxed `.app` could not open arbitrary repositories the user selects. Rust reads and writes only the repository being operated on, plus the application config file.

The webview content security policy allows the app origin, Tauri IPC, inline styles required by the component library, and the local Vite socket during development. It does not allow remote scripts.

## Distribution

A development build is unsigned. Gatekeeper will refuse to launch it from a normal double-click. That is expected. Public distribution needs Developer ID signing and notarization, described in [DEVELOPMENT.md](DEVELOPMENT.md). Signing does not change Git's authority: the app still runs the user's Git and SSH.
