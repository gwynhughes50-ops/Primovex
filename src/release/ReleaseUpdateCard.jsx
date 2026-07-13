import { useEffect, useState } from "react";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import {
  checkForDesktopUpdate,
  getInstalledVersion,
  getReleaseChannel,
  installDesktopUpdate,
} from "./updateService";

export default function ReleaseUpdateCard() {
  const [version, setVersion] = useState("…");
  const channel = getReleaseChannel();
  const [state, setState] = useState({ status: "idle", message: "" });

  useEffect(() => { getInstalledVersion().then(setVersion); }, []);

  const check = async () => {
    try {
      setState({ status: "checking", message: "Checking for updates…" });
      const result = await checkForDesktopUpdate();
      if (!result.supported) return setState({ status: "info", message: result.reason });
      if (!result.available) return setState({ status: "current", message: "Primovex is up to date." });
      setState({ status: "available", message: result.notes, result });
    } catch (error) {
      setState({ status: "error", message: error?.message || "Update check failed." });
    }
  };

  const install = async () => {
    try {
      const update = state.result?.update;
      setState((old) => ({ ...old, status: "installing", message: "Downloading update…" }));
      await installDesktopUpdate(update, ({ downloaded, total }) => {
        const pct = total ? Math.round((downloaded / total) * 100) : null;
        setState((old) => ({ ...old, message: pct ? `Downloading update… ${pct}%` : "Downloading update…" }));
      });
    } catch (error) {
      setState({ status: "error", message: error?.message || "Update installation failed." });
    }
  };


  return (
    <div className="rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))] text-[var(--medtrak-accent)]"><ShieldCheck className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Primovex updates</p>
          <p className="text-sm text-[var(--medtrak-muted)]">Installed version {version}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-3">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-muted)]">Release channel</p>
        <p className="mt-1 text-sm font-semibold capitalize">{channel}</p>
      </div>

      {state.message && <p className={`mt-3 text-sm ${state.status === "error" ? "text-red-600" : "text-[var(--medtrak-muted)]"}`}>{state.message}</p>}

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={check} disabled={["checking", "installing"].includes(state.status)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 text-sm font-bold disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${state.status === "checking" ? "animate-spin" : ""}`} /> Check
        </button>
        {state.status === "available" && <button type="button" onClick={install} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--medtrak-accent)] px-3 text-sm font-bold text-white"><Download className="h-4 w-4" /> Install</button>}
      </div>
    </div>
  );
}
