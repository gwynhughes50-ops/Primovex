import { useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { auth } from "@/lib/firebase";
import { getQrImageUrl } from "@/lib/qrCode";
import { cleanCode, friendlyMfaError, isValidCode, needsVerifiedEmail } from "@/lib/mfaHelpers";
import {
  beginTotpEnrolment,
  completeTotpEnrolment,
  enrolledTotpFactors,
  removeTotpFactor,
  sendVerificationEmail,
} from "@/services/mfaService";

const btn =
  "rounded-xl border border-[color:var(--medtrak-border)] px-4 py-2 text-sm font-semibold transition hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_8%,var(--medtrak-panel))] disabled:cursor-not-allowed disabled:opacity-50";
const primary = "rounded-xl bg-[color:var(--medtrak-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

// Chunks the secret key into groups of four so it's easy to type by hand.
const groupKey = (key) => String(key || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

// A person's own two-step sign-in: add or remove an authenticator app. Used on
// the desktop Security Centre and the mobile Me tab. Nothing is saved to the
// account until the code from the app has been typed back and checked.
export default function MfaSetup() {
  const user = auth.currentUser;
  const [factors, setFactors] = useState(() => enrolledTotpFactors());
  const [step, setStep] = useState("idle"); // idle | starting | scan | saving
  const [pending, setPending] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [notice, setNotice] = useState("");

  if (!user) {
    return (
      <p className="text-sm text-[color:var(--medtrak-muted)]">
        Two-step sign-in is set up on a real account. It isn't available in demo mode.
      </p>
    );
  }

  const enrolled = factors.length > 0;

  function fail(err) {
    setUnverified(needsVerifiedEmail(err));
    setError(friendlyMfaError(err));
  }

  async function start() {
    setError(""); setNotice(""); setUnverified(false);
    setStep("starting");
    try {
      setPending(await beginTotpEnrolment(user));
      setCode("");
      setStep("scan");
    } catch (err) {
      fail(err);
      setStep("idle");
    }
  }

  async function confirm(event) {
    event.preventDefault();
    if (!isValidCode(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setError("");
    setStep("saving");
    try {
      await completeTotpEnrolment(pending.secret, code, user);
      setFactors(enrolledTotpFactors(user));
      setPending(null);
      setCode("");
      setStep("idle");
      setNotice("Two-step sign-in is on. You'll be asked for a code from your authenticator app each time you sign in.");
    } catch (err) {
      fail(err);
      setStep("scan");
    }
  }

  async function remove(factor) {
    if (!window.confirm("Turn off two-step sign-in for your account? Your account will be protected by your password alone.")) return;
    setError(""); setNotice("");
    try {
      await removeTotpFactor(factor.uid, user);
      setFactors(enrolledTotpFactors(user));
      setNotice("Two-step sign-in is off.");
    } catch (err) {
      fail(err);
    }
  }

  async function sendVerification() {
    try {
      await sendVerificationEmail(user);
      setNotice(`Verification email sent to ${user.email}. Open the link in it, then come back and try again.`);
      setError(""); setUnverified(false);
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="space-y-3 text-[color:var(--medtrak-text)]">
      <div className="flex items-start gap-3">
        {enrolled
          ? <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
          : <ShieldOff className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />}
        <div className="min-w-0">
          <p className="font-semibold">{enrolled ? "Two-step sign-in is on" : "Two-step sign-in is off"}</p>
          <p className="text-sm text-[color:var(--medtrak-muted)]">
            {enrolled
              ? "Signing in needs your password and a code from your authenticator app."
              : "Add an authenticator app (such as Microsoft Authenticator or Google Authenticator) so a stolen password alone can't get into your account."}
          </p>
        </div>
      </div>

      {factors.map((factor) => (
        <div key={factor.uid} className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--medtrak-border)] px-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            {factor.displayName || "Authenticator app"}
            {factor.enrollmentTime ? <span className="text-[color:var(--medtrak-muted)]"> · added {new Date(factor.enrollmentTime).toLocaleDateString("en-GB")}</span> : null}
          </span>
          <button type="button" className={btn} onClick={() => remove(factor)}>Remove</button>
        </div>
      ))}

      {!enrolled && step === "idle" && (
        <button type="button" className={primary} onClick={start}>Set up authenticator app</button>
      )}
      {step === "starting" && <p className="text-sm text-[color:var(--medtrak-muted)]">Getting your setup code…</p>}

      {(step === "scan" || step === "saving") && pending && (
        <form onSubmit={confirm} className="space-y-3 rounded-2xl border border-[color:var(--medtrak-border)] p-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Open your authenticator app and choose to add an account.</li>
            <li>Scan this square, or choose "enter a setup key" and type the key below.</li>
            <li>Type the 6-digit code the app then shows for Primovex.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <img src={getQrImageUrl(pending.otpauthUrl, 176)} alt="QR code to scan with your authenticator app" className="h-44 w-44 rounded-xl border border-[color:var(--medtrak-border)] bg-white p-1" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--medtrak-muted)]">Setup key</p>
              <p className="mt-1 break-all font-mono text-sm font-semibold">{groupKey(pending.secretKey)}</p>
            </div>
          </div>
          <input
            value={code}
            onChange={(event) => setCode(cleanCode(event.target.value))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            aria-label="6-digit code"
            className="h-11 w-full max-w-[14rem] rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 text-center text-lg font-semibold tracking-[0.35em] outline-none focus:border-[color:var(--medtrak-accent)]"
          />
          <div className="flex gap-2">
            <button type="submit" className={primary} disabled={step === "saving" || !isValidCode(code)}>{step === "saving" ? "Checking…" : "Turn on"}</button>
            <button type="button" className={btn} disabled={step === "saving"} onClick={() => { setStep("idle"); setPending(null); setError(""); }}>Cancel</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
      {unverified && <button type="button" className={btn} onClick={sendVerification}>Send verification email</button>}
      {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
    </div>
  );
}
