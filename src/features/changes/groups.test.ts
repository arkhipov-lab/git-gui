import { groupChanges } from "./groups";
import type { FileEntry } from "../../types/git";

function file(patch: Partial<FileEntry>): FileEntry {
  return {
    path: "src/app.ts",
    indexStatus: "M",
    worktreeStatus: "M",
    staged: true,
    unstaged: true,
    untracked: false,
    ignored: false,
    unmerged: false,
    submodule: "n",
    ...patch,
  };
}

describe("working tree groups", () => {
  it("shows the same file as both staged and unstaged", () => {
    const groups = groupChanges([file({})]);
    expect(groups.staged.map((entry) => entry.path)).toEqual(["src/app.ts"]);
    expect(groups.unstaged.map((entry) => entry.path)).toEqual(["src/app.ts"]);
  });

  it("keeps conflicts out of the staged and unstaged lists", () => {
    const groups = groupChanges([file({ unmerged: true, staged: true, unstaged: true, path: "conflict.txt" })]);
    expect(groups.conflicts).toHaveLength(1);
    expect(groups.staged).toHaveLength(0);
    expect(groups.unstaged).toHaveLength(0);
  });
});
