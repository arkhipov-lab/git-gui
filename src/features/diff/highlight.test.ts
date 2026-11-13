import { applyBranchTemplate, highlightLine } from "./highlight";

describe("diff highlighting and branch templates", () => {
  it("classifies keywords, strings, and comments", () => {
    expect(highlightLine('const name = "git"').map((token) => token.kind)).toContain("keyword");
    expect(highlightLine('const name = "git"').some((token) => token.kind === "string")).toBe(true);
    expect(highlightLine("// note")[0]?.kind).toBe("comment");
  });

  it("applies an optional branch template without removing manual control", () => {
    expect(applyBranchTemplate("feature/{ticket}-{description}", {
      type: "Feature",
      ticket: "231571",
      description: "scheduled deposits",
    })).toBe("feature/231571-scheduled-deposits");
  });
});
