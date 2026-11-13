import { Button, Text } from "@mantine/core";
import { useState } from "react";
import type { OperationRecord } from "../../types/git";
import styles from "../../styles/app.module.css";

export function OperationLog({
  entries,
  onClear,
}: {
  entries: OperationRecord[];
  onClear: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const current = entries.find((entry) => entry.id === selected) ?? entries[entries.length - 1];
  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <Text size="xs" fw={650}>Git operations</Text>
        <Button size="compact-xs" variant="subtle" onClick={onClear}>Clear</Button>
      </div>
      <div className={styles.scroll}>
        {entries.length === 0 ? <Text size="xs" c="dimmed" p="xs">Commands run by Git Desktop appear here.</Text> : null}
        {[...entries].reverse().map((entry) => (
          <button key={entry.id} className={styles.logRow} data-failed={!entry.success} data-active={current?.id === entry.id} onClick={() => setSelected(entry.id)}>
            <span className={styles.meta}>{localClock(entry.timestamp)}</span>
            <span>{entry.operation}</span>
            <span className={styles.tabName}>{entry.repository ?? ""}</span>
            <span className={styles.tabName}>{entry.display}</span>
            <span>{entry.success ? "ok" : "fail"}</span>
            <span className={styles.meta}>{entry.durationMs} ms</span>
          </button>
        ))}
      </div>
      {current ? (
        <pre className={styles.output}>
          {`$ ${current.display}\nexit ${current.exitCode ?? "—"}\n${current.stdout}${current.stderr ? `\n${current.stderr}` : ""}`}
        </pre>
      ) : null}
    </div>
  );
}

function localClock(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
