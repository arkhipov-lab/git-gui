import { Button, Menu, Text } from "@mantine/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import { layoutGraph } from "../../features/history/graph";
import type { CommitSummary } from "../../types/git";
import styles from "../../styles/app.module.css";

const COLORS = ["#4ea1ff", "#3fb950", "#d29922", "#bc8cff", "#ff7b72", "#79c0ff", "#ffa657", "#7ee787"];

export function HistoryView({
  commits,
  selected,
  hasMore,
  loadingMore,
  query,
  onSelect,
  onLoadMore,
  onCreateBranch,
  onCopy,
  onCompare,
  onSoftReset,
  onRevert,
  onCherryPick,
  onPickedCount,
  onPicked,
  contained,
  pickOnly,
}: {
  commits: CommitSummary[];
  selected?: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  query: string;
  onSelect: (hash: string) => void;
  onLoadMore: () => void;
  onCreateBranch: (hash: string) => void;
  onCopy: (value: string) => void;
  onCompare: (hash: string) => void;
  onSoftReset: (commits: CommitSummary[]) => void;
  onRevert: (commits: CommitSummary[]) => void;
  onCherryPick: (commits: CommitSummary[]) => void;
  onPickedCount?: (count: number) => void;
  onPicked?: (commits: CommitSummary[]) => void;
  contained?: boolean;
  pickOnly?: boolean;
}) {
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? commits.filter((commit) =>
        `${commit.subject} ${commit.authorName} ${commit.shortHash} ${commit.hash} ${commit.refs.map((ref) => ref.name).join(" ")}`
          .toLowerCase()
          .includes(needle),
      )
    : commits;
  const graph = layoutGraph(visible.map((commit) => ({ hash: commit.hash, parents: commit.parents })));
  const parentRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const onPickedCountRef = useRef(onPickedCount);
  const onPickedRef = useRef(onPicked);
  const commitsRef = useRef(commits);
  onSelectRef.current = onSelect;
  onPickedCountRef.current = onPickedCount;
  onPickedRef.current = onPicked;
  commitsRef.current = commits;
  const pickedKey = picked.join("\0");
  useEffect(() => {
    const hashes = pickedKey ? pickedKey.split("\0") : [];
    onPickedCountRef.current?.(hashes.length);
    const chosen = commitsRef.current.filter((commit) => hashes.includes(commit.hash));
    onPickedRef.current?.(oldestFirst(chosen, commitsRef.current));
    if (hashes.length === 1) onSelectRef.current(hashes[0]);
  }, [pickedKey]);
  const [menu, setMenu] = useState<{ x: number; y: number; hash: string; shortHash: string } | null>(null);
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 16,
  });
  const chosen = (hash: string) => {
    const hashes = picked.includes(hash) ? picked : [hash];
    return visible.filter((commit) => hashes.includes(commit.hash));
  };
  const selectedCommits = visible.filter((commit) => picked.includes(commit.hash));
  return (
    <div className={styles.panel} style={contained ? { height: "auto", flex: "1 1 auto" } : undefined}>
      <div className={styles.toolbar}>
        <Text size="xs" c="dimmed">
          {picked.length > 1 ? `${picked.length} commits selected` : "Shift-click selects from here up. ⌘-click adds one."}
        </Text>
        {pickOnly ? null : <Button size="compact-xs" variant="subtle" disabled={selectedCommits.length === 0} onClick={() => onCherryPick(oldestFirst(selectedCommits, visible))}>Cherry-pick</Button>}
        {pickOnly ? null : <Button size="compact-xs" variant="subtle" disabled={selectedCommits.length === 0} onClick={() => onRevert(selectedCommits)}>Revert</Button>}
        {pickOnly ? null : <Button size="compact-xs" variant="subtle" disabled={selectedCommits.length === 0} onClick={() => onSoftReset(oldestFirst(selectedCommits, visible))}>Reset --soft</Button>}
      </div>
      <div ref={parentRef} className={styles.scroll}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const commit = visible[item.index];
            const point = graph[item.index];
            if (!commit || !point) return null;
            return (
              <button
                key={commit.hash}
                className={styles.commitRow}
                data-active={picked.length > 0 ? picked.includes(commit.hash) : selected === commit.hash}
                style={{ position: "absolute", top: 0, transform: `translateY(${item.start}px)`, width: "100%" }}
                onClick={(event) => {
                  if (event.shiftKey) {
                    const from = anchor.current ? visible.findIndex((item) => item.hash === anchor.current) : 0;
                    const start = Math.min(from < 0 ? 0 : from, item.index);
                    const end = Math.max(from < 0 ? 0 : from, item.index);
                    setPicked(visible.slice(start, end + 1).map((item) => item.hash));
                    onSelect(commit.hash);
                    return;
                  }
                  anchor.current = commit.hash;
                  if (event.metaKey || event.ctrlKey) {
                    setPicked((current) => current.includes(commit.hash) ? current.filter((hash) => hash !== commit.hash) : [...current, commit.hash]);
                    return;
                  }
                  setPicked([commit.hash]);
                  onSelect(commit.hash);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ x: event.clientX, y: event.clientY, hash: commit.hash, shortHash: commit.shortHash });
                }}
              >
                <GraphGlyph lane={point.lane} color={point.color} columns={point.columns} links={point.links} />
                <span className={`${styles.mono} ${styles.commitHash}`}>{commit.shortHash}</span>
                <span className={`${styles.tabName} ${styles.commitClip}`}>
                  {commit.refs.map((ref) => (
                    <Text key={`${ref.kind}-${ref.name}`} span size="xs" c={ref.head ? "blue" : "dimmed"} mr={4}>
                      {ref.head ? `HEAD→${ref.name}` : ref.name}
                    </Text>
                  ))}
                  {commit.subject}
                </span>
                <span className={`${styles.meta} ${styles.commitClip}`}>{commit.authorName}</span>
                <span className={`${styles.meta} ${styles.commitClip}`}>{formatDate(commit.authorDate)}</span>
              </button>
            );
          })}
        </div>
        {hasMore ? (
          <Button fullWidth variant="subtle" loading={loadingMore} onClick={onLoadMore}>Load more commits</Button>
        ) : null}
      </div>
      <Menu opened={menu != null} onClose={() => setMenu(null)} withinPortal position="bottom-start">
        <Menu.Target>
          <div style={{ position: "fixed", left: menu?.x ?? 0, top: menu?.y ?? 0, width: 1, height: 1 }} />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => menu && onCopy(menu.hash)}>Copy full hash</Menu.Item>
          <Menu.Item onClick={() => menu && onCopy(menu.shortHash)}>Copy short hash</Menu.Item>
          <Menu.Item onClick={() => menu && onSelect(menu.hash)}>View changes</Menu.Item>
          <Menu.Item onClick={() => menu && onCreateBranch(menu.hash)}>Create branch from commit</Menu.Item>
          <Menu.Item onClick={() => menu && onCompare(menu.hash)}>Compare with HEAD</Menu.Item>
          {pickOnly ? null : (
            <>
              <Menu.Divider />
              <Menu.Item onClick={() => menu && onCherryPick(oldestFirst(chosen(menu.hash), visible))}>
                Cherry-pick{menu && chosen(menu.hash).length > 1 ? ` (${chosen(menu.hash).length})` : ""}
              </Menu.Item>
              <Menu.Item onClick={() => menu && onRevert(chosen(menu.hash))}>
                Revert{menu && chosen(menu.hash).length > 1 ? ` (${chosen(menu.hash).length})` : ""}
              </Menu.Item>
              <Menu.Item onClick={() => menu && onSoftReset(oldestFirst(chosen(menu.hash), visible))}>Reset --soft</Menu.Item>
              <Menu.Item disabled>Interactive rebase</Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

function GraphGlyph({
  lane,
  color,
  columns,
  links,
}: {
  lane: number;
  color: number;
  columns: Array<{ lane: number; color: number; top: boolean; bottom: boolean }>;
  links: Array<{ from: number; to: number; color: number }>;
}) {
  const height = 32;
  const gap = 12;
  const x = (value: number) => 8 + value * gap;
  const width = Math.max(lane + 1, ...columns.map((column) => column.lane + 1), 1) * gap + 10;
  const mid = height / 2;
  const paint = (index: number) => COLORS[index % COLORS.length];
  return (
    <svg className={styles.graph} width={width} height={height} aria-hidden="true">
      {columns.map((column) => (
        <line
          key={column.lane}
          x1={x(column.lane)}
          x2={x(column.lane)}
          y1={column.top ? 0 : mid}
          y2={column.bottom ? height : mid}
          stroke={paint(column.color)}
          strokeWidth="1.5"
        />
      ))}
      {links.filter((link) => link.from !== link.to).map((link, index) => (
        <path
          key={index}
          d={`M ${x(link.from)} ${mid} C ${x(link.from)} ${height}, ${x(link.to)} ${mid}, ${x(link.to)} ${height}`}
          fill="none"
          stroke={paint(link.color)}
          strokeWidth="1.5"
        />
      ))}
      <circle cx={x(lane)} cy={mid} r="4" fill={paint(color)} />
    </svg>
  );
}

function oldestFirst(commits: CommitSummary[], visible: CommitSummary[]): CommitSummary[] {
  return [...commits].sort((left, right) => visible.findIndex((commit) => commit.hash === right.hash) - visible.findIndex((commit) => commit.hash === left.hash));
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
