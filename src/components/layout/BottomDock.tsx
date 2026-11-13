import { Button, Text } from "@mantine/core";
import { listen } from "@tauri-apps/api/event";
import type { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { api } from "../../services/git/api";
import type { OperationRecord } from "../../types/git";
import { XtermPane } from "../terminal/XtermPane";
import { OperationLog } from "./OperationLog";
import styles from "../../styles/app.module.css";

interface TermTab {
  id: string;
  repo: string;
  title: string;
}

export function BottomDock({
  repo,
  openRepos,
  entries,
  onClear,
}: {
  repo: string | null;
  openRepos: string[];
  entries: OperationRecord[];
  onClear: () => void;
}) {
  const [terms, setTerms] = useState<TermTab[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const terminals = useRef(new Map<string, Terminal>());
  const current = repo ? selected[repo] ?? "operations" : "operations";
  const visible = terms.filter((term) => term.repo === repo);

  useEffect(() => {
    const data = listen<{ id: string; data: string }>("terminal-data", (event) => {
      const bytes = Uint8Array.from(atob(event.payload.data), (char) => char.charCodeAt(0));
      terminals.current.get(event.payload.id)?.write(bytes);
    });
    const exit = listen<{ id: string }>("terminal-exit", (event) => {
      terminals.current.get(event.payload.id)?.write("\r\n[process exited]\r\n");
    });
    return () => {
      void Promise.all([data, exit]).then((stops) => stops.forEach((stop) => stop()));
    };
  }, []);

  useEffect(() => {
    const closed = terms.filter((term) => !openRepos.includes(term.repo));
    if (closed.length === 0) return;
    for (const term of closed) void api.terminalClose(term.id);
    setTerms((currentTerms) => currentTerms.filter((term) => openRepos.includes(term.repo)));
  }, [openRepos, terms]);

  return (
    <div className={styles.panel}>
      <div className={styles.dockTabs}>
        <Button size="compact-xs" variant={current === "operations" ? "light" : "subtle"} onClick={() => repo && setSelected((state) => ({ ...state, [repo]: "operations" }))}>
          Operations
        </Button>
        {visible.map((term, index) => (
          <Button key={term.id} size="compact-xs" variant={current === term.id ? "light" : "subtle"} onClick={() => repo && setSelected((state) => ({ ...state, [repo]: term.id }))}>
            {term.title || `Terminal ${index + 1}`}
            <Text span ml={6} role="button" aria-label={`Close ${term.title}`} onClick={(event) => { event.stopPropagation(); closeTerm(term.id); }}>×</Text>
          </Button>
        ))}
        <Button size="compact-xs" variant="subtle" disabled={!repo} onClick={() => void addTerminal()}>+ Terminal</Button>
      </div>
      <div className={styles.dockBody}>
        {current === "operations" ? <OperationLog entries={entries} onClear={onClear} /> : null}
        {terms.map((term) => (
          <XtermPane
            key={term.id}
            id={term.id}
            active={term.repo === repo && current === term.id}
            onReady={remember}
          />
        ))}
      </div>
    </div>
  );

  function remember(id: string, terminal: Terminal | null) {
    if (terminal) terminals.current.set(id, terminal);
    else terminals.current.delete(id);
  }

  async function addTerminal() {
    if (!repo) return;
    const id = await api.terminalOpen(repo);
    const count = terms.filter((term) => term.repo === repo).length + 1;
    setTerms((currentTerms) => [...currentTerms, { id, repo, title: `Terminal ${count}` }]);
    setSelected((state) => ({ ...state, [repo]: id }));
  }

  function closeTerm(id: string) {
    void api.terminalClose(id);
    setTerms((currentTerms) => currentTerms.filter((term) => term.id !== id));
    if (repo && selected[repo] === id) setSelected((state) => ({ ...state, [repo]: "operations" }));
  }
}
