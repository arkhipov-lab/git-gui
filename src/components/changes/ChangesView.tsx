import { Button, Group, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { groupChanges, statusLetter } from "../../features/changes/groups";
import { useScreenWindow } from "../../features/lists/window";
import type { FileDiffKind, FileEntry, RepoStatus } from "../../types/git";
import styles from "../../styles/app.module.css";

type Side = "staged" | "unstaged" | "untracked" | "conflict" | "ignored";

export function ChangesView({
  status,
  selected,
  selectedKind,
  query,
  onSelect,
  onClear,
  onStage,
  onUnstage,
  onDiscard,
  onOpen,
  onCopy,
}: {
  status: RepoStatus;
  selected?: string;
  selectedKind?: FileDiffKind;
  query: string;
  onSelect: (file: FileEntry, kind: FileDiffKind) => void;
  onClear: () => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (paths: string[]) => void;
  onOpen: (path: string) => void;
  onCopy: (path: string) => void;
}) {
  const groups = groupChanges(status.files);
  const match = (file: FileEntry) => file.path.toLowerCase().includes(query.toLowerCase());
  const lists: Record<Side, FileEntry[]> = {
    conflict: groups.conflicts.filter(match),
    staged: groups.staged.filter(match),
    unstaged: groups.unstaged.filter(match),
    untracked: groups.untracked.filter(match),
    ignored: groups.ignored.filter(match),
  };
  const [picked, setPicked] = useState<{ side: Side; paths: string[] } | null>(null);
  const anchor = useRef<{ side: Side; path: string } | null>(null);
  const hadPick = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onClearRef = useRef(onClear);
  onSelectRef.current = onSelect;
  onClearRef.current = onClear;
  const chosen = picked ? picked.paths.filter((path) => lists[picked.side].some((file) => file.path === path)) : [];
  const selectionKey = picked ? `${picked.side}:${chosen.join("\0")}` : "";
  useEffect(() => {
    if (!picked || chosen.length !== 1) {
      if (hadPick.current) onClearRef.current();
      hadPick.current = false;
      return;
    }
    hadPick.current = true;
    const file = lists[picked.side].find((item) => item.path === chosen[0]);
    if (file) onSelectRef.current(file, kindFor(picked.side));
  }, [selectionKey]);
  const multiple = chosen.length > 1;
  const totalFiles = lists.conflict.length + lists.staged.length + lists.unstaged.length + lists.untracked.length + lists.ignored.length;
  const windowed = useScreenWindow(totalFiles, 30, query);
  let remaining = windowed.limit;
  const conflict = lists.conflict.slice(0, remaining);
  remaining -= conflict.length;
  const staged = lists.staged.slice(0, Math.max(0, remaining));
  remaining -= staged.length;
  const unstaged = lists.unstaged.slice(0, Math.max(0, remaining));
  remaining -= unstaged.length;
  const untracked = lists.untracked.slice(0, Math.max(0, remaining));
  remaining -= untracked.length;
  const ignored = lists.ignored.slice(0, Math.max(0, remaining));
  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <Button size="compact-xs" variant="light" onClick={() => onStage(stageable(status))}>Add all</Button>
        {multiple && (picked?.side === "unstaged" || picked?.side === "untracked") ? (
          <Button size="compact-xs" variant="light" onClick={() => onStage(chosen)}>Add selected</Button>
        ) : null}
        {multiple && (picked?.side === "unstaged" || picked?.side === "untracked") ? (
          <Button size="compact-xs" color="red" variant="subtle" onClick={() => onDiscard(chosen)}>Restore selected</Button>
        ) : null}
        <Button size="compact-xs" variant="default" onClick={() => onUnstage(status.files.filter((file) => file.staged).map((file) => file.path))}>Reset all</Button>
        {multiple && picked?.side === "staged" ? (
          <Button size="compact-xs" variant="default" onClick={() => onUnstage(chosen)}>Reset selected</Button>
        ) : null}
        <Text size="xs" c="dimmed">{multiple ? `${chosen.length} files selected` : "Shift-click selects a range. ⌘-click adds one file in the same list."}</Text>
      </div>
      <div ref={windowed.ref} className={styles.scroll}>
        <FileGroup title="Conflicts" side="conflict" files={conflict} total={lists.conflict.length} picked={picked} chosen={chosen} selected={selected} selectedKind={selectedKind} multiple={multiple} onPick={pick} onOpen={onOpen} onCopy={onCopy} />
        <FileGroup title="Staged" side="staged" files={staged} total={lists.staged.length} picked={picked} chosen={chosen} selected={selected} selectedKind={selectedKind} multiple={multiple} onPick={pick} onOpen={onOpen} onCopy={onCopy} onAction={(path) => onUnstage([path])} actionLabel="Reset" />
        <FileGroup title="Unstaged" side="unstaged" files={unstaged} total={lists.unstaged.length} picked={picked} chosen={chosen} selected={selected} selectedKind={selectedKind} multiple={multiple} onPick={pick} onOpen={onOpen} onCopy={onCopy} onAction={(path) => onStage([path])} actionLabel="Add" onDiscard={onDiscard} />
        <FileGroup title="Untracked" side="untracked" files={untracked} total={lists.untracked.length} picked={picked} chosen={chosen} selected={selected} selectedKind={selectedKind} multiple={multiple} onPick={pick} onOpen={onOpen} onCopy={onCopy} onAction={(path) => onStage([path])} actionLabel="Add" onDiscard={onDiscard} />
        <FileGroup title="Ignored" side="ignored" files={ignored} total={lists.ignored.length} picked={picked} chosen={chosen} selected={selected} selectedKind={selectedKind} multiple={multiple} onPick={pick} onOpen={onOpen} onCopy={onCopy} />
        {windowed.hasMore ? <Button fullWidth variant="subtle" onClick={windowed.loadMore}>Load more</Button> : null}
      </div>
    </div>
  );

  function pick(side: Side, index: number, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
    const files = lists[side];
    const file = files[index];
    if (!file) return;
    const sameList = picked?.side === side;
    if (event.shiftKey && (anchor.current == null || anchor.current.side === side)) {
      const from = anchor.current?.side === side ? files.findIndex((item) => item.path === anchor.current?.path) : 0;
      const start = Math.min(from < 0 ? 0 : from, index);
      const end = Math.max(from < 0 ? 0 : from, index);
      setPicked({ side, paths: files.slice(start, end + 1).map((item) => item.path) });
      return;
    }
    anchor.current = { side, path: file.path };
    if ((event.metaKey || event.ctrlKey) && sameList && picked) {
      const paths = picked.paths.includes(file.path) ? picked.paths.filter((path) => path !== file.path) : [...picked.paths, file.path];
      setPicked(paths.length ? { side, paths } : null);
      return;
    }
    setPicked({ side, paths: [file.path] });
  }
}

