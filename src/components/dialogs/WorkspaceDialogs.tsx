import { Button, Checkbox, Group, Modal, NativeSelect, Radio, Stack, Text, TextInput, Textarea } from "@mantine/core";
import type { Dispatch, SetStateAction } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { applyBranchTemplate } from "../../features/diff/highlight";
import { api } from "../../services/git/api";
import { runMutation } from "../../services/git/actions";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore, type DialogRequest, type HistoryCommit } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { listen } from "@tauri-apps/api/event";
import type { CommitSummary, ProgressEvent } from "../../types/git";
import { GitErrorView } from "../common/GitErrorView";
import { BusyButton } from "../common/BusyButton";
import { BranchPicker } from "../common/BranchPicker";
import { IdentitySelect, SshSelect } from "../common/AuthFields";
import { defaultIdentityId, defaultSshId, identityFor, rememberIdentity, rememberSsh, sshPathFor } from "../../features/auth";
import { appName, appVersion, formatPublished, publishedAt } from "../../releaseInfo";
import { CommitDetails } from "../commits/CommitDetails";
import { HistoryView } from "../commits/HistoryView";
import { DiffViewer } from "../diff/DiffViewer";
import styles from "../../styles/app.module.css";

export function WorkspaceDialogs() {
  const dialog = useUiStore((state) => state.dialog);
  const close = () => useUiStore.getState().setDialog(null);
  const path = useWorkspaceStore((state) => state.active);
  return (
    <>
      <CloneDialog opened={dialog?.type === "clone"} onClose={close} />
      <InitDialog opened={dialog?.type === "init"} onClose={close} />
      {path && dialog?.type === "commit" ? <CommitDialog path={path} onClose={close} /> : null}
      {path && dialog?.type === "branch" ? <BranchDialog path={path} source={dialog.source} onClose={close} /> : null}
      {path && dialog?.type === "fetch" ? <FetchDialog path={path} onClose={close} /> : null}
      {path && dialog?.type === "pull" ? <PullDialog path={path} remote={dialog.remote} branch={dialog.branch} localBranch={dialog.localBranch} checkedOut={dialog.checkedOut} onClose={close} /> : null}
      {path && dialog?.type === "push" ? <PushDialog path={path} branch={dialog.branch} setUpstream={dialog.setUpstream} onClose={close} /> : null}
      {path && dialog?.type === "stash" ? <StashDialog path={path} onClose={close} /> : null}
      {path && dialog?.type === "tag" ? <TagDialog path={path} target={dialog.target} onClose={close} /> : null}
      {path && dialog?.type === "add-remote" ? <RemoteDialog path={path} onClose={close} /> : null}
      {path && dialog?.type === "rename-branch" ? <RenameDialog path={path} name={dialog.name} onClose={close} /> : null}
      {path && dialog?.type === "set-upstream" ? <UpstreamDialog path={path} branch={dialog.branch} onClose={close} /> : null}
      {path && dialog?.type === "delete-branch" ? <DeleteBranchDialog path={path} name={dialog.name} onClose={close} /> : null}
      {path && dialog?.type === "push-tag" ? <PushTagDialog path={path} name={dialog.name} onClose={close} /> : null}
      {path && dialog?.type === "soft-reset" ? <SoftResetDialog path={path} commits={dialog.commits} onClose={close} /> : null}
      {path && dialog?.type === "revert" ? <RevertDialog path={path} commits={dialog.commits} onClose={close} /> : null}
      {path && dialog?.type === "cherry-pick" ? <CherryPickDialog path={path} commits={dialog.commits} onClose={close} /> : null}
      {path && dialog?.type === "cherry-pick-into" ? <CherryPickIntoDialog path={path} onClose={close} /> : null}
      {path && dialog?.type === "sequence" ? <SequenceDialog path={path} action={dialog.action} onClose={close} /> : null}
      {dialog?.type === "about" ? <AboutDialog onClose={close} /> : null}
      {dialog?.type === "confirm" ? <ConfirmDialog dialog={dialog} onClose={close} /> : null}
    </>
  );
}

