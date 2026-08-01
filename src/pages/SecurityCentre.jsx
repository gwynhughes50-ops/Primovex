import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { DEMO_MODE, demoBannerText } from "@/config/demoMode";
import { Icons } from "@/config/medtrakIcons";
import ReleaseUpdateCard from "@/release/ReleaseUpdateCard";
import PrimovexHero from "@/components/common/PrimovexHero";
import { ASSURANCE_PROFILES, CLINICAL_GOVERNANCE_REQUIREMENTS, getAssuranceProfile, getClinicalGovernanceReadiness } from "@/governance/clinicalDataGate";

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
  const clinicalReadiness = useMemo(() => getClinicalGovernanceReadiness(), []);
  const walesReadiness = useMemo(() => getAssuranceProfile("wales"), []);
  const englandReadiness = useMemo(() => getAssuranceProfile("england"), []);
  const canManageSecurity = can?.("admin.manageSettings") || can?.("admin.manageUsers");

  const exportReadiness = () => {
    const payload = {
      product: "Primovex",
      version: "0.15.37",
      generatedAt: new Date().toISOString(),
      clinicalDataMode: clinicalReadiness.mode,
      liveClinicalDataAllowed: false,
      disclaimer: "Engineering evidence index only. This is not certification, accreditation or legal approval.",
      deploymentBaseline: ASSURANCE_PROFILES.wales,
      adoptedOverlay: ASSURANCE_PROFILES.england,
      profiles: [walesReadiness, englandReadiness],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `primovex-v0.15.37-clinflow-numbered-pages-layout-repair-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 text-slate-100">
      <PrimovexHero
        eyebrow="Security Centre"
        icon={Icons.security}
        title="Security, Privacy & Compliance"
        description="Dual NHS Wales and NHS England assurance view for privacy, security, clinical safety and controlled deployment evidence."
        aside={
          <div className="min-w-[13rem] text-sm text-white/80" data-preserve-colour>
            <p className="text-xs uppercase tracking-[0.18em] text-white/60" data-preserve-colour>Signed in</p>
            <p className="mt-1 font-semibold text-white" data-preserve-colour>{displayName || "Current user"}</p>
            <p className="text-xs text-white/60" data-preserve-colour>{role || "Role unknown"}</p>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Clinical data" value="Locked" note="Synthetic workflows only" status="green" />
        <Metric label="NHS Wales" value={`${walesReadiness.approved}/${walesReadiness.total}`} note="Primary deployment baseline" status="amber" />
        <Metric label="NHS England" value={`${englandReadiness.approved}/${englandReadiness.total}`} note="Adopted assurance overlay" status="amber" />
        <Metric label="DPIA" value="Draft" note="DPO sign-off outstanding" status="amber" />
      </section>

      <Card className="rounded-3xl border border-amber-400/30 bg-amber-500/10 text-slate-100">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Dual NHS assurance gate</p><h2 className="mt-2 text-xl font-semibold">Real patient data remains disabled</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-amber-50/80">{clinicalReadiness.statement} Wales is the primary deployment baseline; England controls are retained as a compatibility and good-practice overlay. This screen does not claim certification or legal approval.</p></div>
            <span className="rounded-full border border-amber-300/30 bg-slate-950/30 px-3 py-1 text-xs font-bold text-amber-100">BLOCKED BY DESIGN</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {CLINICAL_GOVERNANCE_REQUIREMENTS.filter((item) => item.jurisdictions.length === 2).map((item) => <ChecklistItem key={item.id} title={item.label} detail={`Shared UK evidence owner: ${item.owner}`} status="amber" />)}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {[walesReadiness, englandReadiness].map((profile) => (
          <Card key={profile.id} className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">{profile.deploymentStatus === "primary" ? "Deployment baseline" : "Assurance overlay"}</p>
                  <h2 className="mt-2 text-xl font-semibold">{profile.label}</h2>
                </div>
                <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">{profile.approved}/{profile.total} approved</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.frameworks.map((framework) => <span key={framework} className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs text-slate-300">{framework}</span>)}
              </div>
              <div className="mt-5 space-y-3">
                {profile.requirements.filter((item) => item.jurisdictions.length === 1).map((item) => <ChecklistItem key={`${profile.id}-${item.id}`} title={item.label} detail={`Jurisdiction-specific evidence owner: ${item.owner}`} status="amber" />)}
              </div>
            </CardContent>
          </Card>
        ))}
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
              <ChecklistItem title="Capability-based access" detail="Client capabilities are present; server-side tenant and capability enforcement still requires a collection-by-collection assurance test." status="amber" />
              <ChecklistItem title="Anonymised governance by design" detail="Governance case display should use EMIS number first, then initials and DOB fallback. Patient names are not the primary identifier." />
              <ChecklistItem title="Backend-only secrets" detail="Tuya and future provider secrets must live in Cloud Functions or environment configuration, never in React." />
              <ChecklistItem title="MFA and admin re-check" detail="Required before live clinical use: enforce MFA and re-authentication for privileged changes." status="amber" />
              <ChecklistItem title="DPIA evidence pack" detail="Draft templates are included, but require controller, DPO and Clinical Safety Officer review and signatures." status="amber" />
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
              <Button onClick={exportReadiness} className="rounded-full bg-gradient-to-r from-teal-400 to-emerald-300 text-slate-950">Export dual-framework evidence</Button>
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
