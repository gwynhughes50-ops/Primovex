import { useMemo, useState } from "react";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { writeAuditEvent } from "@/core/identity/auditService";
import MobileBrandLockup from "./MobileBrandLockup";

function normaliseLoginError(error) {
  const code = String(error?.code || "");
  if (code === "auth/too-many-requests") return "Too many sign-in attempts. Please wait before trying again.";
  if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
  return "We couldn't sign you in with those details.";
}

export default function MobileAccountLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetMode, setResetMode] = useState(false);

  const canSubmit = useMemo(
    () => String(email || "").trim().includes("@") && (resetMode || password.length >= 6),
    [email, password, resetMode]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Enter your email address.");
      return;
    }

    setSaving(true);
    try {
      if (resetMode) {
        await sendPasswordResetEmail(auth, cleanEmail);
        setNotice("Password reset instructions have been sent if the account exists.");
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      await writeAuditEvent({
        actor: credential.user,
        action: "auth.login.success",
        module: "security",
        targetType: "mobile_user_session",
        targetId: credential.user?.uid,
        summary: "User signed in to Primovex Mobile.",
        metadata: { provider: "firebase-password", client: "android" },
      });
    } catch (err) {
      setError(resetMode ? "We couldn't send the reset email. Check the address and connection." : normaliseLoginError(err));
      console.error("Mobile login error:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen overflow-y-auto bg-[var(--medtrak-bg)] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-[var(--medtrak-text)]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-sm flex-col justify-center">
        <MobileBrandLockup />

        <section className="mt-9 rounded-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--medtrak-accent)]">
            {resetMode ? "Account recovery" : "Secure account access"}
          </p>
          <h1 className="mt-2 text-2xl font-bold">
            {resetMode ? "Reset your password" : "Sign in to Primovex"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--medtrak-muted)]">
            {resetMode
              ? "Enter your account email and we will send reset instructions."
              : "Use your Primovex account once, then use your mobile PIN or biometric access."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]">Email</span>
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-4">
                <Mail className="h-5 w-5 text-[var(--medtrak-muted)]" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@nhs.uk"
                  className="min-w-0 flex-1 bg-transparent py-4 outline-none"
                />
              </div>
            </label>

            {!resetMode && (
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]">Password</span>
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-4">
                  <KeyRound className="h-5 w-5 text-[var(--medtrak-muted)]" />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    placeholder="Your password"
                    className="min-w-0 flex-1 bg-transparent py-4 outline-none"
                  />
                </div>
              </label>
            )}

            {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700">{error}</div>}
            {notice && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{notice}</div>}

            <button
              type="submit"
              disabled={saving || !canSubmit}
              className="w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 py-4 font-bold text-white shadow-lg disabled:opacity-50"
            >
              {saving ? "Please wait…" : resetMode ? "Send reset instructions" : "Sign in securely"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setResetMode((value) => !value);
              setError("");
              setNotice("");
            }}
            className="mt-3 w-full px-4 py-3 text-sm font-semibold text-[var(--medtrak-muted)]"
          >
            {resetMode ? "Back to sign in" : "Forgot your details?"}
          </button>
        </section>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[var(--medtrak-muted)]">
          <ShieldCheck className="h-4 w-4" /> Protected Primovex Mobile access
        </div>
      </div>
    </main>
  );
}
