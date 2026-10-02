import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { cleanCode, friendlyMfaError, isValidCode } from "@/lib/mfaHelpers";
import { resolveSignInWithTotp } from "@/services/mfaService";

// The second step of signing in: the 6-digit code from the authenticator app.
// Shown by the desktop and mobile sign-in screens in place of the password
// form once Firebase says a second factor is needed. `onVerified` receives the
// completed UserCredential; `onCancel` returns to the password form.
export default function MfaChallenge({ resolver, onVerified, onCancel }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null);

  useEffect(() => { input.current?.focus(); }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!isValidCode(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const credential = await resolveSignInWithTotp(resolver, code);
      await onVerified(credential);
    } catch (err) {
      setError(friendlyMfaError(err));
      setCode("");
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Two-step verification">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[color:var(--medtrak-accent)]" />
        <div>
          <h2 className="text-lg font-semibold">Check your authenticator app</h2>
          <p className="mt-1 text-sm text-[color:var(--medtrak-muted)]">
            Enter the 6-digit code shown for Primovex. It changes every 30 seconds.
          </p>
        </div>
      </div>

      <input
        ref={input}
        value={code}
        onChange={(event) => setCode(cleanCode(event.target.value))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        placeholder="123456"
        aria-label="6-digit code"
        className="h-12 w-full rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-4 text-center text-2xl font-semibold tracking-[0.4em] text-[color:var(--medtrak-text)] outline-none focus:border-[color:var(--medtrak-accent)]"
      />

      {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={busy || !isValidCode(code)}
        className="h-12 w-full rounded-xl bg-[color:var(--medtrak-accent)] text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Checking…" : "Verify and sign in"}
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className="w-full text-center text-sm font-medium text-[color:var(--medtrak-muted)] underline-offset-2 hover:underline">
        Back to sign in
      </button>
    </form>
  );
}
