export function baseName(path: string): string {
  const parts = path.split("/").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? path;
}

export function openTab(tabs: string[], path: string): { tabs: string[]; active: string } {
  if (tabs.includes(path)) return { tabs, active: path };
  return { tabs: [...tabs, path], active: path };
}

export function closeTab(
  tabs: string[],
  active: string | null,
  path: string,
): { tabs: string[]; active: string | null } {
  const index = tabs.indexOf(path);
  const next = tabs.filter((tab) => tab !== path);
  if (active !== path) return { tabs: next, active };
  return { tabs: next, active: next[index] ?? next[index - 1] ?? null };
}

export function moveTab(tabs: string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= tabs.length || toIndex >= tabs.length) return tabs;
  const next = tabs.slice();
  const [item] = next.splice(fromIndex, 1);
  if (!item) return tabs;
  next.splice(toIndex, 0, item);
  return next;
}

export function cycleTab(tabs: string[], active: string | null, direction: 1 | -1): string | null {
  if (tabs.length === 0) return null;
  const index = active ? tabs.indexOf(active) : 0;
  const start = index < 0 ? 0 : index;
  return tabs[(start + direction + tabs.length) % tabs.length] ?? null;
}

export function rememberRecent<T extends { path: string }>(recent: T[], entry: T, limit = 12): T[] {
  return [entry, ...recent.filter((item) => item.path !== entry.path)].slice(0, limit);
}
