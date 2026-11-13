# Sourced by Git hooks. A GUI client does not load the terminal PATH, so nvm's node is invisible.
if command -v node >/dev/null 2>&1; then
  return 0
fi

alias_file="$HOME/.nvm/alias/default"
if [ -f "$alias_file" ]; then
  ver=$(tr -d '[:space:]' < "$alias_file")
  ver=${ver#v}
  bin="$HOME/.nvm/versions/node/v${ver}/bin"
  if [ -x "$bin/node" ]; then
    export PATH="$bin:$PATH"
    return 0
  fi
fi

echo "node was not found. A GUI Git client does not load the terminal PATH." >&2
return 1 2>/dev/null || exit 1
