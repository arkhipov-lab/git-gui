export function joinRepoPath(root: string, relative: string): string {
  if (relative.startsWith("/")) return relative;
  return `${root.replace(/\/+$/, "")}/${relative}`;
}

export function parentDirectory(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : trimmed.slice(0, index);
}