function stageable(status: RepoStatus): string[] {
  return status.files.filter((file) => !file.ignored && (file.unstaged || file.untracked || file.unmerged)).map((file) => file.path);
}

function kindFor(side: Side): FileDiffKind {
  if (side === "staged") return "staged";
  if (side === "untracked" || side === "ignored") return "untracked";
  return "unstaged";
}

function FileGroup({
  title,
  files,
  total,
  side,
  picked,
  chosen,
  selected,
  selectedKind,
  multiple,
  onPick,
  onAction,
  actionLabel,
  onDiscard,
  onOpen,
  onCopy,
}: {
  title: string;
  files: FileEntry[];
  total: number;
  side: Side;
  picked: { side: Side; paths: string[] } | null;
  chosen: string[];
  selected?: string;
  selectedKind?: FileDiffKind;
  multiple: boolean;
  onPick: (side: Side, index: number, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onAction?: (path: string) => void;
  actionLabel?: string;
  onDiscard?: (paths: string[]) => void;
  onOpen: (path: string) => void;
  onCopy: (path: string) => void;
}) {
  if (files.length === 0) return null;
  const kind = kindFor(side);
  return (
    <section>
      <div className={styles.groupLabel}><span>{title}</span><span>{total}</span></div>
      {files.map((file, index) => {
        const active = picked?.side === side ? chosen.includes(file.path) : selected === file.path && selectedKind === kind;
        return (
          <div
            key={`${title}-${file.path}`}
            className={styles.fileRow}
            data-active={active}
            role="button"
            tabIndex={0}
            onClick={(event) => onPick(side, index, event)}
            onKeyDown={(event) => { if (event.key === "Enter") onPick(side, index, event); }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <span className={`${styles.letter} ${letterClass(statusLetter(file, letterSide(side)))}`}>{statusLetter(file, letterSide(side))}</span>
            <span className={styles.tabName} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}>
              {file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}
              {side === "conflict" ? <Text span size="xs" c={file.conflictMarkers ? "red" : "green"}> {file.conflictMarkers ? "(unresolved)" : "(resolved)"}</Text> : null}
            </span>
            {multiple ? null : (
              <Group gap={4}>
                {onAction && actionLabel ? <Button size="compact-xs" variant="subtle" onClick={(event) => { event.stopPropagation(); onAction(file.path); }}>{actionLabel}</Button> : null}
                {onDiscard ? <Button size="compact-xs" variant="subtle" color="red" onClick={(event) => { event.stopPropagation(); onDiscard([file.path]); }}>Restore</Button> : null}
                <Button size="compact-xs" variant="subtle" onClick={(event) => { event.stopPropagation(); onOpen(file.path); }}>Open</Button>
                <Button size="compact-xs" variant="subtle" onClick={(event) => { event.stopPropagation(); onCopy(file.path); }}>Copy</Button>
              </Group>
            )}
          </div>
        );
      })}
    </section>
  );
}

function letterSide(side: Side): "staged" | "unstaged" | "untracked" | "conflict" {
  if (side === "ignored") return "untracked";
  return side;
}

function letterClass(letter: string): string {
  if (letter === "A" || letter === "?") return styles.added;
  if (letter === "D") return styles.removed;
  return styles.modified;
}
