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

function normaliseLoginError(error) {
  const code = String(error?.code || "");
  if (code === "auth/too-many-requests") return "Too many sign-in attempts. Please wait a moment before trying again or reset your password.";
  if (code === "auth/network-request-failed") return "Network error. Please check your connection and try again.";
  return "We couldn't sign you in with those details. Please check your email and password.";
}

function CapabilityPill({ children }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">{children}</span>;
}

function MetricCard({ label, value, note }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-lg shadow-black/10">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || "/dashboard";

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
        summary: "User signed in to MedTrak+.",
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

  return (
    <div className="min-h-screen overflow-hidden bg-[#020617] text-slate-100">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(45,212,191,0.22),transparent_31%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_60%_92%,rgba(139,92,246,0.13),transparent_34%),linear-gradient(135deg,#020617,#07111f_48%,#020617)]" />
        <div className="absolute left-[12%] top-[18%] h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute bottom-[-8%] right-[8%] h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <main className="relative mx-auto grid min-h-screen w-full max-w-[1680px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-8">
        <section className="flex min-h-[42rem] flex-col overflow-hidden rounded-[2.2rem] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8 lg:p-10">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-3xl border border-teal-300/30 bg-teal-400/15 text-teal-200 shadow-[0_0_50px_rgba(45,212,191,0.25)]">
              <Icons.security className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">MedTrak<span className="text-teal-300">+</span></h1>
              <p className="mt-1 text-sm font-semibold uppercase tracking-[0.22em] text-teal-200/70">Operational Intelligence Platform</p>
            </div>
          </div>

          <div className="mt-14 max-w-3xl">
            <p className="text-5xl font-black tracking-tight text-white sm:text-6xl xl:text-7xl">
              Run the practice.
              <span className="block bg-gradient-to-r from-teal-200 via-emerald-200 to-sky-200 bg-clip-text text-transparent">See what matters.</span>
            </p>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              MedTrak+ brings governance, inventory, connected devices, MedAI, Practice Pulse and mobile workflows into one calm operating system for primary care.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <CapabilityPill>MedAI Daily Brief</CapabilityPill>
            <CapabilityPill>Governance Intelligence</CapabilityPill>
            <CapabilityPill>Cold Chain Connect</CapabilityPill>
            <CapabilityPill>MedTrak Mobile</CapabilityPill>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <MetricCard label="Demo Pulse" value="96%" note="Synthetic GP practice" />
            <MetricCard label="Devices" value="5/5" note="Cold chain online" />
            <MetricCard label="Actions" value="84" note="Completed today" />
          </div>

          <div className="mt-auto rounded-[2rem] border border-teal-300/20 bg-gradient-to-br from-teal-400/10 to-sky-500/5 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-200">Experience MedTrak+</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">Launch a fully synthetic practice, training environment or research scenario without touching live data.</p>
              </div>
              <Button onClick={() => launchDemo()} className="rounded-full bg-gradient-to-r from-teal-300 to-emerald-300 px-6 font-black text-slate-950 hover:from-teal-200 hover:to-emerald-200">
                Experience MedTrak+
              </Button>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-2xl space-y-5">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/35 backdrop-blur-xl sm:p-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-200/80">Secure access</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Sign in</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Use your MedTrak+ account. Admin, governance and security areas are permission controlled.</p>
                </div>
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100">Live ready</div>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Email</label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@nhs.uk" autoComplete="email" inputMode="email" className="h-12 rounded-xl border-slate-700/80 bg-slate-950/70 text-slate-50 placeholder:text-slate-500" />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</label>
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••••" autoComplete="current-password" className="h-12 rounded-xl border-slate-700/80 bg-slate-950/70 text-slate-50 placeholder:text-slate-500" />
                  <div className="mt-2 flex justify-end"><Link to="/forgot-password" className="text-xs font-semibold text-teal-300 hover:text-teal-100">Forgot password?</Link></div>
                </div>

                {error && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}

                <Button type="submit" disabled={saving || !canSubmit} className="h-12 w-full rounded-xl bg-gradient-to-r from-teal-400 to-emerald-300 text-base font-black text-slate-950 shadow-lg shadow-emerald-500/25 hover:from-teal-300 hover:to-emerald-200">
                  {saving ? "Signing in…" : "Sign in securely"}
                </Button>
              </form>

              <div className="mt-5 grid gap-3 text-xs text-slate-400 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-3"><p className="font-semibold text-slate-200">Audit ready</p><p className="mt-1">User actions logged.</p></div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-3"><p className="font-semibold text-slate-200">Role based</p><p className="mt-1">Capability access.</p></div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-3"><p className="font-semibold text-slate-200">Demo safe</p><p className="mt-1">Synthetic data only.</p></div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-sky-400/20 bg-sky-500/10 p-5 shadow-xl shadow-black/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-200/80">Demo launcher</p>
                  <h3 className="mt-1 text-xl font-black text-white">Choose a safe scenario</h3>
                </div>
                <Link to="/demo" className="text-xs font-bold text-sky-200 hover:text-white">Open centre</Link>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {DEMO_PROFILES.map((profile) => (
                  <button key={profile.id} type="button" onClick={() => { setSelectedDemo(profile.id); launchDemo(profile.id); }} className={`rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:border-sky-300/50 ${selectedDemo === profile.id ? "border-sky-300/50 bg-sky-400/15" : "border-white/10 bg-slate-950/40"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-white">{profile.label}</p>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-300">{profile.badge}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{profile.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <details className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-4 text-slate-200">
              <summary className="cursor-pointer text-sm font-bold">Advanced platform mode controls</summary>
              <div className="mt-4"><PlatformModeControls compact /></div>
            </details>
          </div>
        </section>
      </main>
    </div>
  );
}
