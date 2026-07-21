import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Building2, Check, ChevronLeft, ChevronRight, Nfc, ShieldCheck, Users } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { savePracticeConfig, seedPracticeDefaults } from "@/services/practiceAdminService";
import { useMedTrakTheme } from "@/components/theme/MedTrakThemeProvider";

const DEFAULT_FORM = {
  practice_name: "",
  site_name: "Main Site",
  locality: "",
  system_admin_model: "it-team",
  concerns_team: "Concerns Team",
  facilities_team: "Caretaker / Facilities",
  nursing_team: "Nursing Team",
  mobile_pin_required: true,
  sense_enabled: false,
};

const STEPS = [
  { title: "Welcome", icon: Building2 },
  { title: "Practice", icon: Building2 },
  { title: "Responsibilities", icon: Users },
  { title: "Mobile & Sense", icon: Nfc },
  { title: "Review", icon: ShieldCheck },
];

function SetupWizard({ onComplete, initialConfig = {} }) {
  const { user, displayName } = useAuth();
  const { setThemeId } = useMedTrakTheme();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ...DEFAULT_FORM, ...initialConfig });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canContinue = useMemo(() => step !== 1 || String(form.practice_name || "").trim().length >= 2, [step, form.practice_name]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function finish() {
    setSaving(true);
    setError("");
    try {
      await seedPracticeDefaults({ uid: user?.uid || "", displayName: displayName || "System Administrator" });
      await savePracticeConfig(
        {
          ...form,
          setup_complete: true,
          setup_completed_at: new Date().toISOString(),
          setup_version: "1.0",
          default_theme: "nhs-blue",
        },
        { uid: user?.uid || "", displayName: displayName || "System Administrator" }
      );
      setThemeId("nhs-blue");
      onComplete?.();
    } catch (err) {
      setError(err?.message || "Primovex setup could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-theme-page fixed inset-0 z-[200] overflow-y-auto">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:py-10">
        <header className="mt-card rounded-[2rem] border p-5 shadow-xl shadow-black/10 sm:p-7">
          <p className="mt-accent text-xs font-black uppercase tracking-[0.2em]">Primovex first-run setup</p>
          <h1 className="mt-text-primary mt-2 text-3xl font-black tracking-tight sm:text-4xl">Set up your practice operating system</h1>
          <p className="mt-text-secondary mt-2 max-w-3xl text-sm leading-6">A short guided setup creates the practice identity, responsibility defaults, mobile security choices and optional Sense foundation. These settings can be reopened later by a System Administrator.</p>
          <div className="mt-5 grid grid-cols-5 gap-2">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              const active = index === step;
              const complete = index < step;
              return <div key={item.title} className={`rounded-2xl border px-2 py-3 text-center ${active ? "mt-accent-soft" : "mt-button-secondary"}`}><Icon className={`mx-auto h-5 w-5 ${active || complete ? "mt-accent" : "mt-text-secondary"}`} /><p className="mt-text-primary mt-1 hidden text-[11px] font-bold sm:block">{item.title}</p></div>;
            })}
          </div>
        </header>

        <main className="mt-card mt-5 flex-1 rounded-[2rem] border p-5 shadow-xl shadow-black/10 sm:p-8">
          {step === 0 && <div className="max-w-2xl"><h2 className="mt-text-primary text-2xl font-black">Welcome to Primovex</h2><p className="mt-text-secondary mt-3 leading-7">NHS Blue will be the default experience. Primovex will guide your organisation through the essential settings without changing clinical systems or patient records.</p><div className="mt-accent-soft mt-6 rounded-3xl border p-5"><p className="mt-accent font-bold">You are setting up the organisation as {displayName || "System Administrator"}.</p><p className="mt-text-secondary mt-1 text-sm">The administrator can be an IT team, Practice Manager or another locally authorised person.</p></div></div>}

          {step === 1 && <div className="grid gap-5 sm:grid-cols-2"><Field label="Practice name" value={form.practice_name} onChange={(v) => update("practice_name", v)} placeholder="Clarence Medical Centre" /><Field label="Primary site" value={form.site_name} onChange={(v) => update("site_name", v)} placeholder="Main Site" /><Field label="Town / locality" value={form.locality} onChange={(v) => update("locality", v)} placeholder="Rhyl" /><Select label="Who provides system administration?" value={form.system_admin_model} onChange={(v) => update("system_admin_model", v)} options={[['it-team','IT department'],['practice-manager','Practice Manager'],['shared','Shared responsibility']]} /></div>}

          {step === 2 && <div className="grid gap-5 sm:grid-cols-2"><Field label="Concerns operational team" value={form.concerns_team} onChange={(v) => update("concerns_team", v)} /><Field label="Facilities owner" value={form.facilities_team} onChange={(v) => update("facilities_team", v)} /><Field label="Clinical stock owner" value={form.nursing_team} onChange={(v) => update("nursing_team", v)} /><div className="mt-button-secondary rounded-3xl border p-5 text-sm leading-6"><b className="mt-text-primary">Flexible by design.</b><br/><span className="mt-text-secondary">Primovex assigns capabilities and operational ownership locally. These defaults do not hard-code job titles.</span></div></div>}

          {step === 3 && <div className="space-y-4"><Toggle label="Require a mobile convenience PIN" note="Firebase authentication remains the account security boundary." checked={form.mobile_pin_required} onChange={(v) => update("mobile_pin_required", v)} /><Toggle label="Introduce Primovex Sense during setup" note="Creates the onboarding path for Spaces, NFC tags and future BLE nodes." checked={form.sense_enabled} onChange={(v) => update("sense_enabled", v)} /><div className="mt-accent-soft rounded-3xl border p-5 text-sm"><b className="mt-accent">NFC setup:</b> <span className="mt-text-secondary">tags remain rewritable during pilot testing. Native Android scanning is configured separately from the browser fallback.</span></div></div>}

          {step === 4 && <div><h2 className="mt-text-primary text-2xl font-black">Ready to launch</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><Review label="Practice" value={form.practice_name || "Not entered"} /><Review label="Primary site" value={form.site_name} /><Review label="System administration" value={form.system_admin_model.replaceAll('-', ' ')} /><Review label="Default theme" value="NHS Blue" /><Review label="Concerns team" value={form.concerns_team} /><Review label="Sense onboarding" value={form.sense_enabled ? "Enabled" : "Later"} /></div>{error && <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}</div>}
        </main>

        <footer className="mt-5 flex items-center justify-between gap-3">
          <button type="button" disabled={step === 0 || saving} onClick={() => setStep((v) => Math.max(0, v - 1))} className="mt-button-secondary inline-flex items-center gap-2 rounded-2xl border px-5 py-3 font-bold disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Back</button>
          {step < STEPS.length - 1 ? <button type="button" disabled={!canContinue} onClick={() => setStep((v) => Math.min(STEPS.length - 1, v + 1))} className="mt-button-primary inline-flex items-center gap-2 rounded-2xl border px-5 py-3 font-bold disabled:opacity-40">Continue<ChevronRight className="h-4 w-4" /></button> : <button type="button" disabled={saving} onClick={finish} className="mt-button-primary inline-flex items-center gap-2 rounded-2xl border px-5 py-3 font-bold disabled:opacity-60"><Check className="h-4 w-4" />{saving ? "Saving setup…" : "Launch Primovex"}</button>}
        </footer>
      </div>
    </div>
  );
}

