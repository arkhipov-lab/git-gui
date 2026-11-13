import { Button, SegmentedControl, Text } from "@mantine/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { highlightLine } from "../../features/diff/highlight";
import type { DiffHunk, DiffLine, DiffResult } from "../../types/git";
import styles from "../../styles/app.module.css";

interface Props {
  diff?: DiffResult;
  mode: "unified" | "split";
  onMode: (mode: "unified" | "split") => void;
  onStageHunk?: (raw: string) => void;
  onUnstageHunk?: (raw: string) => void;
  loading?: boolean;
}

export function DiffViewer({ diff, mode, onMode, onStageHunk, onUnstageHunk, loading }: Props) {
  if (loading) return <Text p="sm" c="dimmed">Loading diff…</Text>;
  if (!diff) return <Text p="sm" c="dimmed">Select a file to view its diff.</Text>;
  if (diff.binary) return <Text p="sm">Binary file. Hunk staging is not available.</Text>;
  if (diff.truncated) return <Text p="sm">{diff.message ?? "Diff truncated."}</Text>;
  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <Text size="xs" className={styles.meta}>{diff.path}</Text>
        <Text size="xs" className={styles.added}>+{diff.insertions}</Text>
        <Text size="xs" className={styles.removed}>-{diff.deletions}</Text>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(value) => onMode(value as "unified" | "split")}
          data={[
            { label: "Unified", value: "unified" },
            { label: "Split", value: "split" },
          ]}
        />
      </div>
      {mode === "split" ? (
        <SplitDiff hunks={diff.hunks} onStage={onStageHunk} onUnstage={onUnstageHunk} />
      ) : (
        <div className={styles.scroll}>
          {diff.hunks.length === 0 ? <Text p="sm" c="dimmed">No textual changes.</Text> : null}
          {diff.hunks.map((hunk, index) => (
            <HunkBlock
              key={`${hunk.header}-${index}`}
              hunk={hunk}
              onStage={onStageHunk ? () => onStageHunk(hunk.raw) : undefined}
              onUnstage={onUnstageHunk ? () => onUnstageHunk(hunk.raw) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HunkBlock({ hunk, onStage, onUnstage }: { hunk: DiffHunk; onStage?: () => void; onUnstage?: () => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: hunk.lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 18,
    overscan: 20,
  });
  const tall = hunk.lines.length > 250;
  return (
    <section>
      <HunkBar hunk={hunk} onStage={onStage} onUnstage={onUnstage} />
      {tall ? (
        <div ref={parentRef} style={{ height: 360, overflow: "auto" }}>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => (
              <div key={item.key} style={{ position: "absolute", top: 0, transform: `translateY(${item.start}px)`, width: "max-content", minWidth: "100%" }}>
                <UnifiedLine line={hunk.lines[item.index]} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        hunk.lines.map((line, index) => <UnifiedLine key={index} line={line} />)
      )}
    </section>
  );
}

function SplitDiff({
  hunks,
  onStage,
  onUnstage,
}: {
  hunks: DiffHunk[];
  onStage?: (raw: string) => void;
  onUnstage?: (raw: string) => void;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  function sync(source: HTMLDivElement | null, target: HTMLDivElement | null) {
    if (!source || !target || lock.current) return;
    lock.current = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    lock.current = false;
  }
  if (hunks.length === 0) return <Text p="sm" c="dimmed">No textual changes.</Text>;
  return (
    <div className={styles.splitView}>
      <div ref={leftRef} className={styles.splitPane} onScroll={() => sync(leftRef.current, rightRef.current)}>
        {hunks.map((hunk, index) => (
          <SplitSide key={`${hunk.header}-${index}`} hunk={hunk} side="left" />
        ))}
      </div>
      <div ref={rightRef} className={styles.splitPane} onScroll={() => sync(rightRef.current, leftRef.current)}>
        {hunks.map((hunk, index) => (
          <SplitSide
            key={`${hunk.header}-${index}`}
            hunk={hunk}
            side="right"
            onStage={onStage ? () => onStage(hunk.raw) : undefined}
            onUnstage={onUnstage ? () => onUnstage(hunk.raw) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function SplitSide({
  hunk,
  side,
  onStage,
  onUnstage,
}: {
  hunk: DiffHunk;
  side: "left" | "right";
  onStage?: () => void;
  onUnstage?: () => void;
}) {
  const rows = splitRows(hunk.lines);
  return (
    <>
      <HunkBar hunk={hunk} onStage={side === "right" ? onStage : undefined} onUnstage={side === "right" ? onUnstage : undefined} />
      {rows.map((row, index) => (
        <SplitLine key={index} line={side === "left" ? row.left : row.right} side={side} />
      ))}
    </>
  );
}

function HunkBar({ hunk, onStage, onUnstage }: { hunk: DiffHunk; onStage?: () => void; onUnstage?: () => void }) {
  return (
    <div className={styles.hunkHeader}>
      <span className={styles.tabName}>{hunk.header}</span>
      <span>
        {onStage ? <Button size="compact-xs" variant="subtle" onClick={onStage}>Add hunk</Button> : null}
        {onUnstage ? <Button size="compact-xs" variant="subtle" onClick={onUnstage}>Reset hunk</Button> : null}
      </span>
    </div>
  );
}

function UnifiedLine({ line }: { line: DiffLine | undefined }) {
  if (!line) return null;
  const className = line.kind === "add" ? styles.diffAdd : line.kind === "delete" ? styles.diffDel : undefined;
  const marker = line.kind === "add" ? "+" : line.kind === "delete" ? "-" : " ";
  return (
    <div className={`${styles.diffLine} ${styles.diff} ${className ?? ""}`}>
      <span className={styles.meta}>{line.oldLine ?? ""}</span>
      <span className={styles.meta}>{line.newLine ?? ""}</span>
      <span>{marker}</span>
      <span>{renderText(line.text)}</span>
    </div>
  );
}

function SplitLine({ line, side }: { line: DiffLine | null; side: "left" | "right" }) {
  if (!line || (side === "left" && line.kind === "add") || (side === "right" && line.kind === "delete")) {
    return <div className={`${styles.splitLine} ${styles.diff}`} />;
  }
  const className = line.kind === "add" ? styles.diffAdd : line.kind === "delete" ? styles.diffDel : undefined;
  const number = side === "left" ? line.oldLine : line.newLine;
  return (
    <div className={`${styles.splitLine} ${styles.diff} ${className ?? ""}`}>
      <span className={styles.meta}>{number ?? ""}</span>
      <span>{renderText(line.text)}</span>
    </div>
  );
}

function renderText(text: string) {
  return highlightLine(text).map((token, index) => (
    <span key={index} className={token.kind === "plain" ? undefined : styles[token.kind]}>
      {token.text}
    </span>
  ));
}

function splitRows(lines: DiffLine[]): Array<{ left: DiffLine | null; right: DiffLine | null }> {
  const rows: Array<{ left: DiffLine | null; right: DiffLine | null }> = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line || line.kind === "meta") {
      index += 1;
      continue;
    }
    if (line.kind === "context") {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }
    if (line.kind === "delete") {
      const deleted: DiffLine[] = [];
      while (lines[index]?.kind === "delete") {
        const current = lines[index];
        if (current) deleted.push(current);
        index += 1;
      }
      const added: DiffLine[] = [];
      while (lines[index]?.kind === "add") {
        const current = lines[index];
        if (current) added.push(current);
        index += 1;
      }
      const count = Math.max(deleted.length, added.length);
      for (let offset = 0; offset < count; offset += 1) {
        rows.push({ left: deleted[offset] ?? null, right: added[offset] ?? null });
      }
      continue;
    }
    rows.push({ left: null, right: line });
    index += 1;
  }
  return rows;
}
