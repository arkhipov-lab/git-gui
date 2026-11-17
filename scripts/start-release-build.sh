#!/bin/sh
# Leave Git's process and build in the background. Pull and checkout can finish immediately.
root=$(git rev-parse --show-toplevel)
log="$root/.git/release-build.log"
/usr/bin/python3 - "$root" "$log" <<'PY'
import os, sys
root, log = sys.argv[1], sys.argv[2]
if os.fork():
    raise SystemExit(0)
os.setsid()
fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
os.dup2(fd, 1)
os.dup2(fd, 2)
devnull = os.open(os.devnull, os.O_RDONLY)
os.dup2(devnull, 0)
os.execv("/bin/sh", ["/bin/sh", os.path.join(root, "scripts/build-pulled-release.sh")])
PY
