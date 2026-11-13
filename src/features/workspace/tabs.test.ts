import { closeTab, cycleTab, moveTab, openTab, rememberRecent } from "./tabs";

describe("repository tabs", () => {
  it("opens a repository once and focuses the existing tab", () => {
    const first = openTab([], "/repos/ETWeb");
    const second = openTab(first.tabs, "/repos/FrontEnd");
    const again = openTab(second.tabs, "/repos/ETWeb");
    expect(again.tabs).toEqual(["/repos/ETWeb", "/repos/FrontEnd"]);
    expect(again.active).toBe("/repos/ETWeb");
  });

  it("closes the active tab and selects the neighbor", () => {
    const closed = closeTab(["/a", "/b", "/c"], "/b", "/b");
    expect(closed).toEqual({ tabs: ["/a", "/c"], active: "/c" });
    expect(closeTab(["/a"], "/a", "/a")).toEqual({ tabs: [], active: null });
  });

  it("keeps the active tab when another tab closes", () => {
    expect(closeTab(["/a", "/b"], "/b", "/a").active).toBe("/b");
  });

  it("reorders and cycles tabs", () => {
    expect(moveTab(["/a", "/b", "/c"], 2, 0)).toEqual(["/c", "/a", "/b"]);
    expect(cycleTab(["/a", "/b", "/c"], "/c", 1)).toBe("/a");
    expect(cycleTab(["/a", "/b", "/c"], "/a", -1)).toBe("/c");
  });

  it("remembers recent repositories without duplicates", () => {
    const recent = rememberRecent(
      [{ path: "/a", name: "a" }],
      { path: "/a", name: "A" },
    );
    expect(recent).toEqual([{ path: "/a", name: "A" }]);
  });
});
