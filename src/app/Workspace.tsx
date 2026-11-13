import { Button, Menu, NavLink, Text } from "@mantine/core";
import { BranchPicker } from "../components/common/BranchPicker";
import { BusyButton } from "../components/common/BusyButton";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { openPath } from "@tauri-apps/plugin-opener";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ChangesView } from "../components/changes/ChangesView";
import { CommitDetails } from "../components/commits/CommitDetails";
import { HistoryView } from "../components/commits/HistoryView";
import { DiffViewer } from "../components/diff/DiffViewer";
import { GitErrorView } from "../components/common/GitErrorView";
import { BottomDock } from "../components/layout/BottomDock";
import { CommandBar } from "../components/layout/CommandBar";
import { StatusStrip } from "../components/layout/StatusStrip";
import { TabBar } from "../components/layout/TabBar";
import { BranchList, RemoteList, StashList, TagList } from "../components/repository/ReferenceLists";
import { api } from "../services/git/api";
import { refreshRepository, runMutation } from "../services/git/actions";
import { useLogStore } from "../stores/logStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { BranchInfo, FileDiffKind, FileEntry, RepoSection, RepoStatus } from "../types/git";
import { joinRepoPath } from "../utils/path";
import { rememberSsh, shortcutSsh } from "../features/auth";
import { progressText, remoteActionId } from "../features/progress";
import { baseName } from "../features/workspace/tabs";
import styles from "../styles/app.module.css";

