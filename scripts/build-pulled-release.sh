#!/bin/sh
# Build the DMG for the release checked out on main. Skip a version that was already built.
set -e
cd "$(git rev-parse --show-toplevel)"
. ./scripts/resolve-node.sh

if [ -n "$GIT_DESKTOP_SKIP_RELEASE_BUILD" ]; then
  exit 0
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
  exit 0
fi

version=$(node -p "require('./src/release.json').version")
published=$(node -p "require('./src/release.json').publishedAt")
if [ -z "$published" ]; then
  exit 0
fi

marker=".git/last-release-build"
if [ -f "$marker" ] && [ "$(cat "$marker")" = "$version $published" ]; then
  exit 0
fi

echo "Building Git Desktop ${version} (${published})"
export APPLE_SIGNING_IDENTITY="-"
npm run tauri build
dmg=$(find src-tauri/target/release/bundle/dmg -name '*.dmg' -print -quit)
printf '%s\n' "$version $published" > "$marker"
echo "DMG ready: ${dmg}"
