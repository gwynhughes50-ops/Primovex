// src/pages/Login.jsx
import { useMemo, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { writeAuditEvent } from "@/core/identity/auditService";
import { DEMO_PROFILES, setActiveDemoProfile } from "@/config/demoMode";
import PlatformModeControls from "@/components/platform/PlatformModeControls";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icons } from "@/config/medtrakIcons";
import PrimovexLogo from "@/components/brand/PrimovexLogo";
import { useMedTrakTheme } from "@/components/theme/MedTrakThemeProvider";

// This page is styled from the active theme's colour variables rather than
// fixed slate/white utilities: the light theme's compatibility layer flips
// classes like text-white and text-slate-* to dark, but not the dark
// backgrounds or translucent panels they sat on, which left the headline,
// tiles and button label dark-on-dark. Variables follow whichever theme is
// active, so the page is readable in every one.
const INK = "text-[color:var(--medtrak-text)]";
const MUTED = "text-[color:var(--medtrak-muted)]";
const BORDER = "border-[color:var(--medtrak-border)]";
const TINT = "bg-[color:color-mix(in_srgb,var(--medtrak-accent)_6%,var(--medtrak-panel))]";
const ON_GRADIENT = "text-[#ffffff]";

function normaliseLoginError(error) {
  const code = String(error?.code || "");
  if (code === "auth/too-many-requests") return "Too many sign-in attempts. Please wait a moment before trying again or reset your password.";
  if (code === "auth/network-request-failed") return "Network error. Please check your connection and try again.";
  return "We couldn't sign you in with those details. Please check your email and password.";
}

function CapabilityPill({ children }) {
  return <span className={`rounded-full border ${BORDER} bg-[color:color-mix(in_srgb,var(--medtrak-accent)_8%,var(--medtrak-panel))] px-3 py-1 text-xs font-semibold ${INK}`}>{children}</span>;
}

