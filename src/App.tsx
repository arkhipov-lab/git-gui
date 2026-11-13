import { Button } from "@mantine/core";
import { Workspace } from "./app/Workspace";
import { useDesktopSession } from "./app/useDesktopSession";
import { GitErrorView } from "./components/common/GitErrorView";
import { WorkspaceDialogs } from "./components/dialogs/WorkspaceDialogs";
import { SettingsView } from "./components/settings/SettingsView";
import { useUiStore } from "./stores/uiStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import styles from "./styles/app.module.css";

export default function App() {
  const session = useDesktopSession();
  const view = useUiStore((state) => state.view);
  const dialog = useUiStore((state) => state.dialog);
  const active = useWorkspaceStore((state) => state.active);
  const activeError = useUiStore((state) => (active ? state.errors[active] : null));
  return (
    <div className={styles.shell}>
      {session.notice ? <GitErrorView error={session.notice} /> : null}
      {view === "settings" ? (
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <Button size="compact-sm" variant="subtle" onClick={() => useUiStore.getState().setView("workspace")}>Back</Button>
          </div>
          <SettingsView />
        </div>
      ) : (
        <Workspace onOpen={() => void session.openRepository()} />
      )}
      <WorkspaceDialogs />
      {dialog && activeError ? (
        <div style={{ position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 400, background: "var(--mantine-color-body)", border: "1px solid var(--mantine-color-default-border)" }}>
          <GitErrorView error={activeError} onClose={() => active && useUiStore.getState().setError(active, null)} />
        </div>
      ) : null}
    </div>
  );
}
