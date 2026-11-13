# Development

## Setup

Install Xcode command-line tools, Node.js 20 or newer, and Rust stable (`rustup` target `aarch64-apple-darwin`). Git must be the system or Homebrew Git the app will shell out to.

```bash
npm install
npm run tauri dev
```

The window talks to Vite at `http://localhost:1420`. Frontend tests use Vitest and jsdom. Rust tests use temporary repositories and the real `git` binary.

```bash
npm run typecheck
npm test
npm run test:rust
```

`npm run build` typechecks and writes the frontend to `dist/`. `npm run tauri build` runs that command and then builds the release binary, `.app`, and `.dmg`.

## macOS packaging

`src-tauri/tauri.conf.json` sets the product name Git Desktop, identifier `app.gitdesktop.desktop`, category Developer Tool, and bundle targets `app` and `dmg`. Icons live in `src-tauri/icons`.

After a successful build, the unsigned bundle is under:

```text
src-tauri/target/release/bundle/macos/Git Desktop.app
src-tauri/target/release/bundle/dmg/
```

An unsigned application opens from Finder only through Right Click, Open, the first time. It is not suitable for distribution to other people.

## Signing and notarization

Public distribution needs an Apple Developer ID Application certificate and notarization. Typical steps, once the certificate is in the login keychain:

1. Set `APPLE_SIGNING_IDENTITY` to the Developer ID Application certificate name.
2. Build with Tauri's bundler so the `.app` is signed (`npm run tauri build`).
3. Notarize the `.dmg` or `.app` with `notarytool`, then staple the ticket.

Tauri's bundle configuration accepts `bundle.macOS.signingIdentity`. Do not commit the certificate, an app-specific password, or an App Store Connect API key. A notarized build is a separate release step from `tauri dev`.

The application is intentionally not sandboxed. Entitlements that deny access to user-selected folders would make Open Repository fail for normal working copies.

## Tests that touch Git

Rust integration tests set a local user name and email, disable `commit.gpgsign`, and point `core.hooksPath` at an empty directory so a developer's global Git config does not sign commits or run hooks inside the fixture.
