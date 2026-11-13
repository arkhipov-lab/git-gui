import type { QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useUiStore } from "../../stores/uiStore";
import { normalizeError } from "../tauri/client";

export async function refreshRepository(queryClient: QueryClient, path: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["status", path] }),
    queryClient.invalidateQueries({ queryKey: ["branches", path] }),
    queryClient.invalidateQueries({ queryKey: ["log", path] }),
    queryClient.invalidateQueries({ queryKey: ["remotes", path] }),
    queryClient.invalidateQueries({ queryKey: ["stashes", path] }),
    queryClient.invalidateQueries({ queryKey: ["tags", path] }),
    queryClient.invalidateQueries({ queryKey: ["commit", path] }),
    queryClient.invalidateQueries({ queryKey: ["diff", path] }),
    queryClient.invalidateQueries({ queryKey: ["preview", path] }),
  ]);
}

export async function runMutation(
  queryClient: QueryClient,
  path: string,
  label: string,
  action: () => Promise<void>,
): Promise<boolean> {
  const ui = useUiStore.getState();
  ui.clearProgress(path);
  ui.setBusy(path, label);
  ui.setError(path, null);
  try {
    await action();
    await refreshRepository(queryClient, path);
    return true;
  } catch (error) {
    ui.setError(path, normalizeError(error, label));
    return false;
  } finally {
    useUiStore.getState().setBusy(path, null);
  }
}

export async function openPickedRepository(directory: string): Promise<import("../../types/git").RepoStatus> {
  return api.repositoryStatus(directory, false);
}
