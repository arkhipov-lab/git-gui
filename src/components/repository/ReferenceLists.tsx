import { Button, Text } from "@mantine/core";
import { useScreenWindow } from "../../features/lists/window";
import { BusyButton } from "../common/BusyButton";
import type { BranchInfo, RemoteInfo, StashInfo, TagInfo } from "../../types/git";
import styles from "../../styles/app.module.css";

export function BranchList({
  branches,
  query,
  onCheckout,
  onRename,
  onDelete,
  onUpstream,
  onPush,
  onPull,
  onCopy,
}: {
  branches: BranchInfo[];
  query: string;
  onCheckout: (branch: BranchInfo) => void;
  onRename: (branch: BranchInfo) => void;
  onDelete: (branch: BranchInfo) => void;
  onUpstream: (branch: BranchInfo) => void;
  onPush: (branch: BranchInfo) => void;
  onPull: (branch: BranchInfo) => void;
  onCopy: (name: string) => void;
}) {
  const needle = query.trim().toLowerCase();
  const visible = branches.filter((branch) => branch.name.toLowerCase().includes(needle));
  const local = visible.filter((branch) => !branch.remote);
  const remote = visible.filter((branch) => branch.remote);
  const windowed = useScreenWindow(visible.length, 30, needle);
  const shownLocal = local.slice(0, windowed.limit);
  const shownRemote = remote.slice(0, Math.max(0, windowed.limit - local.length));
  return (
    <div ref={windowed.ref} className={styles.scroll}>
      <BranchGroup title="Local" branches={shownLocal} total={local.length} onCheckout={onCheckout} onRename={onRename} onDelete={onDelete} onUpstream={onUpstream} onPush={onPush} onPull={onPull} onCopy={onCopy} />
      <BranchGroup title="Remote" branches={shownRemote} total={remote.length} onCheckout={onCheckout} onCopy={onCopy} />
      {windowed.hasMore ? <Button fullWidth variant="subtle" onClick={windowed.loadMore}>Load more</Button> : null}
    </div>
  );
}

function BranchGroup({
  title,
  branches,
  total,
  onCheckout,
  onRename,
  onDelete,
  onUpstream,
  onPush,
  onPull,
  onCopy,
}: {
  title: string;
  branches: BranchInfo[];
  total: number;
  onCheckout: (branch: BranchInfo) => void;
  onRename?: (branch: BranchInfo) => void;
  onDelete?: (branch: BranchInfo) => void;
  onUpstream?: (branch: BranchInfo) => void;
  onPush?: (branch: BranchInfo) => void;
  onPull?: (branch: BranchInfo) => void;
  onCopy: (name: string) => void;
}) {
  if (branches.length === 0) return null;
  return (
    <section>
      <div className={styles.groupLabel}><span>{title}</span><span>{total}</span></div>
      {branches.map((branch) => (
        <div key={branch.refName} className={styles.branchRow} data-active={branch.current}>
          <span>{branch.current ? "●" : ""}</span>
          <span>
            <Text span size="sm">{branch.name}</Text>
            {branch.primary ? (
              <Text span size="xs" c="blue" title="This is the repository default branch. It comes from the remote HEAD, then from git init.defaultBranch, then from Settings.">
                {" "}default
              </Text>
            ) : null}
            {branch.pushProtected ? (
              <Text span size="xs" c="orange" title="Hosts usually reject a direct push to the default branch. Git does not store that rule in the repository, so this mark follows the default branch.">
                {" "}push protected
              </Text>
            ) : null}
            <Text span size="xs" c="dimmed"> {branch.subject}</Text>
            {branch.upstream ? <Text span size="xs" c="dimmed"> {branch.upstreamGone ? `${branch.upstream} gone` : branch.upstream}</Text> : null}
            {branch.ahead != null || branch.behind != null ? <Text span size="xs"> ↑{branch.ahead ?? 0} ↓{branch.behind ?? 0}</Text> : null}
          </span>
          <span>
            {!branch.current ? <Button size="compact-xs" variant="subtle" onClick={() => onCheckout(branch)}>Checkout</Button> : null}
            {onPull ? <Button size="compact-xs" variant="subtle" onClick={() => onPull(branch)}>Pull</Button> : null}
            {onPush ? <Button size="compact-xs" variant="subtle" onClick={() => onPush(branch)}>Push</Button> : null}
            {onRename ? <Button size="compact-xs" variant="subtle" onClick={() => onRename(branch)}>Rename</Button> : null}
            {onUpstream ? <Button size="compact-xs" variant="subtle" onClick={() => onUpstream(branch)}>Upstream</Button> : null}
            {onDelete ? <Button size="compact-xs" variant="subtle" color="red" onClick={() => onDelete(branch)}>Delete</Button> : null}
            <Button size="compact-xs" variant="subtle" onClick={() => onCopy(branch.name)}>Copy</Button>
          </span>
        </div>
      ))}
    </section>
  );
}