function CloneDialog({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [parent, setParent] = useState("");
  const [directoryName, setDirectoryName] = useState("");
  const [sshId, setSshId] = useState(() => defaultSshId(null));
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<import("../../types/git").GitError | null>(null);
  useEffect(() => {
    if (!opened) return;
    const unlisten = listen<ProgressEvent>("git-progress", (event) => {
      if (event.payload.operation === "Clone") setOutput((current) => `${current}${event.payload.line}\n`);
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [opened]);
  return (
    <Modal opened={opened} onClose={onClose} title="Clone repository" size="lg">
      <Stack>
        <TextInput label="Remote URL" value={url} onChange={(event) => setUrl(event.currentTarget.value)} placeholder="git@github.com:org/repo.git" />
        <Group align="end">
          <TextInput style={{ flex: 1 }} label="Destination directory" value={parent} onChange={(event) => setParent(event.currentTarget.value)} />
          <Button variant="default" onClick={() => void pickDirectory(setParent)}>Choose</Button>
        </Group>
        <TextInput label="Directory name (optional)" description="Leave empty and Git uses the repository name from the URL." placeholder="From the URL" value={directoryName} onChange={(event) => setDirectoryName(event.currentTarget.value)} />
        <SshSelect value={sshId} onChange={setSshId} />
        {output ? <pre className={styles.output}>{output}</pre> : null}
        {error ? <GitErrorView error={error} /> : null}
        <BusyButton busy={running} label="Clone" progress={lastLine(output)} onClick={() => void cloneNow()} />
      </Stack>
    </Modal>
  );

  async function cloneNow() {
    setRunning(true);
    setError(null);
    setOutput("");
    try {
      const status = await api.cloneRepository(url.trim(), parent.trim(), directoryName.trim() || null, sshPathFor(sshId), crypto.randomUUID());
      rememberSsh(status.path, sshId);
      useWorkspaceStore.getState().openRepository(status);
      await queryClient.invalidateQueries({ queryKey: ["status", status.path] });
      onClose();
    } catch (caught) {
      setError(caught as import("../../types/git").GitError);
    } finally {
      setRunning(false);
    }
  }
}

function InitDialog({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const defaultBranch = useSettingsStore((state) => state.defaultBranch);
  const [parent, setParent] = useState("");
  const [branch, setBranch] = useState(defaultBranch);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<import("../../types/git").GitError | null>(null);
  useEffect(() => {
    if (opened) setBranch(useSettingsStore.getState().defaultBranch);
  }, [opened]);
  return (
    <Modal opened={opened} onClose={onClose} title="Initialize repository">
      <Stack>
        <Group align="end">
          <TextInput style={{ flex: 1 }} label="Folder" value={parent} onChange={(event) => setParent(event.currentTarget.value)} />
          <Button variant="default" onClick={() => void pickDirectory(setParent)}>Choose</Button>
        </Group>
        <TextInput label="Initial branch" value={branch} onChange={(event) => setBranch(event.currentTarget.value)} />
        {error ? <GitErrorView error={error} /> : null}
        <Button loading={running} onClick={() => void initNow()}>Initialize</Button>
      </Stack>
    </Modal>
  );

  async function initNow() {
    setRunning(true);
    setError(null);
    try {
      const status = await api.initRepository(parent.trim(), branch.trim());
      useWorkspaceStore.getState().openRepository(status);
      onClose();
    } catch (caught) {
      setError(caught as import("../../types/git").GitError);
    } finally {
      setRunning(false);
    }
  }
}

function CommitDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const preview = useQuery({ queryKey: ["preview", path], queryFn: () => api.commitPreview(path) });
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [amend, setAmend] = useState(false);
  const [identityId, setIdentityId] = useState(() => defaultIdentityId(path));
  const data = preview.data;
  return (
    <Modal opened onClose={onClose} title={amend ? "Amend commit" : "Commit staged changes"} size="lg">
      <Stack>
        <Text size="sm">
          {data?.detached ? "Detached HEAD" : data?.branch ?? "No branch"} · {data?.fileCount ?? 0} files · +{data?.insertions ?? 0} -{data?.deletions ?? 0}
        </Text>
        {data && !data.hasStagedChanges && !amend ? <Text size="sm" c="orange">Nothing is staged. Unstaged files stay out of this commit.</Text> : null}
        {amend && data?.headPublished ? <Text size="sm" c="orange">This commit appears on a remote-tracking branch. Amending will not force-push.</Text> : null}
        <Textarea label="Message" minRows={2} value={subject} onChange={(event) => setSubject(event.currentTarget.value)} />
        <Textarea label="Description" minRows={3} value={body} onChange={(event) => setBody(event.currentTarget.value)} />
        <IdentitySelect value={identityId} onChange={setIdentityId} />
        <Checkbox label="Amend the latest commit" checked={amend} onChange={(event) => setAmend(event.currentTarget.checked)} />
        <div className={styles.scroll} style={{ maxHeight: 160 }}>
          {data?.files.map((file) => <Text key={file.path} size="xs" className={styles.mono}>{file.path}</Text>)}
        </div>
        <Button disabled={!subject.trim() || (!amend && !data?.hasStagedChanges)} onClick={() => void commitNow()}>
          {amend ? "Amend" : "Commit"}
        </Button>
      </Stack>
    </Modal>
  );

  async function commitNow() {
    rememberIdentity(path, identityId);
    if (await runMutation(queryClient, path, amend ? "Amend" : "Commit", () => api.commit(path, subject.trim(), body, amend, identityFor(identityId)))) onClose();
  }
}

function BranchDialog({ path, source, onClose }: { path: string; source?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const templates = useSettingsStore((state) => state.branchTemplates);
  const defaultBranch = useSettingsStore((state) => state.defaultBranch);
  const branches = useQuery({ queryKey: ["branches", path, defaultBranch], queryFn: () => api.listBranches(path, defaultBranch) });
  const tags = useQuery({ queryKey: ["tags", path], queryFn: () => api.listTags(path) });
  const [name, setName] = useState("");
  const [start, setStart] = useState(source ?? "HEAD");
  const [checkout, setCheckout] = useState(true);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [ticket, setTicket] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listed = branches.data ?? [];
  const options = [
    "HEAD",
    ...listed.filter((branch) => !branch.remote).map((branch) => branch.name),
    ...listed.filter((branch) => branch.remote).map((branch) => branch.name),
    ...(tags.data ?? []).map((tag) => tag.name),
  ];
  return (
    <Modal opened onClose={onClose} title="Create branch" size="lg">
      <Stack>
        <TextInput label="Branch name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <Group grow>
          <NativeSelect label="Template" value={templateId} onChange={(event) => setTemplateId(event.currentTarget.value)} data={templates.map((template) => ({ value: template.id, label: template.label }))} />
          <TextInput label="Ticket" value={ticket} onChange={(event) => setTicket(event.currentTarget.value)} />
          <TextInput label="Description" value={description} onChange={(event) => setDescription(event.currentTarget.value)} />
        </Group>
        <Button variant="default" onClick={generate}>Generate name</Button>
        <BranchPicker label="Source" value={start} options={options.map((option) => ({ value: option, label: option }))} onChange={setStart} />
        <Text size="xs" c="dimmed">You can also type a commit hash into the source after generating, or replace the name manually.</Text>
        <TextInput label="Or commit" placeholder="Optional full or short hash" onChange={(event) => { if (event.currentTarget.value.trim()) setStart(event.currentTarget.value.trim()); }} />
        <Checkbox label="Checkout after creation" checked={checkout} onChange={(event) => setCheckout(event.currentTarget.checked)} />
        {error ? <Text c="red" size="sm">{error}</Text> : null}
        <Button onClick={() => void create()}>Create branch</Button>
      </Stack>
    </Modal>
  );

  function generate() {
    const template = templates.find((item) => item.id === templateId) ?? templates[0];
    if (!template) return;
    setName(applyBranchTemplate(template.pattern, { type: template.label, ticket, description }));
  }

  async function create() {
    setError(null);
    try {
      await api.validateBranchName(path, name.trim());
      const created = await runMutation(queryClient, path, "Create branch", () => api.createBranch(path, name.trim(), start.trim() || "HEAD", checkout));
      if (!created) {
        setError(useUiStore.getState().errors[path]?.message ?? "Could not create the branch.");
        return;
      }
      onClose();
    } catch (caught) {
      const git = caught as { message?: string };
      setError(git.message ?? "Could not create the branch.");
    }
  }
}

function FetchDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const remotes = useQuery({ queryKey: ["remotes", path], queryFn: () => api.listRemotes(path) });
  const [remote, setRemote] = useState("");
  const [sshId, setSshId] = useState(() => defaultSshId(path));
  const [scope, setScope] = useState<"branches" | "tags" | "tags-force">("branches");
  const [prune, setPrune] = useState(false);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  useProgress(true, setOutput);
  const command = fetchCommand(remote, prune, scope);
  return (
    <Modal opened onClose={onClose} title="Fetch">
      <Stack>
        <Text size="sm">Choose what to download. The current branch and working tree stay unchanged.</Text>
        <Radio.Group label="Download" value={scope} onChange={(value) => setScope(value as "branches" | "tags" | "tags-force")}>
          <Stack gap={6}>
            <Radio value="branches" label="Remote-tracking branches" />
            <Radio value="tags" label="All tags" />
            <Radio value="tags-force" label="All tags, overwrite local tags that moved" />
          </Stack>
        </Radio.Group>
        <NativeSelect label="Remote" value={remote} onChange={(event) => setRemote(event.currentTarget.value)} data={[{ value: "", label: "Default remote" }, { value: "*", label: "All remotes" }, ...(remotes.data ?? []).map((item) => ({ value: item.name, label: item.name }))]} />
        <SshSelect value={sshId} onChange={setSshId} />
        <Checkbox label="Prune stale remote-tracking branches" checked={prune} onChange={(event) => setPrune(event.currentTarget.checked)} />
        {scope === "tags-force" ? <Text size="sm" c="red">Local tags that point at a different commit are moved to the remote tag. The command is {command}.</Text> : <Text size="sm" className={styles.mono}>{command}</Text>}
        {output ? <pre className={styles.output}>{output}</pre> : null}
        <BusyButton color={scope === "tags-force" ? "red" : undefined} busy={running} label="Fetch" progress={lastLine(output)} onClick={() => void run()} />
      </Stack>
    </Modal>
  );

  async function run() {
    setRunning(true);
    setOutput("");
    try {
      rememberSsh(path, sshId);
      if (await runMutation(queryClient, path, "Fetch", () => api.fetchRemote(path, remote || null, prune, scope, sshPathFor(sshId), crypto.randomUUID()))) onClose();
    } finally {
      setRunning(false);
    }
  }
}

function fetchCommand(remote: string, prune: boolean, scope: "branches" | "tags" | "tags-force"): string {
  const args = ["git fetch --progress"];
  if (prune) args.push("--prune");
  if (scope !== "branches") args.push("--tags");
  if (scope === "tags-force") args.push("--force");
  if (remote === "*") args.push("--all");
  else if (remote) args.push(remote);
  return args.join(" ");
}

function PullDialog({
  path,
  remote: presetRemote,
  branch: presetBranch,
  localBranch,
  checkedOut = true,
  onClose,
}: {
  path: string;
  remote?: string;
  branch?: string;
  localBranch?: string;
  checkedOut?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["status", path, false], queryFn: () => api.repositoryStatus(path, false) });
  const remotes = useQuery({ queryKey: ["remotes", path], queryFn: () => api.listRemotes(path) });
  const upstreamRemote = presetRemote ?? status.data?.upstream?.split("/")[0] ?? remotes.data?.[0]?.name ?? "origin";
  const upstreamBranch = presetBranch ?? (status.data?.upstream?.split("/").slice(1).join("/") || status.data?.branch || "");
  const [remote, setRemote] = useState(upstreamRemote);
  const [branch, setBranch] = useState(upstreamBranch);
  const [strategy, setStrategy] = useState(checkedOut ? "merge" : "ff-only");
  const [force, setForce] = useState(false);
  const [sshId, setSshId] = useState(() => defaultSshId(path));
  const [identityId, setIdentityId] = useState(() => defaultIdentityId(path));
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  useProgress(true, setOutput);
  const localName = localBranch || branch || "branch";
  const writesIdentity = checkedOut && !force && strategy !== "ff-only";
  return (
    <Modal opened onClose={onClose} title="Pull">
      <Stack>
        <Text size="sm">
          {checkedOut
            ? `Upstream: ${status.data?.upstream ?? "none"}. Merge is selected because that is what git pull does when no strategy is given.`
            : "This branch is not checked out. A normal pull fast-forwards it and does not switch to it."}
        </Text>
        <TextInput label="Remote" value={remote} onChange={(event) => setRemote(event.currentTarget.value)} />
        <TextInput label="Branch" value={branch} onChange={(event) => setBranch(event.currentTarget.value)} />
        <SshSelect value={sshId} onChange={setSshId} />
        {writesIdentity ? <IdentitySelect value={identityId} onChange={setIdentityId} committerOnly={strategy === "rebase"} /> : null}
        {checkedOut && !force ? (
          <Radio.Group label="Strategy" value={strategy} onChange={setStrategy}>
            <Group>
              <Radio value="merge" label="Merge" />
              <Radio value="rebase" label="Rebase" />
              <Radio value="ff-only" label="Fast-forward only" />
            </Group>
          </Radio.Group>
        ) : null}
        {!checkedOut && !force ? (
          <Text size="sm">git fetch {remote || "origin"} refs/heads/{branch || "branch"}:refs/heads/{localName}</Text>
        ) : null}
        <Checkbox label="Force pull" checked={force} onChange={(event) => setForce(event.currentTarget.checked)} />
        {force ? (
          <Text size="sm" c="red">
            {checkedOut
              ? `This replaces the checked-out branch with ${remote || "origin"}/${branch || "branch"}. Local commits that are not on the remote are dropped, and uncommitted changes in tracked files are discarded. The commands are git fetch ${remote || "origin"} ${branch || "branch"} and git reset --hard ${remote || "origin"}/${branch || "branch"}.`
              : `This moves ${localName} to ${remote || "origin"}/${branch || "branch"} even when that is not a fast-forward. The branch is not checked out. The command is git fetch ${remote || "origin"} +refs/heads/${branch || "branch"}:refs/heads/${localName}.`}
          </Text>
        ) : null}
        {output ? <pre className={styles.output}>{output}</pre> : null}
        <BusyButton color={force ? "red" : undefined} disabled={!remote.trim() || !branch.trim()} busy={running} label={force ? "Force pull" : "Pull"} progress={lastLine(output)} onClick={() => void run()} />
      </Stack>
    </Modal>
  );

  async function run() {
    setRunning(true);
    setOutput("");
    try {
      rememberSsh(path, sshId);
      if (writesIdentity) rememberIdentity(path, identityId);
      if (await runMutation(queryClient, path, force ? "Force pull" : "Pull", () => api.pull(path, remote.trim(), branch.trim(), strategy, crypto.randomUUID(), checkedOut, localBranch ?? branch.trim(), force, sshPathFor(sshId), writesIdentity ? identityFor(identityId) : null))) onClose();
    } finally {
      setRunning(false);
    }
  }
}

function PushDialog({
  path,
  branch,
  setUpstream,
  onClose,
}: {
  path: string;
  branch?: string;
  setUpstream?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["status", path, false], queryFn: () => api.repositoryStatus(path, false) });
  const remotes = useQuery({ queryKey: ["remotes", path], queryFn: () => api.listRemotes(path) });
  const defaultBranch = useSettingsStore((state) => state.defaultBranch);
  const branches = useQuery({ queryKey: ["branches", path, defaultBranch], queryFn: () => api.listBranches(path, defaultBranch) });
  const [remote, setRemote] = useState(remotes.data?.[0]?.name ?? "origin");
  const [target, setTarget] = useState(branch ?? status.data?.branch ?? "");
  const protectedBranch = (branches.data ?? []).some((item) => item.pushProtected && !item.remote && item.name === target);
  const [upstream, setUpstreamFlag] = useState(Boolean(setUpstream) || !status.data?.upstream);
  const [force, setForce] = useState(false);
  const [sshId, setSshId] = useState(() => defaultSshId(path));
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  useProgress(true, setOutput);
  return (
    <Modal opened onClose={onClose} title="Push">
      <Stack>
        {protectedBranch ? <Text size="sm" c="orange">This is the default branch and is marked push-protected. The host may reject the push.</Text> : null}
        <TextInput label="Remote" value={remote} onChange={(event) => setRemote(event.currentTarget.value)} />
        <TextInput label="Branch" value={target} onChange={(event) => setTarget(event.currentTarget.value)} />
        <SshSelect value={sshId} onChange={setSshId} />
        <Checkbox label="Set upstream" checked={upstream} onChange={(event) => setUpstreamFlag(event.currentTarget.checked)} />
        <Checkbox label="Force push" checked={force} onChange={(event) => setForce(event.currentTarget.checked)} />
        {force ? (
          <Text size="sm" c="red">
            Force push rewrites {remote || "origin"}/{target || "branch"}. Commits that are on the remote and not in this branch are removed for everyone who fetches afterwards. The command is git push --force {remote || "origin"} {target || "branch"}.
          </Text>
        ) : null}
        {output ? <pre className={styles.output}>{output}</pre> : null}
        <BusyButton color={force ? "red" : undefined} disabled={!remote.trim() || !target.trim()} busy={running} label={force ? "Force push" : "Push"} progress={lastLine(output)} onClick={() => void run()} />
      </Stack>
    </Modal>
  );

  async function run() {
    setRunning(true);
    setOutput("");
    try {
      rememberSsh(path, sshId);
      if (await runMutation(queryClient, path, force ? "Force push" : "Push", () => api.push(path, remote.trim(), target.trim(), upstream, crypto.randomUUID(), force, sshPathFor(sshId)))) onClose();
    } finally {
      setRunning(false);
    }
  }
}

function StashDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [untracked, setUntracked] = useState(false);
  const [identityId, setIdentityId] = useState(() => defaultIdentityId(path));
  return (
    <Modal opened onClose={onClose} title="Stash changes">
      <Stack>
        <TextInput label="Message" value={message} onChange={(event) => setMessage(event.currentTarget.value)} />
        <Checkbox label="Include untracked files" checked={untracked} onChange={(event) => setUntracked(event.currentTarget.checked)} />
        <IdentitySelect value={identityId} onChange={setIdentityId} />
        <Button onClick={() => void run()}>Create stash</Button>
      </Stack>
    </Modal>
  );

  async function run() {
    rememberIdentity(path, identityId);
    if (await runMutation(queryClient, path, "Stash", () => api.createStash(path, message.trim(), untracked, identityFor(identityId)))) onClose();
  }
}

function TagDialog({ path, target, onClose }: { path: string; target?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [commit, setCommit] = useState(target ?? "HEAD");
  const [annotated, setAnnotated] = useState(true);
  const [message, setMessage] = useState("");
  const [identityId, setIdentityId] = useState(() => defaultIdentityId(path));
  return (
    <Modal opened onClose={onClose} title="Create tag">
      <Stack>
        <TextInput label="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <TextInput label="Target" value={commit} onChange={(event) => setCommit(event.currentTarget.value)} />
        <Checkbox label="Annotated tag" checked={annotated} onChange={(event) => setAnnotated(event.currentTarget.checked)} />
        {annotated ? <Textarea label="Message" value={message} onChange={(event) => setMessage(event.currentTarget.value)} /> : null}
        {annotated ? <IdentitySelect value={identityId} onChange={setIdentityId} /> : null}
        <Button disabled={!name.trim() || (annotated && !message.trim())} onClick={() => void run()}>Create tag</Button>
      </Stack>
    </Modal>
  );

  async function run() {
    if (annotated) rememberIdentity(path, identityId);
    if (await runMutation(queryClient, path, "Create tag", () => api.createTag(path, name.trim(), commit.trim() || "HEAD", annotated, message, annotated ? identityFor(identityId) : null))) onClose();
  }
}

function RemoteDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("origin");
  const [url, setUrl] = useState("");
  return (
    <Modal opened onClose={onClose} title="Add remote">
      <Stack>
        <TextInput label="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <TextInput label="URL" value={url} onChange={(event) => setUrl(event.currentTarget.value)} />
        <Button onClick={() => void run()}>Add remote</Button>
      </Stack>
    </Modal>
  );

  async function run() {
    if (await runMutation(queryClient, path, "Add remote", () => api.addRemote(path, name.trim(), url.trim()))) onClose();
  }
}

function RenameDialog({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [next, setNext] = useState(name);
  return (
    <Modal opened onClose={onClose} title="Rename branch">
      <Stack>
        <TextInput label="New name" value={next} onChange={(event) => setNext(event.currentTarget.value)} />
        <Button onClick={() => void run()}>Rename</Button>
      </Stack>
    </Modal>
  );

  async function run() {
    try {
      await api.validateBranchName(path, next.trim());
    } catch (error) {
      useUiStore.getState().setError(path, error as import("../../types/git").GitError);
      return;
    }
    if (await runMutation(queryClient, path, "Rename branch", () => api.renameBranch(path, name, next.trim()))) onClose();
  }
}

function UpstreamDialog({ path, branch, onClose }: { path: string; branch: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const defaultBranch = useSettingsStore((state) => state.defaultBranch);
  const branches = useQuery({ queryKey: ["branches", path, defaultBranch], queryFn: () => api.listBranches(path, defaultBranch) });
  const [upstream, setUpstream] = useState("");
  return (
    <Modal opened onClose={onClose} title={`Set upstream for ${branch}`}>
      <Stack>
        <BranchPicker
          label="Upstream"
          value={upstream}
          options={(branches.data ?? []).filter((item) => item.remote).map((item) => ({ value: item.name, label: item.name }))}
          onChange={setUpstream}
        />
        <Button disabled={!upstream} onClick={() => void run()}>Set upstream</Button>
      </Stack>
    </Modal>
  );

  async function run() {
    if (await runMutation(queryClient, path, "Set upstream", () => api.setUpstream(path, branch, upstream))) onClose();
  }
}

function DeleteBranchDialog({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [force, setForce] = useState(false);
  return (
    <Modal opened onClose={onClose} title={`Delete ${name}`}>
      <Stack>
        <Text size="sm">Delete the local branch {name}. Git refuses a non-forced delete when the branch is not merged.</Text>
        <Checkbox label="Force delete, including unmerged commits" checked={force} onChange={(event) => setForce(event.currentTarget.checked)} />
        <Button color="red" onClick={() => void run()}>Delete branch</Button>
      </Stack>
    </Modal>
  );

  async function run() {
    if (await runMutation(queryClient, path, "Delete branch", () => api.deleteBranch(path, name, force))) onClose();
  }
}

function PushTagDialog({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const remotes = useQuery({ queryKey: ["remotes", path], queryFn: () => api.listRemotes(path) });
  const [remote, setRemote] = useState(remotes.data?.[0]?.name ?? "origin");
  const [sshId, setSshId] = useState(() => defaultSshId(path));
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  useProgress(true, setOutput);
  return (
    <Modal opened onClose={onClose} title={`Push tag ${name}`}>
      <Stack>
        <TextInput label="Remote" value={remote} onChange={(event) => setRemote(event.currentTarget.value)} />
        <SshSelect value={sshId} onChange={setSshId} />
        {output ? <pre className={styles.output}>{output}</pre> : null}
        <BusyButton busy={running} label="Push tag" progress={lastLine(output)} disabled={!remote.trim()} onClick={() => void run()} />
      </Stack>
    </Modal>
  );

  async function run() {
    setRunning(true);
    setOutput("");
    try {
      rememberSsh(path, sshId);
      if (await runMutation(queryClient, path, "Push tag", () => api.pushTag(path, remote.trim(), name, sshPathFor(sshId), crypto.randomUUID()))) onClose();
    } finally {
      setRunning(false);
    }
  }
}

function SequenceDialog({ path, action, onClose }: { path: string; action: "continue" | "skip"; onClose: () => void }) {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["status", path, false], queryFn: () => api.repositoryStatus(path, false) });
  const [identityId, setIdentityId] = useState(() => defaultIdentityId(path));
  const [running, setRunning] = useState(false);
  const skip = action === "skip";
  const committerOnly = status.data?.operation === "cherryPick" || status.data?.operation === "rebase";
  return (
    <Modal opened onClose={onClose} title={skip ? "Skip" : "Continue"}>
      <Stack>
        <Text size="sm">
          {skip
            ? "Skip drops the commit that stopped. The next queued commit uses this name and email."
            : "Continue commits the resolution. Cherry-pick and rebase keep the original author and record this pair as the committer. Merge and revert use it as the author too."}
        </Text>
        <IdentitySelect value={identityId} onChange={setIdentityId} committerOnly={committerOnly} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button loading={running} onClick={() => void run()}>{skip ? "Skip" : "Continue"}</Button>
        </Group>
      </Stack>
    </Modal>
  );

  async function run() {
    setRunning(true);
    rememberIdentity(path, identityId);
    const ok = await runMutation(queryClient, path, skip ? "Skip" : "Continue", () => api.sequenceAction(path, action, identityFor(identityId)));
    setRunning(false);
    if (ok) onClose();
  }
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  const published = formatPublished(publishedAt);
  return (
    <Modal opened onClose={onClose} title="About">
      <Stack gap={6}>
        <Text fw={650}>{appName}</Text>
        <Text size="sm">Version {appVersion}</Text>
        <Text size="sm">{published ? `Published ${published}` : "Not published"}</Text>
      </Stack>
    </Modal>
  );
}

function ConfirmDialog({ dialog, onClose }: { dialog: Extract<DialogRequest, { type: "confirm" }>; onClose: () => void }) {
  const [running, setRunning] = useState(false);
  return (
    <Modal opened onClose={onClose} title={dialog.title}>
      <Stack>
        <Text size="sm">{dialog.body}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button color={dialog.danger ? "red" : undefined} loading={running} onClick={() => void run()}>{dialog.confirmLabel}</Button>
        </Group>
      </Stack>
    </Modal>
  );

  async function run() {
    setRunning(true);
    try {
      await dialog.action();
      onClose();
    } finally {
      setRunning(false);
    }
  }
}

function lastLine(output: string): string | undefined {
  return output.split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
}

function useProgress(active: boolean, setOutput: Dispatch<SetStateAction<string>>) {
  useEffect(() => {
    if (!active) return;
    const unlisten = listen<ProgressEvent>("git-progress", (event) => {
      setOutput((current) => `${current}${event.payload.line}\n`);
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [active, setOutput]);
}

function SoftResetDialog({ path, commits, onClose }: { path: string; commits: HistoryCommit[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const oldest = commits[commits.length - 1];
  const keep = oldest?.hash ?? "HEAD";
  const undo = oldest?.parents[0] || `${keep}~1`;
  const [running, setRunning] = useState(false);
  return (
    <Modal opened onClose={onClose} title="git reset --soft" size="lg">
      <Stack>
        <Text size="sm">HEAD moves to the chosen commit. Those commits stay staged, and the working tree is left as it is. This does not push or rewrite the remote.</Text>
        <Text size="sm">{commits.map((commit) => `${commit.hash.slice(0, 7)} ${commit.subject}`).join("\n")}</Text>
        <Button variant="default" loading={running} onClick={() => void run(keep)}>
          git reset --soft {keep.slice(0, 12)} — keep this commit
        </Button>
        <Button color="red" loading={running} onClick={() => void run(undo)}>
          git reset --soft {undo.slice(0, 12)} — undo this commit too
        </Button>
      </Stack>
    </Modal>
  );

  async function run(target: string) {
    setRunning(true);
    const ok = await runMutation(queryClient, path, "Reset", () => api.resetSoft(path, target));
    setRunning(false);
    if (ok) onClose();
  }
}

function RevertDialog({ path, commits, onClose }: { path: string; commits: HistoryCommit[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [identityId, setIdentityId] = useState(() => defaultIdentityId(path));
  const [running, setRunning] = useState(false);
  return (
    <Modal opened onClose={onClose} title="git revert" size="lg">
      <Stack>
        <Text size="sm">Creates new commits that undo the selected ones, newest first. A merge commit uses -m 1. If Git stops on a conflict, the remaining commits are not reverted.</Text>
        {commits.map((commit) => (
          <Text key={commit.hash} size="sm" className={styles.mono}>git revert --no-edit {commit.parents.length > 1 ? "-m 1 " : ""}{commit.hash.slice(0, 12)} — {commit.subject}</Text>
        ))}
        <IdentitySelect value={identityId} onChange={setIdentityId} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button loading={running} onClick={() => void run()}>Revert</Button>
        </Group>
      </Stack>
    </Modal>
  );

  async function run() {
    setRunning(true);
    rememberIdentity(path, identityId);
    const identity = identityFor(identityId);
    const ok = await runMutation(queryClient, path, "Revert", async () => {
      for (const commit of commits) {
        await api.revertCommit(path, commit.hash, commit.parents.length > 1, identity);
      }
    });
    setRunning(false);
    if (ok) onClose();
  }
}

function CherryPickDialog({ path, commits, onClose }: { path: string; commits: HistoryCommit[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const defaultBranch = useSettingsStore((state) => state.defaultBranch);
  const branches = useQuery({ queryKey: ["branches", path, defaultBranch], queryFn: () => api.listBranches(path, defaultBranch) });
  const locals = (branches.data ?? []).filter((branch) => !branch.remote);
  const [branch, setBranch] = useState("");
  const [identityId, setIdentityId] = useState(() => defaultIdentityId(path));
  const [running, setRunning] = useState(false);
  const names = commits.map((commit) => commit.hash.slice(0, 7)).join(" ");
  return (
    <Modal opened onClose={onClose} title="git cherry-pick" size="lg">
      <Stack>
        <Text size="sm">Commits are applied oldest first. Choosing another local branch runs git switch first. A conflict stops the sequence; Continue, Skip, and Abort then appear in the command bar.</Text>
        {commits.map((commit) => <Text key={commit.hash} size="sm">{commit.hash.slice(0, 7)} {commit.subject}</Text>)}
        <BranchPicker
          label="Onto"
          value={branch}
          options={[{ value: "", label: "Current branch" }, ...locals.map((item) => ({ value: item.name, label: item.current ? `${item.name} (current)` : item.name }))]}
          onChange={setBranch}
        />
        <Text size="xs" className={styles.mono}>git cherry-pick {names}</Text>
        <IdentitySelect value={identityId} onChange={setIdentityId} committerOnly />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button loading={running} onClick={() => void run()}>Cherry-pick</Button>
        </Group>
      </Stack>
    </Modal>
  );

  async function run() {
    setRunning(true);
    const chosen = locals.find((item) => item.name === branch);
    const destination = chosen && !chosen.current ? chosen.name : null;
    rememberIdentity(path, identityId);
    const ok = await runMutation(queryClient, path, "Cherry-pick", () => api.cherryPick(path, commits.map((commit) => commit.hash), destination, identityFor(identityId)));
    setRunning(false);
    if (ok) onClose();
  }
}

function CherryPickIntoDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const defaultBranch = useSettingsStore((state) => state.defaultBranch);
  const status = useQuery({ queryKey: ["status", path, false], queryFn: () => api.repositoryStatus(path, false) });
  const branches = useQuery({ queryKey: ["branches", path, defaultBranch], queryFn: () => api.listBranches(path, defaultBranch) });
  const current = status.data?.branch ?? "";
  const options = [
    ...(branches.data ?? []).filter((branch) => !branch.remote && branch.name !== current).map((branch) => ({ value: branch.name, label: branch.name })),
    ...(branches.data ?? []).filter((branch) => branch.remote).map((branch) => ({ value: branch.name, label: branch.name })),
  ];
  const [source, setSource] = useState("");
  const chosen = options.some((option) => option.value === source) ? source : (options[0]?.value ?? "");
  const log = useInfiniteQuery({
    queryKey: ["log", path, chosen || "none"],
    queryFn: ({ pageParam }) => api.commitLog(path, pageParam, 100, undefined, chosen),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((count, page) => count + page.commits.length, 0) : undefined),
    enabled: Boolean(chosen),
  });
  const commits = log.data?.pages.flatMap((page) => page.commits) ?? [];
  const [picked, setPicked] = useState<CommitSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [file, setFile] = useState("");
  const [mode, setMode] = useState<"unified" | "split">("unified");
  const [identityId, setIdentityId] = useState(() => defaultIdentityId(path));
  const [running, setRunning] = useState(false);
  const single = picked.length === 1 ? picked[0] : null;
  const details = useQuery({
    queryKey: ["commit", path, single?.hash],
    queryFn: () => api.commitDetails(path, single?.hash ?? ""),
    enabled: Boolean(single),
  });
  const diff = useQuery({
    queryKey: ["diff", path, "commit", file, single?.hash],
    queryFn: () => api.fileDiff(path, "commit", file, single?.hash),
    enabled: Boolean(single && file),
  });
  const destination = current || "HEAD";
  return (
    <Modal opened onClose={onClose} title={`Cherry-pick onto ${destination}`} size="90%">
      <Stack>
        <Text size="sm">
          Commits are applied oldest first onto the checked-out branch. A conflict stops the sequence.
          Stage the files you fixed, then Continue. Skip drops the commit that stopped. Abort restores the branch.
        </Text>
        <BranchPicker label="From branch" value={chosen} options={options} onChange={(value) => { setSource(value); setPicked([]); setSelected(""); setFile(""); }} />
        <div style={{ display: "flex", height: 520, minHeight: 0, gap: 8 }}>
          <div style={{ flex: 1.3, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <HistoryView
              key={chosen}
              contained
              pickOnly
              commits={commits}
              selected={selected}
              hasMore={Boolean(log.hasNextPage)}
              loadingMore={log.isFetchingNextPage}
              query=""
              onLoadMore={() => void log.fetchNextPage()}
              onSelect={setSelected}
              onPicked={setPicked}
              onCopy={(value) => void navigator.clipboard.writeText(value)}
              onCreateBranch={() => undefined}
              onCompare={() => undefined}
              onSoftReset={() => undefined}
              onRevert={() => undefined}
              onCherryPick={() => undefined}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "auto" }}>
            {picked.length > 1 ? (
              <Text p="sm" c="dimmed">Select one commit to see its details.</Text>
            ) : (
              <>
                <CommitDetails
                  details={details.data}
                  selectedFile={file}
                  onSelectFile={setFile}
                  onCopy={(value) => void navigator.clipboard.writeText(value)}
                  onCreateBranch={() => single && useUiStore.getState().setDialog({ type: "branch", source: single.hash })}
                  onCompare={() => undefined}
                />
                {file ? <DiffViewer diff={diff.data} loading={diff.isFetching} mode={mode} onMode={setMode} /> : null}
              </>
            )}
          </div>
        </div>
        <IdentitySelect value={identityId} onChange={setIdentityId} committerOnly />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button loading={running} disabled={picked.length === 0} onClick={() => void run()}>Cherry-pick</Button>
        </Group>
      </Stack>
    </Modal>
  );

  async function run() {
    setRunning(true);
    rememberIdentity(path, identityId);
    const ok = await runMutation(queryClient, path, "Cherry-pick", () => api.cherryPick(path, picked.map((commit) => commit.hash), null, identityFor(identityId)));
    setRunning(false);
    if (ok) onClose();
  }
}

async function pickDirectory(setPath: (path: string) => void) {
  const selected = await open({ directory: true, multiple: false, title: "Choose folder" });
  if (typeof selected === "string") setPath(selected);
}