export function Workspace({ onOpen }: { onOpen: () => void }) {
  const queryClient = useQueryClient();
  const tabs = useWorkspaceStore((state) => state.tabs);
  const active = useWorkspaceStore((state) => state.active);
  const repoUi = useWorkspaceStore((state) => (active ? state.repoUi[active] : undefined));
  const showIgnored = repoUi?.showIgnored ?? false;
  const section = (repoUi?.section ?? "changes") as RepoSection;
  const layout = useSettingsStore((state) => state.layout);
  const busy = useUiStore((state) => state.busy);
  const progressLine = useUiStore((state) => (active ? state.progress[active]?.at(-1) : undefined));
  const busyLabel = active ? busy[active] : undefined;
  const remoteId = remoteActionId(busyLabel);
  const activity = remoteId ? { id: remoteId, detail: progressText(busyLabel ?? "Working", progressLine) } : null;
  const error = useUiStore((state) => (active ? state.errors[active] : null));
  const focus = useUiStore((state) => (active ? state.focus[active] : null));
  const search = useUiStore((state) => state.search);
  const entries = useLogStore((state) => state.entries);
  const view = useUiStore((state) => state.view);
  const [stashIndex, setStashIndex] = useState<Record<string, number | null>>({});
  const [historyFile, setHistoryFile] = useState<Record<string, string>>({});
  const [changesDiff, setChangesDiff] = useState(true);
  const [branchLog, setBranchLog] = useState<Record<string, string>>({});
  const [commitMulti, setCommitMulti] = useState(false);
  const navRef = useRef<PanelImperativeHandle>(null);
  const detailsRef = useRef<PanelImperativeHandle>(null);
  const logRef = useRef<PanelImperativeHandle>(null);
  const initialLayout = useRef({
    nav: layout.navCollapsed ? "0%" : `${layout.navPercent}%`,
    details: layout.detailsCollapsed ? "0%" : `${layout.detailsPercent}%`,
    content: layout.logCollapsed ? "100%" : `${100 - layout.logPercent}%`,
    log: layout.logCollapsed ? "0%" : `${layout.logPercent}%`,
    commitInfo: `${layout.commitInfoPercent || 42}%`,
  });

  const statusQueries = useQueries({
    queries: tabs.map((path) => ({
      queryKey: ["status", path, path === active ? showIgnored : false],
      queryFn: () => api.repositoryStatus(path, path === active ? showIgnored : false),
      staleTime: 4000,
      enabled: view === "workspace",
    })),
  });
  const statuses: Record<string, RepoStatus | undefined> = {};
  tabs.forEach((path, index) => {
    statuses[path] = statusQueries[index]?.data;
  });
  const status = active ? statuses[active] : undefined;
  const statusPending = active ? statusQueries[tabs.indexOf(active)]?.isPending : false;

  const defaultBranch = useSettingsStore((state) => state.defaultBranch);
  const branches = useQuery({
    queryKey: ["branches", active, defaultBranch],
    queryFn: () => api.listBranches(active as string, defaultBranch),
    enabled: Boolean(active) && (section === "branches" || section === "branch-log"),
  });
  const remotes = useQuery({
    queryKey: ["remotes", active],
    queryFn: () => api.listRemotes(active as string),
    enabled: Boolean(active) && section === "remotes",
  });
  const tags = useQuery({
    queryKey: ["tags", active],
    queryFn: () => api.listTags(active as string),
    enabled: Boolean(active) && section === "tags",
  });
  const stashes = useQuery({
    queryKey: ["stashes", active],
    queryFn: () => api.listStashes(active as string),
    enabled: Boolean(active) && section === "stashes",
  });
  const branchLogRev = active ? (branchLog[active] || status?.branch || "HEAD") : "HEAD";
  const logRevision = section === "branch-log" ? branchLogRev : null;
  const log = useInfiniteQuery({
    queryKey: ["log", active, logRevision ?? "all"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.commitLog(active as string, pageParam, 100, undefined, logRevision),
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((count, page) => count + page.commits.length, 0) : undefined),
    enabled: Boolean(active) && (section === "history" || section === "branch-log"),
  });
  const commits = log.data?.pages.flatMap((page) => page.commits) ?? [];
  const selectedCommit = repoUi?.selectedCommit ?? null;
  const details = useQuery({
    queryKey: ["commit", active, selectedCommit],
    queryFn: () => api.commitDetails(active as string, selectedCommit as string),
    enabled: Boolean(active && selectedCommit && !commitMulti && (section === "history" || section === "branch-log")),
  });
  const diff = useQuery({
    queryKey: ["diff", active, focus?.kind, focus?.path, focus?.rev, focus?.from, focus?.to],
    queryFn: () => api.fileDiff(active as string, focus?.kind ?? "unstaged", focus?.path ?? "", focus?.rev, focus?.from, focus?.to),
    enabled: Boolean(active && focus && (section === "changes" || ((section === "history" || section === "branch-log") && !commitMulti))),
  });
  const selectedStash = active ? stashIndex[active] : null;
  const stashDiff = useQuery({
    queryKey: ["stash-diff", active, selectedStash],
    queryFn: () => api.stashDiff(active as string, selectedStash as number),
    enabled: Boolean(active) && section === "stashes" && selectedStash != null,
  });

  useEffect(() => {
    const title = status ? `${status.name} — Git Desktop` : "Git Desktop";
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title)).catch(() => undefined);
  }, [status]);

  const last = [...entries].reverse().find((entry) => entry.repository === active && !entry.routine);

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <Menu position="bottom-start">
          <Menu.Target>
            <Button size="compact-sm" variant="subtle">Open</Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={onOpen}>Open</Menu.Item>
            <Menu.Item onClick={() => useUiStore.getState().setDialog({ type: "init" })}>Init</Menu.Item>
            <Menu.Item onClick={() => useUiStore.getState().setDialog({ type: "clone" })}>Clone</Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <Button size="compact-sm" variant="subtle" onClick={() => useUiStore.getState().setView("settings")}>Settings</Button>
      </div>
      <TabBar
        tabs={tabs}
        active={active}
        onActivate={(path) => useWorkspaceStore.getState().setActive(path)}
        onClose={(path) => {
          void api.unwatchRepository(path);
          useWorkspaceStore.getState().closeRepository(path);
        }}
        onReorder={(from, to) => useWorkspaceStore.getState().reorder(from, to)}
      />
      <StatusStrip
        status={status}
        busy={busyLabel}
        progress={remoteId && progressLine ? progressText(busyLabel ?? "Working", progressLine) : undefined}
        last={last}
        primary={Boolean(status?.branch) && (branches.data ?? []).some((branch) => branch.pushProtected && !branch.remote && branch.name === status?.branch)}
      >
        <CommandBar
          disabled={!active}
          search={search}
          onSearch={(value) => useUiStore.getState().setSearch(value)}
          onRefresh={() => active && void refreshRepository(queryClient, active)}
          onFetch={() => useUiStore.getState().setDialog({ type: "fetch" })}
          onPull={() => useUiStore.getState().setDialog({ type: "pull" })}
          onPush={() => useUiStore.getState().setDialog({ type: "push" })}
          onCommit={() => useUiStore.getState().setDialog({ type: "commit" })}
          onBranch={() => useUiStore.getState().setDialog({ type: "branch" })}
          onStash={() => useUiStore.getState().setDialog({ type: "stash" })}
          onCherryPick={() => useUiStore.getState().setDialog({ type: "cherry-pick-into" })}
          operation={status?.operation}
          onContinue={() => active && useUiStore.getState().setDialog({ type: "sequence", action: "continue" })}
          onSkip={() => active && useUiStore.getState().setDialog({ type: "sequence", action: "skip" })}
          onAbort={() => confirmSequence("abort")}
          activity={activity}
        />
      </StatusStrip>
      {tabs.length === 0 ? <Welcome onOpen={onOpen} /> : (
        <Group orientation="vertical" style={{ flex: 1, minHeight: 0 }}>
          <Panel id="content" defaultSize={initialLayout.current.content} minSize="40%">
            <Group orientation="horizontal" style={{ height: "100%" }}>
              <Panel id="nav" panelRef={navRef} collapsible collapsedSize="0%" defaultSize={initialLayout.current.nav} minSize="12%">
                <nav className={styles.panel}>
                  {(["changes", "history", "branch-log", "branches", "remotes", "tags", "stashes"] as RepoSection[]).map((item) => (
                    <NavLink key={item} label={labelFor(item)} active={section === item} onClick={() => active && useWorkspaceStore.getState().setSection(active, item)} />
                  ))}
                  <NavLink label={showIgnored ? "Hide ignored" : "Show ignored"} onClick={() => active && useWorkspaceStore.getState().patchUi(active, { showIgnored: !showIgnored })} />
                </nav>
              </Panel>
              <Separator className={styles.separator} style={{ flexBasis: 6 }} />
              <Panel id="center" minSize="30%">
                <div className={styles.panel}>
                  {error ? <GitErrorView error={error} onClose={() => active && useUiStore.getState().setError(active, null)} /> : null}
                  {statusPending ? <Text p="sm" c="dimmed">Loading repository…</Text> : null}
                  {status && section === "changes" ? (
                    <ChangesView
                      status={status}
                      selected={focus?.path}
                      selectedKind={focus?.kind}
                      query={search}
                      onSelect={(file, kind) => {
                        setChangesDiff(true);
                        if (active) selectFile(active, file, kind);
                      }}
                      onClear={() => {
                        setChangesDiff(false);
                        if (active) useUiStore.getState().setFocus(active, null);
                      }}
                      onStage={(paths) => active && void mutate(active, "Stage", () => paths.length > 1 && coversUnstaged(status, paths) ? api.stageAll(active) : api.stagePaths(active, paths))}
                      onUnstage={(paths) => active && void mutate(active, "Unstage", () => paths.length > 1 && status.files.filter((file) => file.staged).every((file) => paths.includes(file.path)) ? api.unstageAll(active) : api.unstagePaths(active, paths))}
                      onDiscard={(paths) => confirmDiscard(paths)}
                      onOpen={(file) => active && void openPath(joinRepoPath(active, file))}
                      onCopy={(file) => void navigator.clipboard.writeText(active ? joinRepoPath(active, file) : file)}
                    />
                  ) : null}
                  {section === "history" ? (
                    <HistoryView
                      commits={commits}
                      selected={selectedCommit}
                      hasMore={Boolean(log.hasNextPage)}
                      loadingMore={log.isFetchingNextPage}
                      query={search}
                      onSelect={(hash) => {
                        if (!active) return;
                        useWorkspaceStore.getState().patchUi(active, { selectedCommit: hash });
                        useUiStore.getState().setFocus(active, null);
                      }}
                      onLoadMore={() => void log.fetchNextPage()}
                      onCreateBranch={(hash) => useUiStore.getState().setDialog({ type: "branch", source: hash })}
                      onCopy={(value) => void navigator.clipboard.writeText(value)}
                      onCompare={(hash) => active && useUiStore.getState().setFocus(active, { path: "", kind: "range", from: hash, to: "HEAD" })}
                      onSoftReset={(commits) => useUiStore.getState().setDialog({ type: "soft-reset", commits: commits.map(commitRef) })}
                      onRevert={(commits) => useUiStore.getState().setDialog({ type: "revert", commits: commits.map(commitRef) })}
                      onCherryPick={(commits) => useUiStore.getState().setDialog({ type: "cherry-pick", commits: commits.map(commitRef) })}
                      onPickedCount={(count) => setCommitMulti(count > 1)}
                    />
                  ) : null}
                  {section === "branch-log" ? (
                    <div className={styles.panel}>
                      <div className={styles.toolbar}>
                        <BranchPicker
                          label="Branch"
                          value={branchLogRev}
                          options={branchLogOptions(branches.data ?? [], branchLogRev, Boolean(status?.detached))}
                          onChange={(value) => {
                            if (!active) return;
                            setBranchLog((current) => ({ ...current, [active]: value }));
                            setCommitMulti(false);
                          }}
                        />
                      </div>
                      <HistoryView
                        key={branchLogRev}
                        contained
                        commits={commits}
                        selected={commitMulti ? null : selectedCommit}
                        hasMore={Boolean(log.hasNextPage)}
                        loadingMore={log.isFetchingNextPage}
                        query={search}
                        onSelect={(hash) => {
                          if (!active) return;
                          useWorkspaceStore.getState().patchUi(active, { selectedCommit: hash });
                          useUiStore.getState().setFocus(active, null);
                        }}
                        onLoadMore={() => void log.fetchNextPage()}
                        onCreateBranch={(hash) => useUiStore.getState().setDialog({ type: "branch", source: hash })}
                        onCopy={(value) => void navigator.clipboard.writeText(value)}
                        onCompare={(hash) => active && useUiStore.getState().setFocus(active, { path: "", kind: "range", from: hash, to: "HEAD" })}
                        onSoftReset={(commits) => useUiStore.getState().setDialog({ type: "soft-reset", commits: commits.map(commitRef) })}
                        onRevert={(commits) => useUiStore.getState().setDialog({ type: "revert", commits: commits.map(commitRef) })}
                        onCherryPick={(commits) => useUiStore.getState().setDialog({ type: "cherry-pick", commits: commits.map(commitRef) })}
                        onPickedCount={(count) => setCommitMulti(count > 1)}
                      />
                    </div>
                  ) : null}
                  {section === "branches" ? (
                    <div className={styles.panel}>
                      <div className={styles.toolbar}>
                        <BusyButton size="compact-xs" busy={busyLabel === "Fetch"} label="Fetch" progress={progressLine} title="git fetch. Updates remote-tracking branches for the current upstream, or origin. Does not change the working tree." onClick={() => void fetchRemotes()} />
                      </div>
                      <BranchList
                        branches={branches.data ?? []}
                        query={search}
                        onCheckout={(branch) => active && void mutate(active, "Switch branch", () => api.switchBranch(active, branch.name))}
                        onRename={(branch) => useUiStore.getState().setDialog({ type: "rename-branch", name: branch.name })}
                        onDelete={(branch) => useUiStore.getState().setDialog({ type: "delete-branch", name: branch.name })}
                        onUpstream={(branch) => useUiStore.getState().setDialog({ type: "set-upstream", branch: branch.name })}
                        onPush={(branch) => useUiStore.getState().setDialog({ type: "push", branch: branch.name, setUpstream: !branch.upstream || branch.upstreamGone })}
                        onPull={(branch) => useUiStore.getState().setDialog({ type: "pull", ...pullTarget(branch), checkedOut: branch.current })}
                        onCopy={(name) => void navigator.clipboard.writeText(name)}
                      />
                    </div>
                  ) : null}
                  {section === "remotes" ? (
                    <div className={styles.panel}>
                      <div className={styles.toolbar}>
                        <Button size="compact-xs" onClick={() => useUiStore.getState().setDialog({ type: "add-remote" })}>Add remote</Button>
                      </div>
                      <RemoteList
                        remotes={remotes.data ?? []}
                        progress={progressLine}
                        activeRemote={busyLabel?.startsWith("Fetch ") ? busyLabel.slice("Fetch ".length) : undefined}
                        onFetch={(name) => active && void mutate(active, `Fetch ${name}`, () => api.fetchRemote(active, name, false, "branches", sshFor(active), crypto.randomUUID()))}
                        onRemove={(name) => confirmRemoveRemote(name)}
                      />
                    </div>
                  ) : null}
                  {section === "tags" ? (
                    <div className={styles.panel}>
                      <div className={styles.toolbar}>
                        <BusyButton size="compact-xs" busy={busyLabel === "Fetch"} label="Fetch" progress={progressLine} title="git fetch. Updates remote-tracking branches for the current upstream, or origin." onClick={() => void fetchRemotes()} />
                        <Button size="compact-xs" onClick={() => useUiStore.getState().setDialog({ type: "tag", target: selectedCommit ?? "HEAD" })}>New tag</Button>
                      </div>
                      <TagList
                        tags={tags.data ?? []}
                        query={search}
                        onSelect={(tag) => active && useWorkspaceStore.getState().patchUi(active, { selectedCommit: tag.commit, section: "history" })}
                        onDelete={(tag) => confirmDeleteTag(tag.name)}
                        onPush={(tag) => useUiStore.getState().setDialog({ type: "push-tag", name: tag.name })}
                        onCompare={(tag) => {
                          if (!active) return;
                          useWorkspaceStore.getState().setSection(active, "history");
                          useUiStore.getState().setFocus(active, { path: "", kind: "range", from: tag.name, to: "HEAD" });
                        }}
                      />
                    </div>
                  ) : null}
                  {section === "stashes" ? (
                    <StashList
                      stashes={stashes.data ?? []}
                      selected={selectedStash}
                      onSelect={(stash) => active && setStashIndex((current) => ({ ...current, [active]: stash.index }))}
                      onApply={(stash) => active && void mutate(active, "Apply stash", () => api.stashAction(active, "apply", stash.index))}
                      onPop={(stash) => confirmStash("pop", stash.index, stash.message)}
                      onDrop={(stash) => confirmStash("drop", stash.index, stash.message)}
                    />
                  ) : null}
                  {!statusPending && !status && active ? <Text p="sm" c="dimmed">Waiting for repository status.</Text> : null}
                </div>
              </Panel>
              <Separator className={styles.separator} style={{ flexBasis: 6 }} />
              <Panel id="details" panelRef={detailsRef} collapsible collapsedSize="0%" defaultSize={initialLayout.current.details} minSize="18%">
                {section === "history" || section === "branch-log" ? (
                  commitMulti ? (
                    <Text p="sm" c="dimmed">Select one commit to see its details.</Text>
                  ) : (
                  <div className={styles.panel}>
                    <Group orientation="vertical" style={{ height: "100%" }}>
                      <Panel id="commit-info" defaultSize={initialLayout.current.commitInfo} minSize="12%" onResize={(size) => useSettingsStore.getState().setLayout({ commitInfoPercent: size.asPercentage })}>
                        <div className={styles.scroll} style={{ height: "100%" }}>
                          <CommitDetails
                            details={details.data}
                            selectedFile={active ? historyFile[active] : undefined}
                            onSelectFile={(file) => {
                              if (!active || !selectedCommit) return;
                              setHistoryFile((current) => ({ ...current, [active]: file }));
                              useUiStore.getState().setFocus(active, { path: file, kind: "commit", rev: selectedCommit });
                            }}
                            onCopy={(value) => void navigator.clipboard.writeText(value)}
                            onCreateBranch={() => selectedCommit && useUiStore.getState().setDialog({ type: "branch", source: selectedCommit })}
                            onCompare={() => {
                              if (!active || !selectedCommit) return;
                              useUiStore.getState().setFocus(active, { path: "", kind: "range", from: selectedCommit, to: "HEAD" });
                            }}
                          />
                        </div>
                      </Panel>
                      <Separator className={styles.separator} style={{ flexBasis: 6 }} />
                      <Panel id="commit-diff" minSize="16%">
                        <div className={styles.diffSlot} style={{ height: "100%" }}>
                          <DiffViewer diff={diff.data} loading={diff.isFetching} mode={repoUi?.diffMode === "split" ? "split" : "unified"} onMode={(mode) => active && useWorkspaceStore.getState().patchUi(active, { diffMode: mode })} />
                        </div>
                      </Panel>
                    </Group>
                  </div>
                  )
                ) : section === "stashes" ? (
                  <DiffViewer diff={stashDiff.data} loading={stashDiff.isFetching} mode={repoUi?.diffMode === "split" ? "split" : "unified"} onMode={(mode) => active && useWorkspaceStore.getState().patchUi(active, { diffMode: mode })} />
                ) : (
                  <DiffViewer
                    diff={changesDiff ? diff.data : undefined}
                    loading={changesDiff && diff.isFetching && Boolean(focus)}
                    mode={repoUi?.diffMode === "split" ? "split" : "unified"}
                    onMode={(mode) => active && useWorkspaceStore.getState().patchUi(active, { diffMode: mode })}
                    onStageHunk={changesDiff && focus?.kind === "unstaged" && diff.data && !diff.data.truncated && !diff.data.binary ? (raw) => active && void mutate(active, "Stage hunk", () => api.applyHunks(active, focus.path, false, [raw])) : undefined}
                    onUnstageHunk={changesDiff && focus?.kind === "staged" && diff.data && !diff.data.truncated && !diff.data.binary ? (raw) => active && void mutate(active, "Unstage hunk", () => api.applyHunks(active, focus.path, true, [raw])) : undefined}
                  />
                )}
              </Panel>
            </Group>
          </Panel>
          <Separator className={styles.separator} style={{ flexBasis: 6 }} />
          <Panel
            id="log"
            panelRef={logRef}
            collapsible
            collapsedSize="0%"
            defaultSize={initialLayout.current.log}
            minSize="8%"
            onResize={(size) => useSettingsStore.getState().setLayout({ logPercent: size.asPercentage, logCollapsed: size.asPercentage < 1 })}
          >
            <BottomDock
              repo={active}
              openRepos={tabs}
              entries={entries}
              onClear={() => { useLogStore.getState().clear(); void api.clearOperationLog(); }}
            />
          </Panel>
        </Group>
      )}
      <PanelToggles navRef={navRef} detailsRef={detailsRef} logRef={logRef} />
    </div>
  );

  function sshFor(repo: string): string | null {
    const choice = shortcutSsh(repo);
    if (choice.rememberId) rememberSsh(repo, choice.rememberId);
    return choice.path;
  }

  function fetchRemotes() {
    if (!active) return;
    void mutate(active, "Fetch", () => api.fetchRemote(active, null, false, "branches", sshFor(active), crypto.randomUUID()));
  }

  function pullTarget(branch: { name: string; upstream?: string | null }) {
    const upstream = branch.upstream ?? "";
    const slash = upstream.indexOf("/");
    if (slash > 0) {
      return { remote: upstream.slice(0, slash), branch: upstream.slice(slash + 1), localBranch: branch.name };
    }
    return { remote: "origin", branch: branch.name, localBranch: branch.name };
  }

