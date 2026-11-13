import { invoke } from "@tauri-apps/api/core";
import type { GitError } from "../../types/git";

export function isGitError(value: unknown): value is GitError {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.message === "string" && typeof record.operation === "string" && typeof record.kind === "string";
}

export function normalizeError(error: unknown, operation = "Git"): GitError {
  if (isGitError(error)) return error;
  if (typeof error === "string") {
    try {
      const parsed: unknown = JSON.parse(error);
      if (isGitError(parsed)) return parsed;
    } catch {
      // The backend sometimes returns a plain string.
    }
    return fallback(operation, error);
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      try {
        const parsed: unknown = JSON.parse(message);
        if (isGitError(parsed)) return parsed;
      } catch {
        return fallback(operation, message);
      }
    }
  }
  return fallback(operation, "The operation failed.");
}

function fallback(operation: string, message: string): GitError {
  return {
    kind: "other",
    operation,
    command: "git",
    args: [],
    message,
    stderr: "",
    stdout: "",
  };
}

export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw normalizeError(error, command);
  }
}
