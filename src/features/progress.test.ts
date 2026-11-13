import { describe, expect, it } from "vitest";
import { progressText, remoteActionId } from "./progress";

describe("remote progress labels", () => {
  it("keeps a short git progress line and shortens a long one", () => {
    expect(progressText("Fetch", "Receiving objects: 40%")).toBe("Receiving objects: 40%");
    expect(progressText("Push")).toBe("Push…");
    expect(progressText("Fetch", "x".repeat(60)).endsWith("…")).toBe(true);
    expect(progressText("Fetch", "x".repeat(60)).length).toBe(48);
  });

  it("maps remote operation labels onto command buttons", () => {
    expect(remoteActionId("Fetch origin")).toBe("fetch");
    expect(remoteActionId("Force pull")).toBe("pull");
    expect(remoteActionId("Push tag")).toBe("push");
    expect(remoteActionId("Commit")).toBeNull();
  });
});
