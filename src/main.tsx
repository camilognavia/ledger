import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./style.css";
function Root() {
  const [status, setStatus] = useState("Preparing offline files…");
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [updateSW] = useState(() =>
    registerSW({
      onOfflineReady() {
        setStatus(
          "Ready offline. Application files are cached on this device.",
        );
      },
      onNeedRefresh() {
        setNeedsUpdate(true);
        setStatus("An update is ready. Finish your entry before updating.");
      },
      onRegisterError() {
        setStatus(
          "Offline setup failed. Reopen online over HTTPS and try again.",
        );
      },
      onRegisteredSW(_url, registration) {
        if (registration?.active) {
          setStatus("Offline worker active. Verify once in airplane mode.");
        }
      },
    }),
  );
  return (
    <App
      pwa={{
        status,
        update: needsUpdate ? () => void updateSW(true) : undefined,
      }}
    />
  );
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="loading">
        <h1>Ledger could not display this page</h1>
        <p>Your stored data has not been cleared.</p>
        <button onClick={() => location.reload()}>Reload Ledger</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Root />
  </ErrorBoundary>,
);
