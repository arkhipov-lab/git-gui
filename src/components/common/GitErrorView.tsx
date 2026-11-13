import { Code, Text } from "@mantine/core";
import type { GitError } from "../../types/git";
import styles from "../../styles/app.module.css";

export function GitErrorView({ error, onClose }: { error: GitError; onClose?: () => void }) {
  const command = [error.command, ...error.args].join(" ");
  return (
    <div className={styles.errorBanner} role="alert">
      <div className={styles.errorHeader}>
        <Text fw={650} size="sm">{error.operation} failed</Text>
        {onClose ? (
          <button type="button" className={styles.errorClose} aria-label="Dismiss error" onClick={onClose}>×</button>
        ) : null}
      </div>
      <div className={styles.errorBody}>
        <Text size="sm">{error.message}</Text>
        {error.repository ? <Text size="xs" c="dimmed">{error.repository}</Text> : null}
        <Code block className={styles.mono}>
          {command}
          {error.exitCode != null ? `\nexit ${error.exitCode}` : ""}
        </Code>
        {error.stderr ? <Code block>{error.stderr}</Code> : null}
        {error.stdout ? <Code block>{error.stdout}</Code> : null}
      </div>
    </div>
  );
}
