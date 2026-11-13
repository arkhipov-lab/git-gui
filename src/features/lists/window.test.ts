import { describe, expect, it } from "vitest";
import { windowLimit } from "./window";

describe("windowLimit", () => {
  it("fills one screen and grows by another screen", () => {
    expect(windowLimit(500, 20, 1)).toBe(20);
    expect(windowLimit(500, 20, 2)).toBe(40);
    expect(windowLimit(12, 20, 1)).toBe(12);
  });
});
