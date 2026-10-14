import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { disablePush, enablePush, pushStatus } from "@/lib/pushNotifications";

// The phone's own switch for alerts on the lock screen (see lib/pushNotifications.js). It says plainly when this phone
// can't do it yet and what to do about it.
export default function PhoneAlerts() {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = pushStatus(version);
  const on = status.state === "on";
  const canToggle = status.state === "on" || status.state === "off";

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      if (on) await disablePush(user); else await enablePush(user);
    } catch (problem) {
      setError(problem?.message || "That didn't work. Try again.");
    } finally {
      setBusy(false);
      setVersion((v) => v + 1);
    }
  }

  return (
    <div className="py-1">
      <div className="flex items-start gap-3">
        {on ? <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[var(--medtrak-accent)]" aria-hidden="true" /> : <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-[var(--medtrak-muted)]" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <b>{on ? "Alerts on" : "Alerts off"}</b>
          <p className="text-sm text-[var(--medtrak-muted)]">{status.message}</p>
          <p className="mt-1 text-xs text-[var(--medtrak-muted)]">You are told when something needs you: a fridge out of range, a message from a colleague, a check that is due. Alerts show a short title only, never patient details.</p>
        </div>
      </div>
      {canToggle && (
        <button type="button" disabled={busy} onClick={toggle} className={`mt-3 min-h-12 w-full rounded-2xl font-bold disabled:opacity-50 ${on ? "border border-[var(--medtrak-border)]" : "bg-[var(--medtrak-accent)] text-white"}`}>
          {busy ? "Working…" : on ? "Turn alerts off on this phone" : "Turn alerts on for this phone"}
        </button>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
    </div>
  );
}
