import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { Bot, MessageSquareText, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { writeAuditEvent } from "@/core/identity/auditService";
import { getAiRouter } from "@/orb/AiRouter";

const dayKey = () => new Date().toISOString().slice(0, 10).replaceAll("-", "");

function Switch({ title, icon: Icon, intro, sees, safeguards, usage, limit, on, loaded, confirmText, busy, onChange }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Card className="border border-slate-800/70 bg-slate-900/70 p-5 text-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-sky-400/30 bg-sky-500/10 text-sky-200"><Icon className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-sm text-slate-400">{intro}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-500/20 text-slate-300"}`}>{!loaded ? "…" : on ? "On" : "Off"}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-emerald-100"><ShieldCheck className="h-4 w-4" /> What it can and can't see</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-emerald-50/90">{sees.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs leading-5 text-slate-300">
          <p className="text-sm font-semibold text-slate-100">Safeguards</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{safeguards.map((line) => <li key={line}>{line}</li>)}</ul>
          <p className="mt-2 text-slate-400">Used today: <b className="text-slate-100">{usage === null ? "—" : usage}</b> of {limit}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {on ? (
          <Button onClick={() => onChange(false)} disabled={busy} variant="outline" className="rounded-full border-rose-400/40 text-rose-200">Turn off</Button>
        ) : (
          <>
            <label className="flex max-w-xl items-start gap-2 text-xs text-slate-300">
              <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              {confirmText}
            </label>
            <Button onClick={async () => { await onChange(true); setConfirmed(false); }} disabled={busy || !confirmed} className="rounded-full bg-gradient-to-r from-teal-400 to-emerald-300 px-5 font-semibold text-slate-950">Turn on</Button>
          </>
        )}
      </div>
    </Card>
  );
}

// The administrator's switches for the Orb's AI. Two, deliberately separate, because they
// send different things to the model. Both are off unless turned on here.
export default function OrbAiSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [usage, setUsage] = useState({ route: null, phrase: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const day = dayKey();
    const offSettings = onSnapshot(doc(db, "settings", "orb"), (snap) => setSettings(snap.exists() ? snap.data() : {}), () => setSettings({}));
    const offRoute = onSnapshot(doc(db, "orb_ai_usage", `all_${day}`), (snap) => setUsage((u) => ({ ...u, route: snap.exists() ? snap.data().count || 0 : 0 })), () => {});
    const offPhrase = onSnapshot(doc(db, "orb_ai_usage", `p_all_${day}`), (snap) => setUsage((u) => ({ ...u, phrase: snap.exists() ? snap.data().count || 0 : 0 })), () => {});
    return () => { offSettings(); offRoute(); offPhrase(); };
  }, []);

  async function change(field, label, next) {
    setBusy(true);
    setError("");
    try {
      await setDoc(doc(db, "settings", "orb"), { [field]: next, updatedAt: serverTimestamp(), updatedByUid: user?.uid || null }, { merge: true });
      getAiRouter().reset();
      writeAuditEvent({
        action: "orb.ai.setting",
        module: "orb",
        targetType: "orb_setting",
        targetId: field,
        summary: `${label} turned ${next ? "on" : "off"}`,
        classification: "security",
        disclosureLevel: "restricted",
        metadata: { enabled: next },
      }).catch(() => {});
    } catch (err) {
      setError(err?.message || "Couldn't change the setting.");
    } finally {
      setBusy(false);
    }
  }

  const loaded = settings !== null;
  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}

      <Switch
        title="Orb language assistant: understanding questions"
        icon={Bot}
        intro="Lets staff ask the Orb in their own words. When the Orb doesn't recognise a question, an AI picks which approved lookup fits."
        sees={[
          "It sees the question, with numbers, dates, emails and phone numbers removed first, and the list of lookups that person is allowed to use.",
          "It never sees stock, temperatures, staff, patient or governance data. The lookup runs in the app with the person's own permissions.",
          "Concern and SAR lookups are never offered to it.",
        ]}
        safeguards={[
          "The Orb's own rules answer first and cost nothing. Only unrecognised questions go to the AI.",
          "Limits: 30 questions per person per hour, 1,500 for the practice per day.",
          "If the AI is off, slow or unsure, the Orb behaves exactly as before.",
          "Each use is audited (which lookup, never the question's words).",
        ]}
        usage={usage.route}
        limit="1,500"
        on={settings?.aiRouting === true}
        loaded={loaded}
        confirmText="I've checked that the Azure OpenAI resource is in a UK or EU region and that this use is covered by the practice's data protection assessment (DPIA)."
        busy={busy}
        onChange={(next) => change("aiRouting", "Orb language assistant (understanding questions)", next)}
      />

      <Switch
        title="Orb language assistant: wording the answers"
        icon={MessageSquareText}
        intro="Lets the AI put the Orb's answers into friendlier, clearer words. The facts always come from the app's own lookup."
        sees={[
          "It sees the question and the answer's facts: item, room, fridge and space names, counts and dates, with numbers like phone numbers and references removed.",
          "Only for stock, expiry, cleaning, fridge, alert, space, compliance and box-readiness answers. Never for tasks, notes, maintenance, the timeline, who cleaned or saw something, the team list, or concerns and SARs.",
          "It sends more than the first switch does (the answer, not just the question), so it needs its own DPIA entry. It can be on or off independently.",
        ]}
        safeguards={[
          "A reworded answer is thrown away, and the original used, if it contains any number that wasn't in the facts, or loses a warning (out of range, expired, out of stock).",
          "Limits: 30 per person per hour, 1,000 for the practice per day.",
          "If the AI is off, slow or rejected, you simply get the original answer.",
          "Each use is audited (which lookup and whether the wording was used, never the text).",
        ]}
        usage={usage.phrase}
        limit="1,000"
        on={settings?.aiPhrasing === true}
        loaded={loaded}
        confirmText="I understand this sends the Orb's answers (item, room and fridge names, counts, dates) to Azure OpenAI, I've checked the region, and this use is covered by the practice's DPIA."
        busy={busy}
        onChange={(next) => change("aiPhrasing", "Orb language assistant (wording the answers)", next)}
      />
    </div>
  );
}
