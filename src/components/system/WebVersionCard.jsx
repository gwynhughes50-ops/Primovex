import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { BUILD_ID, buildLabel, newerVersionReady, refreshNow, runningAs } from "@/lib/appUpdate";

// "Which version is this phone on?" for the web app (iPhone Home Screen, browser): when this copy was made, whether it is the Home
// Screen app, and a button that checks for a newer one and loads it. The desktop and Android apps update by installing, so they
// don't show this.

const isNativeApp = () => Boolean(window.__TAURI_INTERNALS__) || import.meta.env.MODE === "android";

export default function WebVersionCard() {
  const [state, setState] = useState({ status: "idle" });
  if (isNativeApp()) return null;
  async function check() {
    setState({ status: "checking" });
    const newer = await newerVersionReady();
    setState({ status: newer ? "newer" : "current" });
  }
  return (
    <section className="rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4" aria-label="About this app">
      <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-[var(--medtrak-muted)]">This app</h2>
      <p className="text-sm">Version made <b>{BUILD_ID ? buildLabel() : "(development copy)"}</b>. You are using {runningAs()}.</p>
      {state.status === "current" && <p className="mt-2 rounded-2xl bg-emerald-500/10 p-2 text-sm font-semibold text-emerald-800" role="status">You have the latest version.</p>}
      {state.status === "newer" && <p className="mt-2 rounded-2xl bg-amber-400/20 p-2 text-sm font-semibold text-amber-900" role="status">A newer version is ready. Press Update now.</p>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={check} disabled={state.status === "checking"} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] font-bold disabled:opacity-40"><RefreshCw className="h-4 w-4" aria-hidden="true" /> {state.status === "checking" ? "Checking…" : "Check for updates"}</button>
        <button type="button" onClick={refreshNow} className="min-h-12 rounded-2xl bg-[var(--medtrak-accent)] font-bold text-white">Update now</button>
      </div>
    </section>
  );
}
