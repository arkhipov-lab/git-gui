import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { api } from "../../services/git/api";
import styles from "../../styles/app.module.css";
import "@xterm/xterm/css/xterm.css";

export function XtermPane({
  id,
  active,
  onReady,
}: {
  id: string;
  active: boolean;
  onReady: (id: string, terminal: Terminal | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const term = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 12,
      cursorBlink: true,
      theme: { background: "#0d1117", foreground: "#e6edf3", cursor: "#e6edf3" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    readyRef.current(id, term);
    void api.terminalResize(id, term.rows, term.cols).catch(() => undefined);
    const written = term.onData((data) => {
      void api.terminalWrite(id, data).catch(() => undefined);
    });
    const observer = new ResizeObserver(() => {
      fit.fit();
      void api.terminalResize(id, term.rows, term.cols).catch(() => undefined);
    });
    observer.observe(element);
    return () => {
      written.dispose();
      observer.disconnect();
      readyRef.current(id, null);
      term.dispose();
      termRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    fit.fit();
    term.focus();
    void api.terminalResize(id, term.rows, term.cols).catch(() => undefined);
  }, [active, id]);

  return <div ref={host} className={styles.termHost} data-active={active ? "true" : "false"} />;
}
