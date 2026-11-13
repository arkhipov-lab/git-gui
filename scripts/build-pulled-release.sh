#!/bin/sh
# After git pull of main, build the DMG when the release commit changed src/release.json.
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

if ! git rev-parse --verify -q ORIG_HEAD >/dev/null; then
  exit 0
fi

if ! git diff --name-only ORIG_HEAD HEAD | grep -qx 'src/release.json'; then
  exit 0
fi

version=$(node -p "require('./src/release.json').version")
published=$(node -p "require('./src/release.json').publishedAt")
echo "Building Git Desktop ${version} (${published})"
export APPLE_SIGNING_IDENTITY="-"
npm run tauri build
dmg=$(find src-tauri/target/release/bundle/dmg -name '*.dmg' -print -quit)
echo "DMG ready: ${dmg}"
