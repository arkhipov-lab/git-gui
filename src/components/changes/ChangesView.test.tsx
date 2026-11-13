import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangesView } from "./ChangesView";
import type { FileEntry, RepoStatus } from "../../types/git";

const both: FileEntry = {
  path: "src/lib.rs",
  indexStatus: "M",
  worktreeStatus: "M",
  staged: true,
  unstaged: true,
  untracked: false,
  ignored: false,
  unmerged: false,
  submodule: "n",
};

const status: RepoStatus = {
  path: "/repos/ETWeb",
  name: "ETWeb",
  kind: "normal",
  bare: false,
  branch: "main",
  detached: false,
  unborn: false,
  operation: "none",
  files: [both],
  stagedCount: 1,
  unstagedCount: 1,
  untrackedCount: 0,
  conflictCount: 0,
  ignoredCount: 0,
};

describe("changes view", () => {
  it("lists a file in both staged and unstaged groups and stages only the requested path", async () => {
    const user = userEvent.setup();
    const onStage = vi.fn();
    render(
      <MantineProvider>
        <ChangesView
          status={status}
          query=""
          onSelect={() => undefined}
          onClear={() => undefined}
          onStage={onStage}
          onUnstage={() => undefined}
          onDiscard={() => undefined}
          onOpen={() => undefined}
          onCopy={() => undefined}
        />
      </MantineProvider>,
    );
    expect(screen.getByText("Staged")).toBeInTheDocument();
    expect(screen.getByText("Unstaged")).toBeInTheDocument();
    expect(screen.getAllByText("src/lib.rs")).toHaveLength(2);
    const add = screen.getAllByRole("button").find((button) => button.textContent === "Add");
    expect(add).toBeTruthy();
    await user.click(add as HTMLElement);
    expect(onStage).toHaveBeenCalledWith(["src/lib.rs"]);
  });

  it("selects several unstaged files and keeps staged files out of that selection", async () => {
    const user = userEvent.setup();
    const onStage = vi.fn();
    const onSelect = vi.fn();
    const files = ["a.txt", "b.txt"].map((path) => ({ ...both, path, staged: false, indexStatus: " " }));
    render(
      <MantineProvider>
        <ChangesView
          status={{ ...status, files: [...files, both] }}
          query=""
          onSelect={onSelect}
          onClear={() => undefined}
          onStage={onStage}
          onUnstage={() => undefined}
          onDiscard={() => undefined}
          onOpen={() => undefined}
          onCopy={() => undefined}
        />
      </MantineProvider>,
    );
    await user.click(screen.getByText("a.txt"));
    fireEvent.click(screen.getByText("b.txt"), { metaKey: true });
    expect(screen.getByRole("button", { name: "Add selected" })).toBeInTheDocument();
    expect(screen.getAllByRole("button").some((button) => button.textContent === "Add")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Add selected" }));
    expect(onStage).toHaveBeenCalledWith(["a.txt", "b.txt"]);
    fireEvent.click(screen.getAllByText("src/lib.rs")[0], { metaKey: true });
    expect(screen.queryByRole("button", { name: "Add selected" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset selected" })).not.toBeInTheDocument();
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ path: "src/lib.rs" }), "staged");
  });
});