function commitRef(commit: { hash: string; parents: string[]; subject: string }) {
  return { hash: commit.hash, parents: commit.parents, subject: commit.subject };
}

function selectFile(repo: string, file: FileEntry, kind: FileDiffKind) {
    useWorkspaceStore.getState().patchUi(repo, { selectedPaths: [file.path] });
    useUiStore.getState().setFocus(repo, { path: file.path, kind });
  }

  async function mutate(repo: string, label: string, action: () => Promise<void>) {
    await runMutation(queryClient, repo, label, action);
  }

  function confirmSequence(action: "skip" | "abort") {
    if (!active) return;
    const repo = active;
    const abort = action === "abort";
    useUiStore.getState().setDialog({
      type: "confirm",
      title: abort ? "Abort" : "Skip",
      body: abort
        ? "Stop the merge, cherry-pick, revert, or rebase and put the branch back where it was? Resolutions you have not continued are discarded."
        : "Skip the commit that stopped? It is dropped, and the remaining queued commits continue.",
      confirmLabel: abort ? "Abort" : "Skip",
      danger: true,
      action: () => mutate(repo, abort ? "Abort" : "Skip", () => api.sequenceAction(repo, action, null)),
    });
  }

  function confirmDiscard(paths: string[]) {
    if (!active) return;
    const repo = active;
    useUiStore.getState().setDialog({
      type: "confirm",
      title: "Restore changes",
      body: `Run git restore for ${paths.join(", ")}? Tracked files return to the index. Untracked files are deleted. Unmerged files are left untouched.`,
      confirmLabel: "Restore",
      danger: true,
      action: () => mutate(repo, "Restore", () => api.discardUnstaged(repo, paths)),
    });
  }

  function confirmRemoveRemote(name: string) {
    if (!active) return;
    const repo = active;
    useUiStore.getState().setDialog({
      type: "confirm",
      title: `Remove ${name}`,
      body: `Remove the remote ${name}? This does not delete the remote repository.`,
      confirmLabel: "Remove remote",
      danger: true,
      action: () => mutate(repo, "Remove remote", () => api.removeRemote(repo, name)),
    });
  }

  function confirmDeleteTag(name: string) {
    if (!active) return;
    const repo = active;
    useUiStore.getState().setDialog({
      type: "confirm",
      title: `Delete ${name}`,
      body: `Delete the local tag ${name}? This does not delete the tag from remotes.`,
      confirmLabel: "Delete tag",
      danger: true,
      action: () => mutate(repo, "Delete tag", () => api.deleteTag(repo, name)),
    });
  }

  function confirmStash(action: "pop" | "drop", index: number, message: string) {
    if (!active) return;
    const repo = active;
    useUiStore.getState().setDialog({
      type: "confirm",
      title: action === "pop" ? "Pop stash" : "Drop stash",
      body: action === "pop"
        ? `Apply and remove “${message}”? Conflicts stay in the working tree for you to resolve.`
        : `Drop “${message}”? The stashed changes will be removed.`,
      confirmLabel: action === "pop" ? "Pop stash" : "Drop stash",
      danger: action === "drop",
      action: () => mutate(repo, action === "pop" ? "Pop stash" : "Drop stash", () => api.stashAction(repo, action, index)),
    });
  }

}

