import { useWorkspaceStore } from "./workspaceStore";
import type { RepoStatus } from "../types/git";

function status(path: string): RepoStatus {
  return {
    path,
    name: path.split("/").pop() ?? path,
    kind: "normal",
    bare: false,
    branch: "main",
    detached: false,
    unborn: false,
    operation: "none",
    files: [],
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    conflictCount: 0,
    ignoredCount: 0,
  };
}

describe("workspace restoration and independent repository state", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ tabs: [], active: null, repoUi: {}, recent: [], ready: false });
  });

  it("restores tab order and the previously active tab", () => {
    useWorkspaceStore.getState().hydrate(["/repos/a", "/repos/b"], "/repos/b", {
      "/repos/b": { section: "history", selectedPaths: ["README.md"], selectedCommit: "abc", diffMode: "split", showIgnored: false },
    }, []);
    const state = useWorkspaceStore.getState();
    expect(state.tabs).toEqual(["/repos/a", "/repos/b"]);
    expect(state.active).toBe("/repos/b");
    expect(state.repoUi["/repos/b"]?.section).toBe("history");
  });

  it("keeps each repository's section when switching tabs", () => {
    const store = useWorkspaceStore.getState();
    store.openRepository(status("/repos/a"));
    store.openRepository(status("/repos/b"));
    store.setSection("/repos/a", "branches");
    store.setActive("/repos/b");
    store.setSection("/repos/b", "history");
    expect(useWorkspaceStore.getState().repoUi["/repos/a"]?.section).toBe("branches");
    expect(useWorkspaceStore.getState().repoUi["/repos/b"]?.section).toBe("history");
    expect(useWorkspaceStore.getState().active).toBe("/repos/b");
  });
});
