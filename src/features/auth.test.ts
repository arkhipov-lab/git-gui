import { defaultChoice, shortcutChoice } from "./auth";

describe("repository credential choice", () => {
  it("keeps an explicit Git default", () => {
    expect(defaultChoice("", ["only"])).toBe("");
    expect(shortcutChoice("", ["only"])).toEqual({ id: "", remember: false });
  });

  it("uses the only saved key until the repository has a choice", () => {
    expect(defaultChoice(undefined, ["work"])).toBe("work");
    expect(shortcutChoice(undefined, ["work"])).toEqual({ id: "work", remember: true });
  });

  it("does not guess when several keys exist and nothing was chosen", () => {
    expect(defaultChoice(undefined, ["work", "personal"])).toBe("");
    expect(shortcutChoice(undefined, ["work", "personal"])).toEqual({ id: "", remember: false });
  });

  it("uses the choice stored for the repository", () => {
    expect(defaultChoice("personal", ["work", "personal"])).toBe("personal");
    expect(shortcutChoice("personal", ["work"])).toEqual({ id: "personal", remember: false });
  });
});
