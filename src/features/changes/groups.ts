import type { FileEntry } from "../../types/git";

export interface ChangeGroups {
  conflicts: FileEntry[];
  staged: FileEntry[];
  unstaged: FileEntry[];
  untracked: FileEntry[];
  ignored: FileEntry[];
}

export function groupChanges(files: FileEntry[]): ChangeGroups {
  const groups: ChangeGroups = { conflicts: [], staged: [], unstaged: [], untracked: [], ignored: [] };
  for (const file of files) {
    if (file.unmerged) groups.conflicts.push(file);
    if (file.ignored) groups.ignored.push(file);
    if (file.untracked) groups.untracked.push(file);
    if (file.staged && !file.unmerged) groups.staged.push(file);
    if (file.unstaged && !file.unmerged && !file.untracked) groups.unstaged.push(file);
  }
  return groups;
}

export function statusLetter(file: FileEntry, side: "staged" | "unstaged" | "untracked" | "conflict"): string {
  if (side === "conflict") return "U";
  if (side === "untracked") return "?";
  if (side === "staged") return file.indexStatus === "." ? "M" : file.indexStatus;
  return file.worktreeStatus === "." ? "M" : file.worktreeStatus;
}

export function operationLabel(operation: string): string {
  switch (operation) {
    case "merge":
      return "Merge in progress";
    case "rebase":
      return "Rebase in progress";
    case "cherryPick":
      return "Cherry-pick in progress";
    case "revert":
      return "Revert in progress";
    case "bisect":
      return "Bisect in progress";
    default:
      return "None";
  }
}