function Welcome({ onOpen }: { onOpen: () => void }) {
  const recent = useWorkspaceStore((state) => state.recent);
  return (
    <div className={styles.empty}>
      <Text fw={650} mb="xs">Open a Git repository</Text>
      <Text size="sm" c="dimmed" mb="sm">Git Desktop uses the Git executable already installed on this Mac. Repository changes happen only when you run an action.</Text>
      <Button onClick={onOpen}>Open repository</Button>
      <Button ml="xs" variant="default" onClick={() => useUiStore.getState().setDialog({ type: "clone" })}>Clone</Button>
      <Button ml="xs" variant="default" onClick={() => useUiStore.getState().setDialog({ type: "init" })}>Initialize</Button>
      {recent.length > 0 ? <Text mt="md" size="sm" fw={650}>Recent</Text> : null}
      {recent.map((repo) => (
        <Button key={repo.path} variant="subtle" fullWidth justify="flex-start" onClick={() => void reopen(repo.path)}>
          {repo.name} <Text span c="dimmed" ml="xs">{repo.path}</Text>
        </Button>
      ))}
    </div>
  );

  async function reopen(path: string) {
    try {
      const status = await api.repositoryStatus(path, false);
      useWorkspaceStore.getState().openRepository(status);
      await api.watchRepository(status.path);
    } catch (caught) {
      useUiStore.getState().setError(path, caught as import("../types/git").GitError);
      useWorkspaceStore.getState().openRepository({
        path,
        name: baseName(path),
        kind: "normal",
        bare: false,
        detached: false,
        unborn: false,
        operation: "none",
        files: [],
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
        conflictCount: 0,
        ignoredCount: 0,
      });
    }
  }
}

