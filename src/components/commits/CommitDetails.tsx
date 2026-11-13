import { Button, Group, Stack, Text } from "@mantine/core";
import type { CommitDetails as Details, NumstatFile } from "../../types/git";
import styles from "../../styles/app.module.css";

export function CommitDetails({
  details,
  selectedFile,
  onSelectFile,
  onCopy,
  onCreateBranch,
  onCompare,
}: {
  details?: Details;
  selectedFile?: string;
  onSelectFile: (path: string) => void;
  onCopy: (value: string) => void;
  onCreateBranch: () => void;
  onCompare: () => void;
}) {
  if (!details) return <Text p="sm" c="dimmed">Select a commit.</Text>;
  return (
    <Stack gap={6} p="sm">
      <Group gap={6}>
        <Button size="compact-xs" variant="subtle" onClick={() => onCopy(details.hash)}>Copy hash</Button>
        <Button size="compact-xs" variant="subtle" onClick={() => onCopy(details.shortHash)}>Copy short hash</Button>
        <Button size="compact-xs" variant="subtle" onClick={onCreateBranch}>Branch from commit</Button>
        <Button size="compact-xs" variant="subtle" onClick={onCompare}>Compare with HEAD</Button>
      </Group>
      <Text fw={650}>{details.subject}</Text>
      {details.body ? <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{details.body}</Text> : null}
      <Text size="xs" className={styles.mono}>{details.hash}</Text>
      <Text size="xs">Author {details.authorName} &lt;{details.authorEmail}&gt;</Text>
      <Text size="xs" c="dimmed">{details.authorDate}</Text>
      <Text size="xs">Committer {details.committerName} &lt;{details.committerEmail}&gt;</Text>
      <Text size="xs" c="dimmed">{details.committerDate}</Text>
      <Text size="xs">Parents {details.parents.join(", ") || "none"}</Text>
      <Text size="xs">
        {details.refs.length ? details.refs.map((ref) => ref.name).join(", ") : "No refs point directly at this commit."}
      </Text>
      <Text size="xs"><span className={styles.added}>+{details.insertions}</span> <span className={styles.removed}>-{details.deletions}</span></Text>
      {details.files.map((file) => (
        <FileStat key={`${file.originalPath ?? ""}-${file.path}`} file={file} active={selectedFile === file.path} onSelect={onSelectFile} />
      ))}
    </Stack>
  );
}

function FileStat({ file, active, onSelect }: { file: NumstatFile; active: boolean; onSelect: (path: string) => void }) {
  return (
    <button className={styles.fileRow} data-active={active} onClick={() => onSelect(file.path)}>
      <span className={styles.letter}>{file.binary ? "B" : "M"}</span>
      <span className={styles.tabName}>{file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}</span>
      <span className={styles.meta}>{file.binary ? "binary" : `+${file.additions} -${file.deletions}`}</span>
    </button>
  );
}
