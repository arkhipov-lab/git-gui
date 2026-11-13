import { useSettingsStore } from "../stores/settingsStore";
import type { IdentityRecord, SshKeyRecord } from "../types/git";

export function defaultChoice(saved: string | undefined, ids: string[]): string {
  if (saved !== undefined) return saved;
  return ids.length === 1 ? ids[0] : "";
}

export function shortcutChoice(saved: string | undefined, ids: string[]): { id: string; remember: boolean } {
  if (saved !== undefined) return { id: saved, remember: false };
  if (ids.length === 1) return { id: ids[0], remember: true };
  return { id: "", remember: false };
}

export function usableKeys(keys: SshKeyRecord[]): SshKeyRecord[] {
  return keys.filter((key) => key.path.trim().startsWith("/"));
}

export function usableIdentities(identities: IdentityRecord[]): IdentityRecord[] {
  return identities.filter((identity) => identity.name.trim().length > 0 && identity.email.trim().length > 0);
}

export function defaultSshId(repo: string | null): string {
  const state = useSettingsStore.getState();
  const saved = repo ? state.repoAuth[repo]?.sshKeyId : undefined;
  return defaultChoice(saved, usableKeys(state.sshKeys).map((key) => key.id));
}

export function defaultIdentityId(repo: string | null): string {
  const state = useSettingsStore.getState();
  const saved = repo ? state.repoAuth[repo]?.identityId : undefined;
  return defaultChoice(saved, usableIdentities(state.identities).map((identity) => identity.id));
}

export function sshPathFor(id: string): string | null {
  if (!id) return null;
  const key = usableKeys(useSettingsStore.getState().sshKeys).find((item) => item.id === id);
  return key?.path.trim() ?? null;
}

export function identityFor(id: string): { name: string; email: string } | null {
  if (!id) return null;
  const identity = usableIdentities(useSettingsStore.getState().identities).find((item) => item.id === id);
  if (!identity) return null;
  return { name: identity.name.trim(), email: identity.email.trim() };
}

export function rememberSsh(repo: string, id: string) {
  useSettingsStore.getState().rememberAuth(repo, { sshKeyId: id });
}

export function rememberIdentity(repo: string, id: string) {
  useSettingsStore.getState().rememberAuth(repo, { identityId: id });
}

export function shortcutSsh(repo: string): { path: string | null; rememberId: string | null } {
  const state = useSettingsStore.getState();
  const keys = usableKeys(state.sshKeys);
  const choice = shortcutChoice(state.repoAuth[repo]?.sshKeyId, keys.map((key) => key.id));
  return {
    path: choice.id ? (keys.find((key) => key.id === choice.id)?.path.trim() ?? null) : null,
    rememberId: choice.remember ? choice.id : null,
  };
}