export function RemoteList({
  remotes,
  progress,
  activeRemote,
  onFetch,
  onRemove,
}: {
  remotes: RemoteInfo[];
  progress?: string;
  activeRemote?: string;
  onFetch: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  if (remotes.length === 0) return <Text p="sm" c="dimmed">No remotes.</Text>;
  return (
    <div className={styles.scroll}>
      {remotes.map((remote) => (
        <div key={remote.name} className={styles.branchRow}>
          <span />
          <span>
            <Text span size="sm">{remote.name}</Text>
            <Text span size="xs" c="dimmed"> {remote.fetchUrl}</Text>
          </span>
          <span>
            <BusyButton size="compact-xs" variant="subtle" busy={activeRemote === remote.name} label="Fetch" progress={progress} onClick={() => onFetch(remote.name)} />
            <Button size="compact-xs" variant="subtle" color="red" onClick={() => onRemove(remote.name)}>Remove</Button>
          </span>
        </div>
      ))}
    </div>
  );
}

export function TagList({
  tags,
  query,
  onSelect,
  onDelete,
  onPush,
  onCompare,
}: {
  tags: TagInfo[];
  query: string;
  onSelect: (tag: TagInfo) => void;
  onDelete: (tag: TagInfo) => void;
  onPush: (tag: TagInfo) => void;
  onCompare: (tag: TagInfo) => void;
}) {
  const needle = query.trim().toLowerCase();
  const visible = tags.filter((tag) => tag.name.toLowerCase().includes(needle) || tag.message.toLowerCase().includes(needle));
  const windowed = useScreenWindow(visible.length, 30, needle);
  if (visible.length === 0) return <Text p="sm" c="dimmed">No matching tags.</Text>;
  return (
    <div ref={windowed.ref} className={styles.scroll}>
      {visible.slice(0, windowed.limit).map((tag) => (
        <button key={tag.name} className={styles.branchRow} onClick={() => onSelect(tag)}>
          <span>{tag.annotated ? "A" : "L"}</span>
          <span>
            <Text span size="sm">{tag.name}</Text>
            <Text span size="xs" className={styles.mono}> {tag.commit.slice(0, 10)}</Text>
            {tag.message ? <Text span size="xs" c="dimmed"> {tag.message}</Text> : null}
          </span>
          <span onClick={(event) => event.stopPropagation()}>
            <Button size="compact-xs" variant="subtle" onClick={() => onCompare(tag)}>Compare</Button>
            <Button size="compact-xs" variant="subtle" onClick={() => onPush(tag)}>Push</Button>
            <Button size="compact-xs" variant="subtle" color="red" onClick={() => onDelete(tag)}>Delete</Button>
          </span>
        </button>
      ))}
      {windowed.hasMore ? <Button fullWidth variant="subtle" onClick={windowed.loadMore}>Load more</Button> : null}
    </div>
  );
}

export function StashList({
  stashes,
  selected,
  onSelect,
  onApply,
  onPop,
  onDrop,
}: {
  stashes: StashInfo[];
  selected?: number | null;
  onSelect: (stash: StashInfo) => void;
  onApply: (stash: StashInfo) => void;
  onPop: (stash: StashInfo) => void;
  onDrop: (stash: StashInfo) => void;
}) {
  const windowed = useScreenWindow(stashes.length, 30, String(stashes.length));
  if (stashes.length === 0) return <Text p="sm" c="dimmed">No stashes.</Text>;
  return (
    <div ref={windowed.ref} className={styles.scroll}>
      {stashes.slice(0, windowed.limit).map((stash) => (
        <button key={stash.commit} className={styles.branchRow} data-active={selected === stash.index} onClick={() => onSelect(stash)}>
          <span>{stash.index}</span>
          <span>
            <Text span size="sm">{stash.message}</Text>
            <Text span size="xs" c="dimmed"> {stash.reference}</Text>
          </span>
          <span onClick={(event) => event.stopPropagation()}>
            <Button size="compact-xs" variant="subtle" onClick={() => onApply(stash)}>Apply</Button>
            <Button size="compact-xs" variant="subtle" onClick={() => onPop(stash)}>Pop</Button>
            <Button size="compact-xs" variant="subtle" color="red" onClick={() => onDrop(stash)}>Drop</Button>
          </span>
        </button>
      ))}
      {windowed.hasMore ? <Button fullWidth variant="subtle" onClick={windowed.loadMore}>Load more</Button> : null}
    </div>
  );
}
