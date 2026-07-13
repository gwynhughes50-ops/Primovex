import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { DEMO_MODE, demoBannerText } from "@/config/demoMode";
import { Icons } from "@/config/medtrakIcons";
import ReleaseUpdateCard from "@/release/ReleaseUpdateCard";

function Metric({ label, value, note, status = "green" }) {
  const colour = status === "green" ? "text-emerald-200 bg-emerald-500/10 border-emerald-400/20" : status === "amber" ? "text-amber-100 bg-amber-500/10 border-amber-400/20" : "text-rose-100 bg-rose-500/10 border-rose-400/20";
  return (
    <Card className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-50">{value}</p>
        <p className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs ${colour}`}>{note}</p>
      </CardContent>
    </Card>
  );
}

function ChecklistItem({ title, detail, status = "green" }) {
  const Icon = status === "green" ? Icons.check : status === "amber" ? Icons.alerts : Icons.alerts;
  const colour = status === "green" ? "text-emerald-200 bg-emerald-500/10" : status === "amber" ? "text-amber-100 bg-amber-500/10" : "text-rose-100 bg-rose-500/10";
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${colour}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

export default function SecurityCentre() {
  const navigate = useNavigate();
  const { displayName, role, can } = useAuth();
  const securityScore = useMemo(() => (DEMO_MODE ? 94 : 88), []);
  const canManageSecurity = can?.("admin.manageSettings") || can?.("admin.manageUsers");

  return (
    <div className="space-y-6 text-slate-100">
      <header className="rounded-[2rem] border border-slate-800/70 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/30 p-6 shadow-lg shadow-slate-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">
              <Icons.security className="h-3.5 w-3.5" /> Security Centre
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Security, Privacy & Compliance</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Release-readiness view for authentication, demo safety, audit coverage, governance protection and future DPIA evidence.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-800/70 bg-slate-950/50 p-4 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Signed in</p>
            <p className="mt-1 font-semibold text-slate-100">{displayName || "Current user"}</p>
            <p className="text-xs text-slate-500">{role || "Role unknown"}</p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Security score" value={`${securityScore}%`} note="Foundation healthy" />
        <Metric label="Demo safety" value={DEMO_MODE ? "On" : "Off"} note={DEMO_MODE ? "Synthetic data" : "Live mode"} status={DEMO_MODE ? "green" : "amber"} />
        <Metric label="Audit trail" value="Active" note="Core events" />
        <Metric label="MFA" value="Ready" note="Design prepared" status="amber" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Release security checklist</h2>
              <span className="rounded-full bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-100">v0.9.x</span>
            </div>
            <div className="mt-4 space-y-3">
              <ChecklistItem title="Forgot password flow" detail="Firebase password reset is available, with generic success messaging to avoid account enumeration." />
              <ChecklistItem title="Capability-based access" detail="Navigation and protected screens inherit the signed-in user's capability profile." />
              <ChecklistItem title="Anonymised governance by design" detail="Governance case display should use EMIS number first, then initials and DOB fallback. Patient names are not the primary identifier." />
              <ChecklistItem title="Backend-only secrets" detail="Tuya and future provider secrets must live in Cloud Functions or environment configuration, never in React." />
              <ChecklistItem title="MFA and admin re-check" detail="Next hardening step: require re-authentication before changing users, roles, permissions or provider credentials." status="amber" />
              <ChecklistItem title="DPIA evidence pack" detail="Create the DPIA, ROPA, privacy notice, retention policy and AI transparency statement before any external release." status="amber" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100">
          <CardContent className="p-5">
            <h2 className="text-lg font-semibold">Security notes</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
                <p className="font-semibold text-slate-100">Demo Mode</p>
                <p className="mt-1 leading-6">{demoBannerText()}</p>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
                <p className="font-semibold text-slate-100">Governance protection</p>
                <p className="mt-1 leading-6">High-risk governance screens should use stronger audit logging and role/capability checks than general stock workflows.</p>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
                <p className="font-semibold text-slate-100">Admin actions</p>
                <p className="mt-1 leading-6">{canManageSecurity ? "You have admin-level capabilities. Use additional caution before changing users, roles or provider configuration." : "You do not currently have security administration capabilities."}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="rounded-full bg-gradient-to-r from-teal-400 to-emerald-300 text-slate-950">Export readiness checklist</Button>
              <Button variant="ghost" className="rounded-full border border-slate-700/70 text-slate-100">View audit events</Button>
              {canManageSecurity && <Button variant="ghost" onClick={() => navigate("/setup")} className="rounded-full border border-slate-700/70 text-slate-100">Reopen setup</Button>}
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <ReleaseUpdateCard />
      </section>
    </div>
  );
}
