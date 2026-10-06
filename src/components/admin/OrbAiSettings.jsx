import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { Bot, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { writeAuditEvent } from "@/core/identity/auditService";
import { getAiRouter } from "@/orb/AiRouter";

const dayKey = () => new Date().toISOString().slice(0, 10).replaceAll("-", "");

// The administrator's switch for the Orb's language assistant: understanding questions
// in ordinary words. Off unless turned on here. Shows how much it has been used today.
export default function OrbAiSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [usage, setUsage] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const offSettings = onSnapshot(doc(db, "settings", "orb"), (snap) => setSettings(snap.exists() ? snap.data() : {}), () => setSettings({}));
    const offUsage = onSnapshot(doc(db, "orb_ai_usage", `all_${dayKey()}`), (snap) => setUsage(snap.exists() ? snap.data() : { count: 0 }), () => setUsage(null));
    return () => { offSettings(); offUsage(); };
  }, []);

  const on = settings?.aiRouting === true;

  async function change(next) {
    setBusy(true);
    setError("");
    try {
      await setDoc(doc(db, "settings", "orb"), { aiRouting: next, updatedAt: serverTimestamp(), updatedByUid: user?.uid || null }, { merge: true });
      getAiRouter().reset();
      writeAuditEvent({
        action: "orb.ai.setting",
        module: "orb",
        targetType: "orb_setting",
        targetId: "aiRouting",
        summary: next ? "Orb language assistant turned on" : "Orb language assistant turned off",
        classification: "security",
        disclosureLevel: "restricted",
        metadata: { enabled: next },
      }).catch(() => {});
      setConfirmed(false);
    } catch (err) {
      setError(err?.message || "Couldn't change the setting.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border border-slate-800/70 bg-slate-900/70 p-5 text-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-sky-400/30 bg-sky-500/10 text-sky-200"><Bot className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold">Orb language assistant</h2>
            <p className="text-sm text-slate-400">Lets staff ask the Orb in their own words. When the Orb doesn't recognise a question, an AI picks which approved lookup fits.</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-500/20 text-slate-300"}`}>{settings === null ? "…" : on ? "On" : "Off"}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-emerald-100"><ShieldCheck className="h-4 w-4" /> What it can and can't see</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-emerald-50/90">
            <li>It sees the question, with numbers, dates, emails and phone numbers removed first, and the list of lookups that person is allowed to use.</li>
            <li>It never sees stock, temperatures, staff, patient or governance data. The lookup runs in the app with the person's own permissions.</li>
            <li>Concern and SAR lookups are never offered to it.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs leading-5 text-slate-300">
          <p className="text-sm font-semibold text-slate-100">Safeguards</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The Orb's own rules answer first and cost nothing. Only unrecognised questions go to the AI.</li>
            <li>Limits: 30 questions per person per hour, 1,500 for the practice per day.</li>
            <li>If the AI is off, slow or unsure, the Orb behaves exactly as before.</li>
            <li>Each use is audited (which lookup, never the question's words).</li>
          </ul>
          <p className="mt-2 text-slate-400">Used today: <b className="text-slate-100">{usage ? usage.count || 0 : "—"}</b> of 1,500</p>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {on ? (
          <Button onClick={() => change(false)} disabled={busy} variant="outline" className="rounded-full border-rose-400/40 text-rose-200">Turn off</Button>
        ) : (
          <>
            <label className="flex max-w-xl items-start gap-2 text-xs text-slate-300">
              <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              I've checked that the Azure OpenAI resource is in a UK or EU region and that this use is covered by the practice's data protection assessment (DPIA).
            </label>
            <Button onClick={() => change(true)} disabled={busy || !confirmed} className="rounded-full bg-gradient-to-r from-teal-400 to-emerald-300 px-5 font-semibold text-slate-950">Turn on</Button>
          </>
        )}
      </div>
    </Card>
  );
}