function MetricCard({ label, value, note }) {
  return (
    <div className={`rounded-3xl border ${BORDER} ${TINT} p-4 shadow-sm`}>
      <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${MUTED}`}>{label}</p>
      <p className={`mt-2 text-3xl font-black ${INK}`}>{value}</p>
      <p className={`mt-1 text-xs ${MUTED}`}>{note}</p>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || "/dashboard";
  const { theme } = useMedTrakTheme();
  const light = Boolean(theme?.light);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedDemo, setSelectedDemo] = useState("gp-practice");

  const canSubmit = useMemo(() => String(email || "").trim().includes("@") && password.length >= 6, [email, password]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const cleanEmail = email.trim();
    if (!cleanEmail) return setError("Please enter your email.");
    if (!password) return setError("Please enter your password.");

    setSaving(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      await writeAuditEvent({
        actor: credential.user,
        action: "auth.login.success",
        module: "security",
        targetType: "user_session",
        targetId: credential.user?.uid,
        summary: "User signed in to Primovex.",
        metadata: { provider: "firebase-password" },
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(normaliseLoginError(err));
      console.error("Login error:", err);
    } finally {
      setSaving(false);
    }
  }

  function launchDemo(profileId = selectedDemo) {
    setActiveDemoProfile(profileId, profileId === "training-mode" ? "training" : "demo");
    navigate("/dashboard", { replace: true });
  }

  // Small accent text is nudged toward the theme text colour (darker on light
  // themes, lighter on dark ones) so pale accents like Clinical Green still pass 4.5:1.
  const accent = light
    ? "text-[color:color-mix(in_srgb,var(--medtrak-accent)_65%,var(--medtrak-text))]"
    : "text-[color:color-mix(in_srgb,var(--medtrak-accent)_50%,var(--medtrak-text))]";
  const headlineGradient = light ? "from-blue-700 via-violet-600 to-cyan-600" : "from-blue-300 via-violet-300 to-cyan-300";
  const livePill = light ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  const errorBox = light ? "border-rose-300 bg-rose-50 text-rose-800" : "border-rose-400/30 bg-rose-500/10 text-rose-100";
  const cardShadow = "shadow-[0_24px_70px_-28px_rgba(15,23,42,0.35)]";
  const fieldClass = `h-12 rounded-xl ${BORDER} bg-[color:var(--medtrak-bg)] ${INK} placeholder:text-[color:var(--medtrak-muted)]`;
  const gradientButton = `bg-gradient-to-r from-[#2563EB] via-[#6D4DFF] to-[#00B8F0] ${ON_GRADIENT} hover:from-blue-500 hover:to-cyan-400`;

  return (
    <div className={`min-h-screen overflow-hidden bg-[color:var(--medtrak-bg)] ${INK}`}>
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(37,99,235,0.22),transparent_31%),radial-gradient(circle_at_80%_20%,rgba(109,77,255,0.18),transparent_28%),radial-gradient(circle_at_60%_92%,rgba(139,92,246,0.13),transparent_34%)]" />
        <div className="absolute left-[12%] top-[18%] h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-[-8%] right-[8%] h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <main className="relative mx-auto grid min-h-screen w-full max-w-[1680px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-8">
        <section className={`flex min-h-[42rem] flex-col overflow-hidden rounded-[2.2rem] border ${BORDER} bg-[color:var(--medtrak-panel-soft)] p-6 ${cardShadow} backdrop-blur-xl sm:p-8 lg:p-10`}>
          <PrimovexLogo className="drop-shadow-[0_14px_38px_rgba(109,77,255,0.25)]" />

          <div className="mt-14 max-w-3xl">
            <p className={`text-5xl font-black tracking-tight sm:text-6xl xl:text-7xl ${INK}`}>
              Run the practice.
              <span className={`block bg-gradient-to-r ${headlineGradient} bg-clip-text text-transparent`}>See what matters.</span>
            </p>
            <p className={`mt-6 max-w-2xl text-base leading-8 sm:text-lg ${MUTED}`}>
              Primovex brings governance, inventory, connected devices, Primovex AI, Practice Pulse and mobile workflows into one calm operating system for primary care.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <CapabilityPill>Primovex AI Daily Brief</CapabilityPill>
            <CapabilityPill>Governance Intelligence</CapabilityPill>
            <CapabilityPill>Cold Chain Connect</CapabilityPill>
            <CapabilityPill>Primovex Mobile</CapabilityPill>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <MetricCard label="Demo Pulse" value="96%" note="Synthetic GP practice" />
            <MetricCard label="Devices" value="5/5" note="Cold chain online" />
            <MetricCard label="Actions" value="84" note="Completed today" />
          </div>

          <div className={`mt-10 shrink-0 rounded-[2rem] border ${BORDER} bg-gradient-to-br from-blue-500/10 to-sky-500/5 p-5 lg:mt-12`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`text-sm font-black uppercase tracking-[0.18em] ${accent}`}>Experience Primovex</p>
                <p className={`mt-1 text-sm leading-6 ${MUTED}`}>Launch a fully synthetic practice, training environment or research scenario without touching live data.</p>
              </div>
              <Button onClick={() => launchDemo()} className={`rounded-full px-6 font-black ${gradientButton}`}>
                Experience Primovex
              </Button>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-2xl space-y-5">
            <div className={`rounded-[2rem] border ${BORDER} bg-[color:var(--medtrak-panel)] p-5 ${cardShadow} backdrop-blur-xl sm:p-7`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className={`text-xs font-black uppercase tracking-[0.2em] ${accent}`}>Secure access</p>
                  <h2 className={`mt-2 text-3xl font-black tracking-tight ${INK}`}>Sign in</h2>
                  <p className={`mt-2 text-sm leading-6 ${MUTED}`}>Use your Primovex account. Admin, governance and security areas are permission controlled.</p>
                </div>
                <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${livePill}`}>Live ready</div>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className={`mb-2 block text-xs font-semibold uppercase tracking-wide ${MUTED}`}>Email</label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@nhs.uk" autoComplete="email" inputMode="email" className={fieldClass} />
                </div>
                <div>
                  <label className={`mb-2 block text-xs font-semibold uppercase tracking-wide ${MUTED}`}>Password</label>
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••••" autoComplete="current-password" className={fieldClass} />
                  <div className="mt-2 flex justify-end"><Link to="/forgot-password" className={`text-xs font-semibold hover:underline ${accent}`}>Forgot password?</Link></div>
                </div>

                {error && <div className={`rounded-2xl border p-3 text-sm ${errorBox}`}>{error}</div>}

                <Button type="submit" disabled={saving || !canSubmit} className={`h-12 w-full rounded-xl text-base font-black shadow-lg shadow-violet-500/25 ${gradientButton}`}>
                  {saving ? "Signing in…" : "Sign in securely"}
                </Button>
              </form>

              <div className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
                {[
                  ["Audit ready", "User actions logged."],
                  ["Role based", "Capability access."],
                  ["Demo safe", "Synthetic data only."],
                ].map(([title, note]) => (
                  <div key={title} className={`rounded-2xl border ${BORDER} ${TINT} p-3`}>
                    <p className={`font-semibold ${INK}`}>{title}</p>
                    <p className={`mt-1 ${MUTED}`}>{note}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-[2rem] border ${BORDER} bg-[color:color-mix(in_srgb,var(--medtrak-accent)_7%,var(--medtrak-panel))] p-5 shadow-xl shadow-slate-900/5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-xs font-black uppercase tracking-[0.2em] ${accent}`}>Demo launcher</p>
                  <h3 className={`mt-1 text-xl font-black ${INK}`}>Choose a safe scenario</h3>
                </div>
                <Link to="/demo" className={`text-xs font-bold hover:underline ${accent}`}>Open centre</Link>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {DEMO_PROFILES.map((profile) => (
                  <button key={profile.id} type="button" onClick={() => { setSelectedDemo(profile.id); launchDemo(profile.id); }} className={`rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--medtrak-accent)] ${selectedDemo === profile.id ? "border-[color:var(--medtrak-accent)] bg-[color:color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))]" : `${BORDER} bg-[color:var(--medtrak-panel)]`}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-bold ${INK}`}>{profile.label}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${BORDER} ${MUTED}`}>{profile.badge}</span>
                    </div>
                    <p className={`mt-1 line-clamp-2 text-xs leading-5 ${MUTED}`}>{profile.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <details className={`rounded-[2rem] border ${BORDER} bg-[color:var(--medtrak-panel)] p-4 ${INK}`}>
              <summary className="cursor-pointer text-sm font-bold">Advanced platform mode controls</summary>
              <div className="mt-4"><PlatformModeControls compact /></div>
            </details>
          </div>
        </section>
      </main>
    </div>
  );
}
