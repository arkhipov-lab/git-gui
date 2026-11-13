import { Button, Group, Modal, NativeSelect, PasswordInput, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { api } from "../../services/git/api";
import { normalizeError } from "../../services/tauri/client";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { BranchTemplate, IdentityRecord, SshKeyRecord, SshTestResult } from "../../types/git";
import styles from "../../styles/app.module.css";

export function SettingsView() {
  const queryClient = useQueryClient();
  const path = useWorkspaceStore((state) => state.active);
  const theme = useSettingsStore((state) => state.theme);
  const gitExecutable = useSettingsStore((state) => state.gitExecutable);
  const sshKeys = useSettingsStore((state) => state.sshKeys);
  const identities = useSettingsStore((state) => state.identities);
  const defaultBranch = useSettingsStore((state) => state.defaultBranch);
  const templates = useSettingsStore((state) => state.branchTemplates);
  const environment = useQuery({
    queryKey: ["environment", path ?? ""],
    queryFn: () => api.environmentInfo(path ?? undefined),
  });
  const info = environment.data;
  const [templateText, setTemplateText] = useState(serializeTemplates(templates));
  const templateDraft = useRef(templateText);
  templateDraft.current = templateText;
  useEffect(() => () => {
    const next = parseTemplates(templateDraft.current);
    const current = useSettingsStore.getState().branchTemplates;
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    useSettingsStore.getState().setTemplates(next);
  }, []);
  return (
    <div className={styles.scroll}>
      <Stack className={styles.settings} gap="sm">
        <Text fw={650}>Settings</Text>
        <NativeSelect label="Theme" value={theme} data={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} onChange={(event) => useSettingsStore.getState().setTheme(event.currentTarget.value === "light" ? "light" : "dark")} />
        <TextInput label="Git executable" description={info?.gitVersion ?? info?.gitError ?? "Detecting Git"} value={gitExecutable} placeholder={info?.gitPath ?? "git"} onChange={(event) => useSettingsStore.getState().setGitExecutable(event.currentTarget.value)} />
        <Group wrap="wrap">
          <Button variant="default" onClick={() => void detect()}>Detect Git</Button>
          <Button variant="default" onClick={() => void environment.refetch()}>Refresh diagnostics</Button>
        </Group>
        <Text size="sm">SSH: {info?.sshPath ?? "not found"} {info?.sshVersion ?? ""}</Text>
        <Text size="sm">SSH agent: {info?.sshAgentAvailable ? "available" : "not detected"}</Text>
        <Text size="sm">Identities: {info?.identities.length ? info.identities.join(", ") : "none reported by ssh-add"}</Text>
        <Text size="sm">Public keys: {info?.publicKeyFiles.length ? info.publicKeyFiles.join(", ") : "none found in ~/.ssh"}</Text>
        <Text size="xs" c="dimmed">SSH keys and name/email pairs are separate. A repository can use one key for GitHub and another for Azure, and still commit as the same person. A passphrase is stored in the Keychain for that key path only. It is not part of these settings, Git config, or SSH config. Remote commands run as GIT_SSH_COMMAND=&apos;ssh -i /path/to/key&apos; git …. The terminal keeps your normal SSH setup.</Text>
        <Text fw={650}>SSH keys</Text>
        <Text size="xs" c="dimmed">Opening Settings does not read the Keychain. Manage asks macOS for access to that key, then opens the editor.</Text>
        {sshKeys.map((key) => (
          <SshKeySummary key={key.id} record={key} />
        ))}
        <Button variant="default" onClick={addKey}>Add SSH key</Button>
        <Text fw={650}>Name and email</Text>
        <Text size="sm">Git config now: global {info?.globalUserName || "unset"} &lt;{info?.globalUserEmail || "unset"}&gt;, this repository {info?.localUserName || "inherits global"} &lt;{info?.localUserEmail || "inherits global"}&gt;.</Text>
        <Text size="xs" c="dimmed">These pairs are used by this app when a command writes a commit. Git default leaves user.name and user.email in Git config untouched.</Text>
        {identities.map((identity) => (
          <IdentityCard key={identity.id} record={identity} />
        ))}
        <Button variant="default" onClick={addIdentity}>Add name and email</Button>
        <TextInput label="Default initial branch" value={defaultBranch} onChange={(event) => useSettingsStore.getState().setDefaultBranch(event.currentTarget.value)} />
        <Textarea label="Branch templates" description="One template per line: Label | pattern. Tokens: {type} {ticket} {description}. Saved when you leave the field." minRows={5} value={templateText} onChange={(event) => setTemplateText(event.currentTarget.value)} onBlur={commitTemplates} />
      </Stack>
    </div>
  );

  async function detect() {
    const preferred = useSettingsStore.getState().gitExecutable.trim();
    const resolved = await api.detectGit(preferred || undefined);
    useSettingsStore.getState().setGitExecutable(resolved);
    await queryClient.invalidateQueries({ queryKey: ["environment"] });
  }

  function addKey() {
    const keys = useSettingsStore.getState().sshKeys;
    useSettingsStore.getState().setSshKeys([...keys, { id: crypto.randomUUID(), label: "", path: "" }]);
  }

  function addIdentity() {
    const list = useSettingsStore.getState().identities;
    useSettingsStore.getState().setIdentities([...list, { id: crypto.randomUUID(), label: "", name: "", email: "" }]);
  }

  function commitTemplates() {
    const next = parseTemplates(templateDraft.current);
    const current = useSettingsStore.getState().branchTemplates;
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    useSettingsStore.getState().setTemplates(next);
  }
}

function SshKeySummary({ record }: { record: SshKeyRecord }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState(false);
  const [checkedPath, setCheckedPath] = useState("");
  const title = record.label.trim() || "Untitled key";
  const keyPath = record.path.trim();
  return (
    <Stack gap={6} p="sm" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 8 }}>
      <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} truncate="end">{title}</Text>
          <Text size="xs" c="dimmed" className={styles.mono} truncate="end">{keyPath || "No key file chosen"}</Text>
        </div>
        <Button variant="default" loading={opening} onClick={() => void manage()} style={{ flexShrink: 0 }}>Manage</Button>
      </Group>
      {error ? <Text size="sm" c="red">{error}</Text> : null}
      {open ? (
        <SshKeyManager
          record={record}
          stored={stored}
          checkedPath={checkedPath}
          onStored={(path, value) => { setCheckedPath(path); setStored(value); }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </Stack>
  );

  async function manage() {
    setOpening(true);
    setError("");
    if (!keyPath.startsWith("/")) {
      setStored(false);
      setCheckedPath("");
      setOpen(true);
      setOpening(false);
      return;
    }
    try {
      const found = await api.sshPassphraseStored(keyPath);
      setStored(found);
      setCheckedPath(keyPath);
      setOpen(true);
    } catch (caught) {
      setError(normalizeError(caught, "SSH passphrase").message);
    } finally {
      setOpening(false);
    }
  }
}

function SshKeyManager({
  record,
  stored,
  checkedPath,
  onStored,
  onClose,
}: {
  record: SshKeyRecord;
  stored: boolean;
  checkedPath: string;
  onStored: (path: string, stored: boolean) => void;
  onClose: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState("");
  const [host, setHost] = useState("git@github.com");
  const [ssh, setSsh] = useState<SshTestResult | null>(null);
  const keyPath = record.path.trim();
  const samePath = keyPath === checkedPath && keyPath.startsWith("/");
  return (
    <Modal opened onClose={onClose} title={record.label.trim() || "SSH key"} size="lg">
      <Stack>
        <TextInput label="Label" value={record.label} placeholder="Work" onChange={(event) => update({ label: event.currentTarget.value })} />
        <Group align="end" wrap="wrap">
          <TextInput style={{ flex: "1 1 200px", minWidth: 0 }} label="Private key" description="Example: /Users/you/.ssh/id_rsa_etna" value={record.path} onChange={(event) => update({ path: event.currentTarget.value })} />
          <Button variant="default" onClick={() => void pick()}>Choose</Button>
        </Group>
        <PasswordInput
          label="Passphrase for this key"
          description="Saved in the login Keychain under this key path. Other keys stay untouched."
          value={passphrase}
          onChange={(event) => setPassphrase(event.currentTarget.value)}
        />
        <Text size="sm">
          {samePath
            ? (stored ? "A passphrase for this key is in the Keychain." : "No passphrase is stored for this key.")
            : "Save or remove a passphrase to check the Keychain for the path above."}
        </Text>
        {passphraseError ? <Text size="sm" c="red">{passphraseError}</Text> : null}
        <Group wrap="wrap">
          <Button variant="default" disabled={!keyPath.startsWith("/") || passphrase.length === 0} onClick={() => void savePassphrase()}>Save in Keychain</Button>
          <Button variant="default" disabled={!samePath || !stored} onClick={() => void clearPassphrase()}>Remove passphrase</Button>
        </Group>
        <Group align="end" wrap="wrap">
          <TextInput style={{ flex: "1 1 200px", minWidth: 0 }} label="SSH connection test host" value={host} onChange={(event) => setHost(event.currentTarget.value)} />
          <Button variant="default" disabled={!keyPath.startsWith("/")} onClick={() => void test()}>Test</Button>
        </Group>
        {ssh ? <pre className={styles.output}>{`${ssh.display}\nexit ${ssh.exitCode ?? "—"}\n${ssh.stdout}\n${ssh.stderr}`}</pre> : null}
        <Text size="xs" c="dimmed">Remove key drops this entry from the list. The passphrase stays in the Keychain until Remove passphrase.</Text>
        <Group justify="space-between">
          <Button variant="default" color="red" onClick={remove}>Remove key</Button>
          <Button variant="default" onClick={onClose}>Done</Button>
        </Group>
      </Stack>
    </Modal>
  );

  function update(patch: Partial<SshKeyRecord>) {
    const keys = useSettingsStore.getState().sshKeys.map((key) => key.id === record.id ? { ...key, ...patch } : key);
    useSettingsStore.getState().setSshKeys(keys);
  }

  async function pick() {
    const selected = await open({ directory: false, multiple: false, title: "SSH private key" });
    if (typeof selected === "string") update({ path: selected, label: record.label || selected.split("/").pop() || "" });
  }

  async function savePassphrase() {
    setPassphraseError("");
    try {
      await api.saveSshPassphrase(keyPath, passphrase);
      setPassphrase("");
      onStored(keyPath, true);
    } catch (caught) {
      setPassphraseError(normalizeError(caught, "SSH passphrase").message);
    }
  }

  async function clearPassphrase() {
    setPassphraseError("");
    try {
      await api.clearSshPassphrase(keyPath);
      setPassphrase("");
      onStored(keyPath, false);
    } catch (caught) {
      setPassphraseError(normalizeError(caught, "SSH passphrase").message);
    }
  }

  async function test() {
    setSsh(await api.sshTest(host.trim(), keyPath));
  }

  function remove() {
    const state = useSettingsStore.getState();
    state.setSshKeys(state.sshKeys.filter((key) => key.id !== record.id));
    for (const [repo, memory] of Object.entries(state.repoAuth)) {
      if (memory.sshKeyId === record.id) state.rememberAuth(repo, { sshKeyId: "" });
    }
    onClose();
  }
}

function IdentityCard({ record }: { record: IdentityRecord }) {
  return (
    <Stack gap={6} p="sm" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 8 }}>
      <TextInput label="Label" value={record.label} placeholder="Work" onChange={(event) => update({ label: event.currentTarget.value })} />
      <Group grow wrap="wrap">
        <TextInput label="user.name" value={record.name} onChange={(event) => update({ name: event.currentTarget.value })} style={{ flex: "1 1 180px" }} />
        <TextInput label="user.email" value={record.email} onChange={(event) => update({ email: event.currentTarget.value })} style={{ flex: "1 1 180px" }} />
      </Group>
      <Button variant="default" color="red" onClick={remove}>Remove</Button>
    </Stack>
  );

  function update(patch: Partial<IdentityRecord>) {
    const identities = useSettingsStore.getState().identities.map((identity) => identity.id === record.id ? { ...identity, ...patch } : identity);
    useSettingsStore.getState().setIdentities(identities);
  }

  function remove() {
    const state = useSettingsStore.getState();
    state.setIdentities(state.identities.filter((identity) => identity.id !== record.id));
    for (const [repo, memory] of Object.entries(state.repoAuth)) {
      if (memory.identityId === record.id) state.rememberAuth(repo, { identityId: "" });
    }
  }
}

function serializeTemplates(templates: BranchTemplate[]): string {
  return templates.map((template) => `${template.label} | ${template.pattern}`).join("\n");
}

function parseTemplates(text: string): BranchTemplate[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [label, pattern] = line.split("|").map((part) => part.trim());
    return {
      id: (label || `template-${index}`).toLowerCase().replace(/\s+/g, "-"),
      label: label || `Template ${index + 1}`,
      pattern: pattern || "{description}",
    };
  });
}
