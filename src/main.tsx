import { MantineProvider, createTheme } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useSettingsStore } from "./stores/settingsStore";
import "@mantine/core/styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

const theme = createTheme({
  primaryColor: "blue",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyMonospace: "ui-monospace, SFMono-Regular, Menlo, monospace",
  defaultRadius: "sm",
});

function Root() {
  const colorScheme = useSettingsStore((state) => state.theme);
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider forceColorScheme={colorScheme} theme={theme}>
        <App />
      </MantineProvider>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