export default function FirstRunSetupGate({ children, forceOpen = false, onClose }) {
  const { user, isAdmin, loading, isSyntheticMode } = useAuth();
  const [state, setState] = useState({ loading: true, config: null, complete: false });

  useEffect(() => {
    if (!user || isSyntheticMode) { setState({ loading: false, config: null, complete: true }); return undefined; }
    return onSnapshot(doc(db, "practice_config", "main"), (snapshot) => {
      const config = snapshot.exists() ? snapshot.data() : null;
      setState({ loading: false, config, complete: Boolean(config?.setup_complete) });
    }, () => setState({ loading: false, config: null, complete: true }));
  }, [user, isSyntheticMode]);

  if (loading || state.loading) return children;
  if ((forceOpen || !state.complete) && isAdmin) return <SetupWizard initialConfig={state.config || {}} onComplete={() => { setState((current) => ({ ...current, complete: true })); onClose?.(); }} />;
  return children;
}

function Field({ label, value, onChange, placeholder = "" }) { return <label className="block"><span className="mt-text-primary mb-2 block text-sm font-bold">{label}</span><input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-input h-12 w-full rounded-2xl border px-4 outline-none" /></label>; }
function Select({ label, value, onChange, options }) { return <label className="block"><span className="mt-text-primary mb-2 block text-sm font-bold">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="mt-input h-12 w-full rounded-2xl border px-4">{options.map(([id,text]) => <option value={id} key={id}>{text}</option>)}</select></label>; }
function Toggle({ label, note, checked, onChange }) { return <button type="button" onClick={() => onChange(!checked)} className="mt-button-secondary flex w-full items-center justify-between gap-4 rounded-3xl border p-5 text-left"><span><b className="mt-text-primary">{label}</b><small className="mt-text-secondary mt-1 block">{note}</small></span><span className={`relative h-7 w-12 shrink-0 rounded-full ${checked ? 'bg-[var(--medtrak-accent)]' : 'bg-slate-500/40'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`} /></span></button>; }
function Review({ label, value }) { return <div className="mt-button-secondary rounded-2xl border p-4"><p className="mt-text-secondary text-xs font-bold uppercase tracking-wide">{label}</p><p className="mt-text-primary mt-1 font-bold capitalize">{value}</p></div>; }
