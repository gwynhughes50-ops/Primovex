import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { DEMO_MODE, demoBannerText } from "@/config/demoMode";
import { Icons } from "@/config/medtrakIcons";
import ReleaseUpdateCard from "@/release/ReleaseUpdateCard";
import PrimovexHero from "@/components/common/PrimovexHero";
import { ASSURANCE_PROFILES, CLINICAL_GOVERNANCE_REQUIREMENTS, getAssuranceProfile, getClinicalGovernanceReadiness } from "@/governance/clinicalDataGate";
import AuditLedgerPanel from "@/components/security/AuditLedgerPanel";
import { GOVERNANCE_DOCUMENTS, findGovernanceDocument } from "@/config/governanceDocuments";
import { FileText, Download, ExternalLink } from "lucide-react";

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

function ChecklistItem({ title, detail, status = "green", document }) {
  const Icon = status === "green" ? Icons.check : status === "amber" ? Icons.alerts : Icons.alerts;
  const colour = status === "green" ? "text-emerald-200 bg-emerald-500/10" : status === "amber" ? "text-amber-100 bg-amber-500/10" : "text-rose-100 bg-rose-500/10";
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${colour}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          {document && (
            <a href={document.viewPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-teal-400/30 bg-teal-500/10 px-2 py-0.5 text-[11px] font-semibold text-teal-100 hover:bg-teal-500/20">
              {document.status === "approved" ? "Approved" : "Draft available"} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

function GovernanceDocumentCard({ doc }) {
  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-200"><FileText className="h-4 w-4" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-100">{doc.title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">{doc.description}</p>
            <p className="mt-2 text-xs text-slate-500">Added {doc.addedAt} &middot; {doc.status === "approved" ? "Approved" : "Draft — pending sign-off"}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={doc.viewPath} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline" className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />View</Button>
        </a>
        <a href={doc.downloadPath} download>
          <Button size="sm" variant="outline" className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"><Download className="mr-1.5 h-3.5 w-3.5" />Download (.docx)</Button>
        </a>
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
  const [auditOpen, setAuditOpen] = useState(false);

  const exportReadiness = () => {
    const payload = {
      product: "Primovex",
      version: "0.15.41",
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
    link.download = `primovex-v0.15.41-governed-audit-ledger-${new Date().toISOString().slice(0, 10)}.json`;
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

      {auditOpen && <AuditLedgerPanel onClose={() => setAuditOpen(false)} />}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="ClinFlow clinical data" value="Locked" note="Synthetic workflows only" status="green" />
        <Metric label="NHS Wales checklist" value={`${walesReadiness.documented}/${walesReadiness.total} documented`} note={`${walesReadiness.approved} formally approved`} status={walesReadiness.approved > 0 ? "amber" : "rose"} />
        <Metric label="NHS England checklist" value={`${englandReadiness.documented}/${englandReadiness.total} documented`} note={`${englandReadiness.approved} formally approved`} status={englandReadiness.approved > 0 ? "amber" : "rose"} />
        <Metric label="DPIA" value="Draft" note="DPO sign-off outstanding" status="amber" />
      </section>

      <Card className="rounded-3xl border border-amber-400/30 bg-amber-500/10 text-slate-100">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Dual NHS assurance checklist</p>
              <h2 className="mt-2 text-xl font-semibold">ClinFlow is locked; the rest of Primovex is live under interim governance</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-50/80">{clinicalReadiness.statement} Wales is the primary deployment baseline; England controls are retained as a compatibility and good-practice overlay. This screen does not claim certification or legal approval — items below marked "Draft available" have paperwork in progress, not sign-off.</p>
            </div>
            <span className="rounded-full border border-amber-300/30 bg-slate-950/30 px-3 py-1 text-xs font-bold text-amber-100">CLINFLOW: BLOCKED BY DESIGN</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {clinicalReadiness.blockers.filter((item) => item.jurisdictions.length === 2).map((item) => <ChecklistItem key={item.id} title={item.label} detail={`Shared UK evidence owner: ${item.owner}`} status={item.documentStatus === "not_started" ? "amber" : "green"} document={item.document} />)}
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
                <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">{profile.documented}/{profile.total} documented &middot; {profile.approved} approved</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.frameworks.map((framework) => <span key={framework} className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs text-slate-300">{framework}</span>)}
              </div>
              <div className="mt-5 space-y-3">
                {profile.requirements.filter((item) => item.jurisdictions.length === 1).map((item) => <ChecklistItem key={`${profile.id}-${item.id}`} title={item.label} detail={`Jurisdiction-specific evidence owner: ${item.owner}`} status={item.documentStatus === "not_started" ? "amber" : "green"} document={item.document} />)}
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
              <ChecklistItem title="Capability-based access" detail="Server-side Firestore rules now enforce capabilities (not just signed-in) for governance, inventory, purchasing and temperature collections, plus route-level gating across most of the app — done 18 Sep 2026. A few low-sensitivity routes and a full collection-by-collection assurance test remain outstanding." status="amber" />
              <ChecklistItem title="Anonymised governance by design" detail="Governance case display should use EMIS number first, then initials and DOB fallback. Patient names are not the primary identifier." />
              <ChecklistItem title="Backend-only secrets" detail="Tuya and future provider secrets must live in Cloud Functions or environment configuration, never in React." />
              <ChecklistItem title="MFA and admin re-check" detail="Required before live clinical use: enforce MFA and re-authentication for privileged changes. Not yet implemented." status="amber" />
              <ChecklistItem title="DPIA evidence pack" detail="A real draft now exists (see Governance documents below) — still requires controller, DPO and Clinical Safety Officer review and signatures." status="amber" document={findGovernanceDocument("dpia")} />
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
              <Button variant="ghost" onClick={() => setAuditOpen(true)} className="rounded-full border border-slate-700/70 text-slate-100">View audit events</Button>
              {canManageSecurity && <Button variant="ghost" onClick={() => navigate("/setup")} className="rounded-full border border-slate-700/70 text-slate-100">Reopen setup</Button>}
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Governance & compliance documents</h2>
                <p className="mt-1 text-sm text-slate-400">Kept here rather than only in whatever tool produced them, so they're still findable next time someone needs them.</p>
              </div>
              <span className="rounded-full border border-slate-700/70 bg-slate-950/40 px-3 py-1 text-xs font-semibold text-slate-300">{GOVERNANCE_DOCUMENTS.length} document{GOVERNANCE_DOCUMENTS.length === 1 ? "" : "s"}</span>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {GOVERNANCE_DOCUMENTS.map((doc) => <GovernanceDocumentCard key={doc.id} doc={doc} />)}
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
