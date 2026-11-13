import { formatPublished } from "./releaseInfo";

describe("formatPublished", () => {
  it("formats a release instant in UTC", () => {
    expect(formatPublished("2026-11-13T11:58:00Z")).toBe("13 Nov 2026, 11:58 UTC");
  });

  it("leaves an unpublished build without a date", () => {
    expect(formatPublished("")).toBeNull();
  });
});
