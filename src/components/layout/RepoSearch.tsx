import { Button, TextInput } from "@mantine/core";
import { useEffect, useRef } from "react";
import { searchKey, useUiStore } from "../../stores/uiStore";
import styles from "../../styles/app.module.css";

export function RepoSearch({ path, section }: { path: string; section: string }) {
  const key = searchKey(path, section);
  const draft = useUiStore((state) => state.searches[key]);
  const searchFocus = useUiStore((state) => state.searchFocus);
  const input = useRef<HTMLInputElement>(null);
  const open = draft?.open ?? false;
  const value = draft?.value ?? "";

  const focusedAt = useRef(0);
  useEffect(() => {
    if (!open || focusedAt.current === searchFocus) return;
    focusedAt.current = searchFocus;
    input.current?.focus();
    input.current?.select();
  }, [open, searchFocus]);

  if (!open) return null;
  return (
    <div className={styles.repoSearch} role="search">
      <TextInput
        id="repo-search"
        ref={input}
        className={styles.repoSearchInput}
        placeholder="Search"
        value={value}
        rightSection={value ? (
          <button type="button" className={styles.searchClear} aria-label="Clear search" title="Clear search" onMouseDown={(event) => event.preventDefault()} onClick={() => useUiStore.getState().setSearchValue(path, section, "")}>
            <span className={styles.searchClearMark}>+</span>
          </button>
        ) : null}
        rightSectionPointerEvents="auto"
        onChange={(event) => useUiStore.getState().setSearchValue(path, section, event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            useUiStore.getState().setSearchOpen(path, section, false);
          }
        }}
      />
      <Button size="compact-xs" variant="subtle" onClick={() => useUiStore.getState().setSearchOpen(path, section, false)}>Close</Button>
    </div>
  );
}
