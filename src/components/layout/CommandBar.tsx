import { Button, Loader, Menu, TextInput } from "@mantine/core";
import { useLayoutEffect, useRef, useState } from "react";
import styles from "../../styles/app.module.css";

interface Action {
  id: string;
  label: string;
  title: string;
  run: () => void;
}

export function CommandBar({
  disabled,
  search,
  onSearch,
  onRefresh,
  onFetch,
  onPull,
  onPush,
  onCommit,
  onBranch,
  onStash,
  onCherryPick,
  operation,
  onContinue,
  onSkip,
  onAbort,
  activity,
}: {
  disabled: boolean;
  search: string;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  onCommit: () => void;
  onBranch: () => void;
  onStash: () => void;
  onCherryPick: () => void;
  operation?: string;
  onContinue: () => void;
  onSkip: () => void;
  onAbort: () => void;
  activity?: { id: string; detail: string } | null;
}) {
  const recovery: Action[] = [];
  if (operation === "cherryPick" || operation === "revert" || operation === "rebase" || operation === "merge") {
    recovery.push({
      id: "continue",
      label: "Continue",
      title: operation === "merge"
        ? "Stage the resolved files, then git merge --continue. That commits the merge."
        : "Stage the resolved files, then continue. The current resolution is committed and the remaining commits follow.",
      run: onContinue,
    });
  }
  if (operation === "cherryPick" || operation === "revert" || operation === "rebase") {
    recovery.push({ id: "skip", label: "Skip", title: "Drop the commit that stopped and continue with the ones still queued.", run: onSkip });
  }
  if (operation === "cherryPick" || operation === "revert" || operation === "rebase" || operation === "merge") {
    recovery.push({ id: "abort", label: "Abort", title: "Stop the operation and put the branch back where it was.", run: onAbort });
  }
  const actions: Action[] = [
    ...recovery,
    { id: "refresh", label: "Refresh", title: "Reload branches, tags, commits, and status from this repository. Does not contact the remote.", run: onRefresh },
    { id: "fetch", label: "Fetch", title: "git fetch. Updates remote-tracking branches for the current upstream, or origin. Does not change the working tree.", run: onFetch },
    { id: "pull", label: "Pull", title: "Update the checked-out branch from its upstream.", run: onPull },
    { id: "push", label: "Push", title: "Send the selected branch to the remote.", run: onPush },
    { id: "commit", label: "Commit", title: "Commit the staged files.", run: onCommit },
    { id: "cherry-pick", label: "Cherry-pick", title: "Cherry-pick commits from another branch onto the checked-out branch.", run: onCherryPick },
    { id: "branch", label: "Branch", title: "Create a branch.", run: onBranch },
    { id: "stash", label: "Stash", title: "Stash working tree changes.", run: onStash },
  ];
  const host = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(actions.length);
  useLayoutEffect(() => {
    const node = host.current;
    const samples = measure.current;
    if (!node || !samples) return;
    const update = () => {
      const buttons = [...samples.children] as HTMLElement[];
      const searchWidth = (searchBox.current?.offsetWidth ?? 168) + 8;
      const moreWidth = 40;
      const available = node.clientWidth - searchWidth;
      const widths = buttons.map((button) => button.offsetWidth + 4);
      const total = widths.reduce((sum, width) => sum + width, 0);
      if (total <= available) {
        setVisible(buttons.length);
        return;
      }
      let used = moreWidth;
      let fit = 0;
      for (const width of widths) {
        if (used + width > available) break;
        used += width;
        fit += 1;
      }
      setVisible(fit);
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    return () => observer.disconnect();
  }, [actions.length, activity?.id, activity?.detail]);
  const shown = actions.slice(0, visible);
  const hidden = actions.slice(visible);
  return (
    <div ref={host} className={styles.commandBar}>
      <div ref={measure} aria-hidden style={{ position: "fixed", left: -10000, top: 0, visibility: "hidden", pointerEvents: "none", display: "flex", gap: 4 }}>
        {actions.map((action) => (
          <Button key={action.id} size="compact-sm" variant="subtle" title={action.title} style={activity?.id === action.id ? { maxWidth: 320 } : undefined} leftSection={activity?.id === action.id ? <Loader size={12} color="currentColor" /> : undefined}>
            {activity?.id === action.id ? activity.detail : action.label}
          </Button>
        ))}
      </div>
      {shown.map((action) => {
        const active = activity?.id === action.id;
        const remote = action.id === "fetch" || action.id === "pull" || action.id === "push";
        return (
          <Button
            key={action.id}
            size="compact-sm"
            variant="subtle"
            title={active ? activity?.detail : action.title}
            disabled={disabled || (activity != null && remote)}
            leftSection={active ? <Loader size={12} color="currentColor" /> : undefined}
            style={active ? { maxWidth: 320 } : undefined}
            onClick={action.run}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {active ? activity?.detail : action.label}
            </span>
          </Button>
        );
      })}
      {hidden.length > 0 ? (
        <Menu position="bottom-start">
          <Menu.Target>
            <Button size="compact-sm" variant="subtle" aria-label="More commands">…</Button>
          </Menu.Target>
          <Menu.Dropdown>
            {hidden.map((action) => (
              <Menu.Item key={action.id} disabled={disabled || activity?.id === action.id} onClick={action.run}>
                {activity?.id === action.id ? activity.detail : action.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      ) : null}
      <div ref={searchBox}>
        <TextInput
          id="repo-search"
          style={{ width: 168 }}
          placeholder="Search"
          value={search}
          onChange={(event) => onSearch(event.currentTarget.value)}
        />
      </div>
    </div>
  );
}
