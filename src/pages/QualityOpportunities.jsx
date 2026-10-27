import { useState } from "react";
import { CheckCircle2, ClipboardCheck, Eye, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { updateQualityOpportunity, useOpportunities } from "@/modules/clinflow/qualityOpportunities";
import { KIND_WORDS, STATUS_WORDS, patientLine } from "@/modules/clinflow/qualityOpportunityPayload";

// Quality opportunities (My work): the prompts colleagues have sent to you from ClinFlow letters to follow up, and the ones you sent. Each person only ever sees
// their own: the record holds the patient's initials, date of birth and NHS number, so the rules let only the sender and the recipient read it.

const CHIP = { new: "bg-amber-400/25 text-amber-100", seen: "bg-sky-400/20 text-sky-100", actioned: "bg-emerald-500/20 text-emerald-100", declined: "bg-rose-500/20 text-rose-100" };
const when = (value) => { const d = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : null; return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""; };

function Received({ item, onChanged }) {
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  async function set(status, text = "") {
    setBusy(true); setProblem("");
    try { await updateQualityOpportunity({ id: item.id, status, note: text }); setDeclining(false); onChanged?.(status); }
    catch (error) { setProblem(error?.message || "That could not be saved."); }
    setBusy(false);
  }
  const open = item.status === "new" || item.status === "seen";
  return (
    <li className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CHIP[item.status] || CHIP.new}`}>{STATUS_WORDS[item.status] || item.status}</span>
        <span className="rounded-md bg-violet-500/25 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-100">{KIND_WORDS[item.kind] || KIND_WORDS.quality}</span>
        {item.urgent && <span className="rounded-md bg-rose-500/30 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-100">Urgent</span>}
        {item.domain && item.kind !== "triage" && <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-100">{item.domain}</span>}
        <span className="text-xs text-slate-400">From {item.senderName} · {when(item.createdAt)}</span>
      </div>
      <h3 className="mt-2 text-base font-bold text-slate-100">{item.title}</h3>
      {item.rationale && <p className="mt-1 text-sm text-slate-300">{item.rationale}</p>}
      {item.nextStep && <p className="mt-2 rounded-lg border-l-4 border-sky-400 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.kind === "triage" ? "Where it should go" : "Next step"}</span>{item.nextStep}</p>}
      <p className="mt-2 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-100"><span className="block text-[10px] font-bold uppercase tracking-wide text-amber-200/80">Patient (find them in the clinical record)</span>{patientLine(item.patient)}</p>
      {item.note && <p className="mt-2 text-sm italic text-slate-300">“{item.note}” <span className="not-italic text-slate-400">· {item.senderName}</span></p>}
      {item.statusNote && <p className="mt-2 text-sm text-slate-300">Your note: {item.statusNote}</p>}
      {problem && <p className="mt-2 text-sm font-semibold text-rose-300" role="alert">{problem}</p>}
      {open && !declining && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.status === "new" && <button type="button" disabled={busy} onClick={() => set("seen")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40"><Eye size={14} /> Mark seen</button>}
          <button type="button" disabled={busy} onClick={() => set("actioned", done)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/90 px-3 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-40"><CheckCircle2 size={14} /> Done</button>
          <button type="button" disabled={busy} onClick={() => setDeclining(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40"><XCircle size={14} /> Decline</button>
          <input value={done} onChange={(e) => setDone(e.target.value.slice(0, 300))} placeholder="What was done (optional)" aria-label="What was done" className="min-w-[14rem] flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-teal-300/60" />
        </div>
      )}
      {open && declining && (
        <div className="mt-3 grid gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Why is it being declined?
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm font-normal normal-case text-slate-100 outline-none focus:border-teal-300/60" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy || !note.trim()} onClick={() => set("declined", note)} className="rounded-lg bg-rose-500/90 px-3 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-40">Decline it</button>
            <button type="button" onClick={() => setDeclining(false)} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5">Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}

function Sent({ item }) {
  return (
    <li className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CHIP[item.status] || CHIP.new}`}>{STATUS_WORDS[item.status] || item.status}</span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-violet-200">{KIND_WORDS[item.kind] || KIND_WORDS.quality}</span>
        <span className="text-sm font-semibold text-slate-100">{item.title}</span>
        <span className="text-xs text-slate-400">to {item.recipientName}{item.recipientRole ? ` (${item.recipientRole})` : ""} · {when(item.createdAt)}</span>
      </div>
      {item.statusNote && <p className="mt-1 text-sm text-slate-300">Their note: {item.statusNote}</p>}
    </li>
  );
}

export default function QualityOpportunities() {
  const { user } = useAuth();
  const { received, sent, loading, error } = useOpportunities(user?.uid);
  const waiting = received.filter((item) => item.status === "new" || item.status === "seen").length;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center gap-3">
        <ClipboardCheck className="h-7 w-7 text-teal-300" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-slate-50">From ClinFlow</h1>
          <p className="text-sm text-slate-400">Quality prompts and triage items colleagues have sent you from ClinFlow letters to follow up. Only you and the person who sent each one can see it.</p>
        </div>
      </header>
      {error && <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">{error}</p>}
      <section aria-label="Sent to you">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Sent to you{waiting ? ` · ${waiting} to follow up` : ""}</h2>
        {loading ? <p className="text-sm text-slate-400">Opening…</p> : received.length === 0 ? <p className="rounded-xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-400">Nothing has been sent to you yet.</p> : <ul className="space-y-3">{received.map((item) => <Received key={item.id} item={item} />)}</ul>}
      </section>
      {sent.length > 0 && (
        <section aria-label="Sent by you">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Sent by you</h2>
          <ul className="space-y-2">{sent.map((item) => <Sent key={item.id} item={item} />)}</ul>
        </section>
      )}
    </div>
  );
}
