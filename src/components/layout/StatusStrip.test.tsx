import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GitErrorView } from "../common/GitErrorView";
import { StatusStrip } from "./StatusStrip";
import type { RepoStatus } from "../../types/git";

const status: RepoStatus = {
  path: "/repos/ETWeb",
  name: "ETWeb",
  kind: "normal",
  bare: false,
  branch: "feature/231571",
  detached: false,
  unborn: false,
  upstream: "origin/feature/231571",
  ahead: 3,
  behind: 1,
  operation: "merge",
  files: [],
  stagedCount: 2,
  unstagedCount: 4,
  untrackedCount: 1,
  conflictCount: 1,
  ignoredCount: 0,
};

function renderWith(node: ReactNode) {
  return render(<MantineProvider>{node}</MantineProvider>);
}

describe("repository status and errors", () => {
  it("shows branch, upstream, ahead/behind, changes, and the in-progress operation", () => {
    renderWith(<StatusStrip status={status} busy="Fetching" last={{
      id: "1",
      timestamp: "2026-11-12T10:00:00Z",
      repository: status.path,
      operation: "Fetch",
      program: "git",
      args: ["fetch"],
      display: "git fetch",
      durationMs: 12,
      exitCode: 0,
      stdout: "",
      stderr: "",
      success: false,
    }} />);
    expect(screen.getByText("feature/231571")).toBeInTheDocument();
    expect(screen.getByText("upstream origin/feature/231571")).toBeInTheDocument();
    expect(screen.getByText("↑3")).toBeInTheDocument();
    expect(screen.getByText("↓1")).toBeInTheDocument();
    expect(screen.getByText("staged 2")).toBeInTheDocument();
    expect(screen.getByText("unstaged 4")).toBeInTheDocument();
    expect(screen.getByText("conflicts 1")).toBeInTheDocument();
    expect(screen.getByText("Fetching")).toBeInTheDocument();
    expect(screen.getByText("last Fetch failed")).toBeInTheDocument();
  });

  it("renders the Git command, exit code, and stderr", () => {
    renderWith(<GitErrorView error={{
      kind: "pushRejected",
      operation: "Push",
      repository: "/repos/ETWeb",
      command: "git",
      args: ["push", "origin", "main"],
      exitCode: 1,
      message: "Updates were rejected",
      stderr: "rejected",
      stdout: "",
    }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Push failed");
    expect(screen.getByText(/git push origin main/)).toBeInTheDocument();
    expect(screen.getByText(/exit 1/)).toBeInTheDocument();
    expect(screen.getByText("rejected")).toBeInTheDocument();
  });

  it("dismisses the error from its close button", async () => {
    const onClose = vi.fn();
    renderWith(<GitErrorView error={{
      kind: "pushRejected",
      operation: "Push",
      repository: "/repos/ETWeb",
      command: "git",
      args: ["push", "origin", "main"],
      exitCode: 1,
      message: "Updates were rejected",
      stderr: "rejected",
      stdout: "",
    }} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