function PanelToggles({
  navRef,
  detailsRef,
  logRef,
}: {
  navRef: RefObject<PanelImperativeHandle | null>;
  detailsRef: RefObject<PanelImperativeHandle | null>;
  logRef: RefObject<PanelImperativeHandle | null>;
}) {
  useEffect(() => {
    const toggle = (event: Event) => {
      const name = (event as CustomEvent<string>).detail;
      const ref = name === "nav" ? navRef : name === "details" ? detailsRef : logRef;
      if (ref.current?.isCollapsed()) ref.current.expand();
      else ref.current?.collapse();
    };
    window.addEventListener("git-desktop-toggle", toggle);
    return () => window.removeEventListener("git-desktop-toggle", toggle);
  }, [navRef, detailsRef, logRef]);
  return null;
}

function labelFor(section: RepoSection): string {
  if (section === "changes") return "Status";
  if (section === "stashes") return "Stashes";
  if (section === "branch-log") return "Branch log";
  return section[0]?.toUpperCase() + section.slice(1);
}

function branchLogOptions(branches: BranchInfo[], selected: string, detached: boolean) {
  const options = [
    ...(detached ? [{ value: "HEAD", label: "HEAD" }] : []),
    ...branches.filter((branch) => !branch.remote).map((branch) => ({ value: branch.name, label: branch.current ? `${branch.name} (current)` : branch.name })),
    ...branches.filter((branch) => branch.remote).map((branch) => ({ value: branch.name, label: branch.name })),
  ];
  if (!options.some((option) => option.value === selected)) options.unshift({ value: selected, label: selected });
  return options;
}

function coversUnstaged(status: RepoStatus, paths: string[]): boolean {
  const wanted = status.files.filter((file) => !file.ignored && (file.unstaged || file.untracked || file.unmerged)).map((file) => file.path);
  return wanted.length > 0 && wanted.every((path) => paths.includes(path));
}
