import { layoutGraph } from "./graph";

describe("commit graph", () => {
  it("places a merge on its first parent and links the second parent", () => {
    const rows = layoutGraph([
      { hash: "A", parents: ["B", "C"] },
      { hash: "B", parents: ["D"] },
      { hash: "C", parents: ["D"] },
      { hash: "D", parents: [] },
    ]);
    expect(rows[0]?.lane).toBe(0);
    expect(rows[0]?.links.map((link) => link.to).sort()).toEqual([0, 1]);
    expect(rows[1]?.lane).toBe(0);
    expect(rows[2]?.lane).toBe(1);
    expect(rows[3]?.lane).toBe(0);
  });
});
