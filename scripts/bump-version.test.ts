import { classifyCommit, highestBump, nextVersion } from "./bump-version.mjs";

describe("nextVersion", () => {
  it("increments the selected number and resets the ones after it", () => {
    expect(nextVersion("0.1.0", "patch")).toBe("0.1.1");
    expect(nextVersion("1.2.9", "patch")).toBe("1.2.10");
    expect(nextVersion("0.1.4", "minor")).toBe("0.2.0");
    expect(nextVersion("0.1.4", "major")).toBe("1.0.0");
    expect(nextVersion("0.1.4", "none")).toBeNull();
  });

  it("rejects a version that is not major.minor.patch", () => {
    expect(() => nextVersion("0.1", "patch")).toThrow(/0\.1\.0/);
  });
});

describe("classifyCommit", () => {
  it("maps the commit type to a bump", () => {
    expect(classifyCommit("feat: add about")).toEqual({ skip: false, bump: "minor" });
    expect(classifyCommit("feat(ui): add about")).toEqual({ skip: false, bump: "minor" });
    expect(classifyCommit("fix: correct the layout")).toEqual({ skip: false, bump: "patch" });
    expect(classifyCommit("perf: speed up status")).toEqual({ skip: false, bump: "patch" });
    expect(classifyCommit("docs: describe releases")).toEqual({ skip: false, bump: "none" });
    expect(classifyCommit("chore: tidy scripts")).toEqual({ skip: false, bump: "none" });
  });

  it("treats a breaking marker as major", () => {
    expect(classifyCommit("feat!: replace the toolbar")).toEqual({ skip: false, bump: "major" });
    expect(classifyCommit("fix: correct the layout\n\nBREAKING CHANGE: old tabs are gone")).toEqual({
      skip: false,
      bump: "major",
    });
  });

  it("ignores merge commits and rejects a missing type", () => {
    expect(classifyCommit("Merge pull request #1 from arkhipov-lab/feature")).toEqual({ skip: true });
    expect(() => classifyCommit("Initial commit")).toThrow(/feat, fix, docs, chore/);
  });
});

describe("highestBump", () => {
  it("keeps the largest bump in the release", () => {
    expect(highestBump(["docs: notes", "fix: layout", "chore: release v0.1.1"])).toBe("patch");
    expect(highestBump(["fix: layout", "feat: about"])).toBe("minor");
    expect(highestBump(["feat: about", "feat!: replace storage"])).toBe("major");
    expect(highestBump(["docs: notes", "Merge branch 'main'"])).toBe("none");
  });
});
