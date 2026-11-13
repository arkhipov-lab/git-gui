# Git execution

All repository commands are argument arrays executed in the repository working directory, or in the parent directory when `git init` or `git clone` creates that directory.

## Process record

Each run records:

- timestamp
- repository path
- program and arguments, with userinfo in URLs removed
- duration
- exit code
- capped stdout and stderr
- success or failure

Environment variables are not written to the log. Output is capped at 2_000_000 bytes. The operation log keeps the latest 400 records in memory and shows them in the bottom panel.

## Environment

The executor sets `GIT_TERMINAL_PROMPT=0` and `LC_MESSAGES=C`. Paths are passed with `-c core.quotepath=false` where parsing depends on literal names. Network commands add `GIT_SSH_COMMAND=ssh -o BatchMode=yes` only when the user has not already set `GIT_SSH_COMMAND`.

## Parsing

Human-readable prose is avoided when Git has a stable format.

| Operation | Command shape |
| --- | --- |
| Status | `git status --porcelain=v2 --branch -z` |
| Branches and tags | `git for-each-ref` with field separators and an end sentinel |
| History | `git log --all --topo-order --decorate=full` with unit-separator fields, 100 commits per page |
| Commit object | `git cat-file commit`, skipping `gpgsig` blocks |
| File stats | `git diff --numstat -z` and `git diff-tree --no-commit-id -r --numstat -z` |
| Patch | unified diff, parsed into hunks with the original hunk text retained |

NUL-delimited records are split on NUL, so names containing spaces, tabs, Unicode, or newlines stay intact. Rename records keep both paths. Unmerged `u` records keep the three stage OIDs.

Apple Git 2.39 does not support `for-each-ref -z`, so ref records use an explicit terminator instead.

Status refreshes call `rev-parse` only until the repository root and Git directory are known. `git status` rewrites `.git/index`. The filesystem watcher ignores that index write, and a matching `.git` directory event, for about 1.5 seconds after the command so the refresh does not immediately schedule another status. Edits in the work tree and updates to `HEAD` or refs still refresh the view.

## Validation

Before a repository command, the backend checks that the path exists and that `git rev-parse` accepts it. It then records the work-tree root, Git directory, repository kind (normal, bare, worktree, submodule), detached HEAD, an unborn branch, and an in-progress sequencer operation. Rebase directories are detected before `MERGE_HEAD`. A repository with no commits is a normal unborn state, not an error.

Revision and path arguments are rejected when they are empty, start with `-`, contain NUL or newlines, or, for paths, contain a `..` component. Discarding an untracked file deletes only a path joined under the work tree.

## Mutations

- Stage and unstage use `git add`, `git restore --staged`, and `git rm --cached`. Unstage-all on an unborn branch uses `git rm --cached`.
- Hunk staging rebuilds the working diff and applies the exact hunk text with `git apply --cached` or `--reverse --cached`. The hunk must match the current diff. Binary and truncated diffs are refused.
- Commit does not pass `-a`. Amend is a separate request. If `git branch -r --contains HEAD` prints anything, the commit dialog warns that the commit may already be published. Amend does not push.
- Discard of unstaged tracked content uses `git restore --worktree`. Unmerged paths are refused.
- Fetch uses `git fetch` or `git fetch --all`, with `--prune` only when the checkbox is selected. Fetch does not check out or merge.
- Pull requires `merge` (`--no-rebase`), `rebase` (`--rebase`), or `ff-only` (`--ff-only`).
- Push is `git push` with optional `-u`. There is no force-push command.

## Errors

Non-zero exits are classified from stderr and stdout into kinds such as authentication failure, push rejection, checkout conflict, merge or rebase conflict, lock file, missing Git, and invalid branch name. The UI shows the operation, repository, command, exit code, message, stderr, and stdout. A failed command does not trigger a recovery command.

## Cancellation

Long-running commands receive an operation id. Cancel sends `SIGTERM` to the process group and `SIGKILL` after about 1.2 seconds.
