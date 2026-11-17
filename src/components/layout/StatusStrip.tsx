import { Text } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { operationLabel } from "../../features/changes/groups";
import type { OperationRecord, RepoStatus } from "../../types/git";
import styles from "../../styles/app.module.css";

export function StatusStrip({
  status,
  busy,
  last,
  progress,
  primary,
  children,
}: {
  status?: RepoStatus;
  busy?: string;
  last?: OperationRecord;
  progress?: string;
  primary?: boolean;
  children?: ReactNode;
}) {
  if (!status) {
    return (
      <div className={styles.strip}>
        <div className={styles.stripInfo}>
          <Text size="xs" c="dimmed">No repository selected</Text>
        </div>
        {children}
      </div>
    );
  }
  const branch = status.detached ? "detached HEAD" : status.unborn ? `${status.branch ?? "main"} (no commits)` : status.branch ?? "unknown";
  const copyName = status.detached ? "HEAD" : (status.branch ?? "HEAD");
  return (
    <div className={styles.strip} aria-label="Repository status">
      <div className={styles.stripInfo}>
      <Text size="xs">{branch}</Text>
      <CopyBranch name={copyName} />
      {primary ? <Text size="xs" c="blue">default</Text> : null}
      {primary ? <Text size="xs" c="orange">push protected</Text> : null}
      <Text size="xs" className={styles.meta}>
        {status.upstream ? `upstream ${status.upstream}` : "no upstream"}
      </Text>
      <Text size="xs" className={styles.added}>{status.ahead != null ? `↑${status.ahead}` : ""}</Text>
      <Text size="xs" className={styles.removed}>{status.behind != null ? `↓${status.behind}` : ""}</Text>
      <Text size="xs">staged {status.stagedCount}</Text>
      <Text size="xs">unstaged {status.unstagedCount}</Text>
      <Text size="xs">untracked {status.untrackedCount}</Text>
      <Text size="xs" c={status.conflictCount > 0 ? "red" : undefined}>
        conflicts {status.conflictCount}
      </Text>
      <Text size="xs" fw={status.operation === "none" && !busy ? undefined : 650}>
        {busy ?? operationLabel(status.operation)}
      </Text>
      {progress ? <Text size="xs" className={styles.meta}>{progress}</Text> : null}
      {last ? (
        <Text size="xs" className={styles.meta}>
          last {last.operation} {last.success ? "succeeded" : "failed"}
        </Text>
      ) : null}
      </div>
      {children}
    </div>
  );
}

function CopyBranch({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label="Copy branch name"
      title={copied ? "Copied" : "Copy branch name"}
      onClick={() => {
        void navigator.clipboard.writeText(name).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <rect x="4" y="1" width="7" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="1" y="3" width="7" height="8" rx="1" fill="var(--mantine-color-body)" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </button>
  );
}
