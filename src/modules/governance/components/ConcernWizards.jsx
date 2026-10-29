import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Clock, X } from "lucide-react";
import {
  CONCERN_OUTCOME_LABELS,
  CORRESPONDENCE_TYPES,
  acknowledgeConcern,
  addConcernCorrespondence,
  addConcernMeeting,
  addConcernQuickNote,
  addConcernTimeline,
  addInvolvedUser,
  addCaseStep,
  closeConcernGuided,
  extendConcernDeadline,
  formatDateInput,
  friendly,
  markFinalResponseReady,
  recordListeningDiscussion,
  setStatementOnly,
  subscribeCaseSteps,
  subscribeLearningActions,
  toDate,
  updateConcern,
  withdrawCaseStep,
} from "@/modules/governance/services/concernService";
import {
  ASKED_BY, ASKED_FOR, LEARNING, closeStepsFor, isStatementOnly, LFE_STATUSES, OUTCOMES, RESPONSE_HOW, SENT_WHAT, STEP_ACTIONS,
  closeStepProblems, dayKey, orderedSteps, partyOf, partyStateText, reviewStatus, ukDay, updateChoices, withdrawalOf, WITHDRAWN,
} from "@/modules/governance/concernCase";

// The two wizards for a concern, shared by the desktop and the phone: "Update this case" (usable at any time: a reply from the
// indemnity insurer, a request from the patient, more time, a note…) and "Close this case" (which will not close it until the
// final response, learning, the Welsh Risk Pool report and the Duty of Candour have been dealt with). Styled with the app's theme
// variables so they suit both. One question at a time, and the person and the time are never asked for.

const INPUT = "mt-2 min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 text-base text-[var(--medtrak-text)] outline-none focus:border-[var(--medtrak-accent)]";
const LABEL = "block text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]";
const PRIMARY = "min-h-12 w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 text-base font-bold text-white disabled:opacity-40";
const SECONDARY = "min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] px-4 text-base font-semibold";

function Tile({ selected, onClick, children, note }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick} className={`rounded-2xl border px-4 py-3 text-left ${selected ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] text-[var(--medtrak-text)]"}`}>
      <span className="block text-sm font-bold">{children}</span>
      {note && <span className={`mt-0.5 block text-xs ${selected ? "text-white/85" : "text-[var(--medtrak-muted)]"}`}>{note}</span>}
    </button>
  );
}

function Shell({ title, eyebrow, progress, onClose, onBack, children }) {
  const top = useRef(null);
  useEffect(() => { top.current?.scrollTo?.({ top: 0 }); }, [title]);
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4" role="presentation">
      <div ref={top} role="dialog" aria-modal="true" aria-labelledby="concern-wizard-title" className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-5 text-[var(--medtrak-text)] shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            {onBack && <button type="button" onClick={onBack} className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>}
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">{eyebrow}</p>
              <h2 id="concern-wizard-title" className="mt-1 text-xl font-black">{title}</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {progress && (
          <div className="mt-3" aria-label={`Step ${progress[0]} of ${progress[1]}`}>
            <div className="flex gap-1.5">{Array.from({ length: progress[1] }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < progress[0] ? "bg-[var(--medtrak-accent)]" : "bg-[var(--medtrak-border)]"}`} />)}</div>
            <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Step {progress[0]} of {progress[1]}</p>
          </div>
        )}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

const Problems = ({ list }) => (list.length ? <ul className="mt-3 space-y-1 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700" role="alert">{list.map((p) => <li key={p}>{p}</li>)}</ul> : null);

// ---- where each outside party has got to, for the case page ----

const STATE_TONE = { accepted: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700", "with-them": "border-amber-500/40 bg-amber-500/10 text-amber-800", "back-to-us": "border-rose-500/40 bg-rose-500/10 text-rose-700", none: "border-[var(--medtrak-border)] text-[var(--medtrak-muted)]" };
const stateText = partyStateText;

export function useCaseSteps(concernId) {
  const [steps, setSteps] = useState([]);
  useEffect(() => subscribeCaseSteps(concernId, (rows) => setSteps(orderedSteps(rows)), () => setSteps([])), [concernId]);
  return steps;
}

export function CaseReviewPanel({ concern, steps, onUpdate, actor }) {
  const review = useMemo(() => reviewStatus(concern, steps), [concern, steps]);
  const [open, setOpen] = useState(false);
  const [taking, setTaking] = useState(""); // the step being taken back
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  // the steps taken back are shown struck through with the reason; the withdrawal records themselves are not listed twice
  const history = [...steps].filter((s) => s.action !== WITHDRAWN).reverse();
  async function takeBack(step) {
    setBusy(true); setProblem("");
    try { await withdrawCaseStep(concern.id, step, steps, reason, actor); setTaking(""); setReason(""); } catch (error) { setProblem(error?.message || "That could not be saved. Try again."); } finally { setBusy(false); }
  }
  if (!review.parties.length && !steps.length) return null;
  return (
    <section className="mt-4 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3 text-[var(--medtrak-text)]" aria-label="Outside review">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">With outside parties</p>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${review.ready ? STATE_TONE.accepted : STATE_TONE["with-them"]}`}>{review.ready ? "Ready for the final response" : "Not ready yet"}</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {review.parties.map((p) => (
          <li key={p.key} className={`rounded-xl border px-3 py-2 text-sm ${STATE_TONE[p.state]}`}>
            <b>{p.short}</b>{p.instructed ? " · solicitor instructed" : ""}<span className="block text-xs">{stateText(p)}</span>
            {p.state === "none" && <span className="block text-xs">Added in the case details. If that was a mistake, use Edit to clear it.</span>}
          </li>
        ))}
      </ul>
      {history.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 text-xs font-semibold text-[var(--medtrak-accent)] underline">{open ? "Hide the history" : `Show the history (${history.length})`}</button>
          {open && (
            <ul className="mt-2 divide-y divide-[var(--medtrak-border)] rounded-xl border border-[var(--medtrak-border)] text-sm">
              {history.map((s) => {
                const taken = withdrawalOf(steps, s);
                return (
                  <li key={s.id} className="px-3 py-2">
                    <span className={`font-semibold ${taken ? "line-through opacity-60" : ""}`}>{ukDay(s.occurredOn)} · {partyOf(s.party, steps)?.short}: {STEP_ACTIONS[s.action]}{s.round > 1 ? ` (time ${s.round})` : ""}</span>
                    {(s.what || s.note) && <span className={`block text-xs text-[var(--medtrak-muted)] ${taken ? "line-through opacity-60" : ""}`}>{[SENT_WHAT.find((w) => w.key === s.what)?.label, s.note].filter(Boolean).join(" · ")}</span>}
                    {taken && <span className="block text-xs font-semibold text-rose-700">Taken back as recorded by mistake ({ukDay(taken.occurredOn)}): {taken.note}</span>}
                    {onUpdate && !taken && taking !== s.id && <button type="button" onClick={() => { setTaking(s.id); setReason(""); setProblem(""); }} className="mt-1 text-xs font-semibold text-[var(--medtrak-accent)] underline">Recorded by mistake?</button>}
                    {taking === s.id && (
                      <div className="mt-2 space-y-2">
                        <label className="block text-xs font-bold">Why was it recorded by mistake?<textarea rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setProblem(""); }} placeholder="e.g. put under GMPI by mistake" className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-2 text-sm font-normal" /></label>
                        {problem && <p className="text-xs font-semibold text-rose-700" role="alert">{problem}</p>}
                        <div className="flex gap-2">
                          <button type="button" disabled={busy} onClick={() => takeBack(s)} className="rounded-xl bg-[var(--medtrak-accent)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">{busy ? "Saving…" : "Take it back"}</button>
                          <button type="button" onClick={() => { setTaking(""); setProblem(""); }} className="rounded-xl border border-[var(--medtrak-border)] px-3 py-1.5 text-xs font-semibold">Cancel</button>
                        </div>
                        <p className="text-xs text-[var(--medtrak-muted)]">Nothing is deleted. It stays in the history, struck through with your reason, and the case carries on as if it had not been recorded.</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {onUpdate && <button type="button" onClick={onUpdate} className="mt-3 w-full rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold">Update this case</button>}
    </section>
  );
}

// ---- Update this case ----

const REASONS_FOR_MORE_TIME = [
  { key: "indemnity", label: "Waiting for the indemnity insurer" },
  { key: "gmpi", label: "Waiting for GMPI" },
  { key: "healthboard", label: "Waiting for the Health Board" },
  { key: "patient", label: "The patient asked for more time" },
  { key: "investigation", label: "The investigation is taking longer" },
  { key: "other", label: "Something else" },
];
const STAGE_MOVES = [
  { key: "acknowledged", label: "Acknowledged", note: "We have told them we have it" },
  { key: "listening_offered", label: "Listening discussion offered", note: "" },
  { key: "listening_done", label: "Listening discussion held", note: "" },
  { key: "early_resolution", label: "Early resolution", note: "" },
  { key: "investigation", label: "Investigation", note: "" },
  { key: "response", label: "Writing the response", note: "" },
  { key: "learning", label: "Learning", note: "" },
];
const plusDays = (key, days) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + days); return dayKey(d); };

export function ConcernUpdateWizard({ concern, actor, users = [], onClose, initial = "" }) {
  const steps = useCaseSteps(concern?.id);
  const today = dayKey(new Date());
  const [choice, setChoice] = useState(initial);
  const [form, setForm] = useState({ date: today });
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState([]);
  const [done, setDone] = useState("");
  const set = (patch) => { setProblems([]); setForm((f) => ({ ...f, ...patch })); };

  const choices = useMemo(() => updateChoices(concern, steps), [concern, steps]);
  const review = useMemo(() => reviewStatus(concern, steps), [concern, steps]);
  const groups = useMemo(() => [...new Set(choices.map((c) => c.group))], [choices]);
  const chosen = choices.find((c) => c.key === choice) || null;
  const [kind, party] = choice.includes(":") ? choice.split(":") : [choice, ""];
  // someone not on the list ("other") is named by the person in the form
  const partyName = party === "other" ? String(form.partyName || "").trim() || "them" : partyOf(party, steps)?.short || "";
  const involvedIds = concern?.involvedUserIds || [];

  function pick(key) { setChoice(key); setProblems([]); setDone(""); setForm({ date: today, outcome: "", what: "draft_response" }); }
  const back = () => { setChoice(""); setProblems([]); setDone(""); };

  function requireDate() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.date || ""))) return "Give the date it happened.";
    if (form.date > today) return "That date is in the future.";
    return "";
  }

  async function save() {
    setProblems([]);
    setBusy(true);
    try {
      if (kind === "sent") {
        if (party === "other" && !String(form.partyName || "").trim()) throw new Error("Say who it was sent to.");
        await addCaseStep(concern.id, steps, { party, partyName: party === "other" ? form.partyName : "", action: "sent", occurredOn: form.date, what: form.what || "draft_response", note: form.note }, actor);
        setDone(`Recorded: sent to ${partyName}${steps.filter((s) => s.party === party && s.action === "sent").length ? " again" : ""}. It now shows as waiting for their reply.`);
      } else if (kind === "reply") {
        if (!form.outcome) throw new Error("Say what they replied: accepted, wants changes, or needs more information.");
        await addCaseStep(concern.id, steps, { party, action: form.outcome, occurredOn: form.date, note: form.note }, actor);
        setDone(form.outcome === "accepted" ? `Recorded: ${partyName} accepted it.` : `Recorded: ${partyName} came back. It is now back with us to deal with, then send again.`);
      } else if (kind === "gmpi_instructed") {
        await addCaseStep(concern.id, steps, { party: "gmpi", action: "instructed", occurredOn: form.date, note: form.note }, actor);
        setDone("Recorded: GMPI instructed a solicitor. The solicitor now shows on the case.");
      } else if (kind === "asked_meeting") {
        if (!form.askedBy) throw new Error("Say who asked for the meeting.");
        const requestedBy = ASKED_BY.find((a) => a.key === form.askedBy).label;
        await addConcernMeeting(concern.id, { requestedDate: form.date, requestedBy, bookedDate: form.bookedDate || "", bookedTime: form.bookedDate ? form.bookedTime || "" : "" }, actor);
        setDone(form.bookedDate ? `Recorded: a face-to-face meeting was requested and is booked for ${ukDay(form.bookedDate)}.` : "Recorded: a face-to-face meeting was requested. Book it from the meetings list when you have a date.");
      } else if (kind === "asked_other") {
        if (!form.askedFor) throw new Error("Say what they asked for.");
        const label = ASKED_FOR.find((a) => a.key === form.askedFor).label;
        await addConcernTimeline(concern.id, { type: "patient_request", title: `They asked for: ${label.toLowerCase()}`, message: `${ukDay(form.date)}.${form.note ? ` ${form.note}` : ""}`, actor });
        setDone(form.askedFor === "more_time" ? "Recorded. If you are going to take longer, choose 'We need more time' next to move the deadline." : "Recorded on the case.");
      } else if (kind === "contacted") {
        if (!form.type) throw new Error("Say how you were in touch.");
        if (!String(form.note || "").trim()) throw new Error("Say what was said or sent.");
        const bad = requireDate();
        if (bad) throw new Error(bad);
        await addConcernCorrespondence(concern.id, { type: form.type, occurredAt: form.date, notes: form.note }, actor);
        setDone("Recorded in the correspondence log.");
      } else if (kind === "letter_ready") {
        if (!review.ready && !String(form.note || "").trim()) throw new Error("Not everyone has accepted it yet. Say why it is ready to send.");
        await markFinalResponseReady(concern, { reason: review.ready ? "" : form.note, actor });
        setDone("Recorded: the final response letter is ready to send. When it has gone, use Close this case.");
      } else if (kind === "extend") {
        if (!form.newDue) throw new Error("Choose the new deadline.");
        if (!form.reason) throw new Error("Say why more time is needed.");
        const label = REASONS_FOR_MORE_TIME.find((r) => r.key === form.reason).label;
        await extendConcernDeadline(concern.id, concern.finalResponseDueAt, form.newDue, `${label}.${form.note ? ` ${form.note}` : ""}`, actor);
        setDone(`Recorded: the final response is now due ${ukDay(form.newDue)}. Remember to write to the patient to say so.`);
      } else if (kind === "owner") {
        if (!form.uid) throw new Error("Choose who is to deal with it.");
        const person = users.find((u) => u.id === form.uid);
        await updateConcern(concern.id, { ownerUid: form.uid, ownerName: person?.displayName || person?.email || "Unassigned" }, actor);
        setDone(`Recorded: ${person?.displayName || person?.email || "they"} now deal with this case.`);
      } else if (kind === "share") {
        if (!form.uid) throw new Error("Choose who to share it with.");
        await addInvolvedUser(concern.id, form.uid, actor);
        setDone("Recorded: they can now see this case.");
      } else if (kind === "note") {
        if (!String(form.note || "").trim()) throw new Error("Write the note.");
        await addConcernQuickNote(concern.id, form.note.trim(), actor);
        setDone("Note added to the case.");
      } else if (kind === "statement_toggle") {
        const turnOn = !isStatementOnly(concern);
        await setStatementOnly(concern.id, turnOn, actor);
        setDone(turnOn ? "Recorded: they only want a statement. Once it has been sent, use Close this case." : "Recorded: this case needs a full response, so the usual closing steps apply.");
      } else if (kind === "stage") {
        if (!form.stage) throw new Error("Choose the stage.");
        const dated = ["acknowledged", "listening_offered", "listening_done"].includes(form.stage);
        if (dated) { const bad = requireDate(); if (bad) throw new Error(bad); }
        if (form.stage === "acknowledged") await acknowledgeConcern(concern, actor, form.date);
        else if (form.stage === "listening_offered") await recordListeningDiscussion(concern, actor, false, form.date);
        else if (form.stage === "listening_done") await recordListeningDiscussion(concern, actor, true, form.date);
        else await updateConcern(concern.id, { status: form.stage }, actor);
        setDone(`Recorded: moved to ${STAGE_MOVES.find((s) => s.key === form.stage).label.toLowerCase()}.`);
      }
    } catch (error) {
      setProblems([error?.message || "That could not be saved. Try again."]);
    } finally {
      setBusy(false);
    }
  }

  // ---- what to show ----
  if (!choice) {
    return (
      <Shell title="What has happened?" eyebrow={`Update ${concern.reference || "this case"}`} onClose={onClose}>
        <p className="text-sm text-[var(--medtrak-muted)]">Pick the one that fits. You can come back and add another at any time.</p>
        {groups.map((group) => (
          <div key={group} className="mt-4">
            <p className={LABEL}>{group}</p>
            <div className="mt-2 grid gap-2">
              {choices.filter((c) => c.group === group).map((c) => (
                <button key={c.key} type="button" onClick={() => pick(c.key)} className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${c.urgent ? "border-amber-500/50 bg-amber-500/10" : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]"}`}>
                  <span className="min-w-0"><span className="block text-sm font-bold">{c.label}</span><span className="block text-xs text-[var(--medtrak-muted)]">{c.hint}</span></span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--medtrak-muted)]" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Done" eyebrow={`Update ${concern.reference || "this case"}`} onClose={onClose}>
        <p className="flex items-start gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-800" role="status"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />{done}</p>
        {steps.length > 0 && <ul className="mt-3 space-y-1 text-sm text-[var(--medtrak-muted)]">{review.parties.map((p) => <li key={p.key}><b className="text-[var(--medtrak-text)]">{p.short}:</b> {stateText(p)}</li>)}</ul>}
        <button type="button" onClick={back} className={`${PRIMARY} mt-5`}>Do something else on this case</button>
        <button type="button" onClick={onClose} className={`${SECONDARY} mt-3`}>I have finished</button>
      </Shell>
    );
  }

  const title = chosen?.label || "Details";
  const dateField = (label = "When did it happen?") => (
    <label className={`${LABEL} mt-4`}>{label}
      <input type="date" max={today} value={form.date || ""} onChange={(e) => set({ date: e.target.value })} className={INPUT} />
    </label>
  );
  const noteField = (label, placeholder, required = false) => (
    <label className={`${LABEL} mt-4`}>{label}{required ? "" : " (optional)"}
      <textarea rows={3} value={form.note || ""} onChange={(e) => set({ note: e.target.value })} placeholder={placeholder} className={`${INPUT} py-3`} />
    </label>
  );
  const otherUsers = users.filter((u) => kind === "share" ? !involvedIds.includes(u.id) : u.id !== concern.ownerUid);

  return (
    <Shell title={title} eyebrow={`Update ${concern.reference || "this case"}`} onClose={onClose} onBack={back}>
      {kind === "sent" && (
        <>
          <p className="text-sm text-[var(--medtrak-muted)]">{review.parties.find((p) => p.key === party)?.state === "back-to-us" ? `After making the changes ${partyName} asked for.` : `Record that it went to ${partyName}.`}</p>
          {party === "other" && (
            <label className={`${LABEL} mt-4`}>Who was it sent to?
              <input value={form.partyName || ""} onChange={(e) => set({ partyName: e.target.value })} maxLength={60} placeholder="e.g. the clinical expert, or the other practice" className={INPUT} />
            </label>
          )}
          {dateField("Date sent")}
          <p className={`${LABEL} mt-4`}>What did you send?</p>
          <div className="mt-2 grid gap-2" role="radiogroup" aria-label="What was sent">{SENT_WHAT.map((w) => <Tile key={w.key} selected={(form.what || "draft_response") === w.key} onClick={() => set({ what: w.key })}>{w.label}</Tile>)}</div>
          {noteField("A note", "e.g. version 2, with the changes to the second paragraph")}
        </>
      )}

      {kind === "reply" && (
        <>
          <p className="text-sm text-[var(--medtrak-muted)]">What did {partyName} say?</p>
          {dateField("Date they replied")}
          <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Their reply">
            <Tile selected={form.outcome === "accepted"} onClick={() => set({ outcome: "accepted" })} note="We can move on">They accepted it</Tile>
            <Tile selected={form.outcome === "changes"} onClick={() => set({ outcome: "changes" })} note="It comes back to us to change, then we send it again">They want changes</Tile>
            <Tile selected={form.outcome === "info"} onClick={() => set({ outcome: "info" })} note="We need to get it for them">They need more information</Tile>
          </div>
          {(form.outcome === "changes" || form.outcome === "info") && noteField(form.outcome === "changes" ? "What changes do they want?" : "What do they need?", "Write it so the next person can pick it up", true)}
          {form.outcome === "accepted" && noteField("A note", "e.g. reference number they gave")}
        </>
      )}

      {kind === "gmpi_instructed" && (<>{dateField("Date it was instructed")}{noteField("Which firm, if you know", "e.g. the firm's name")}</>)}

      {kind === "asked_meeting" && (
        <>
          <p className={LABEL}>Who asked?</p>
          <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Who asked for the meeting">{ASKED_BY.map((a) => <Tile key={a.key} selected={form.askedBy === a.key} onClick={() => set({ askedBy: a.key })}>{a.label}</Tile>)}</div>
          {dateField("Date they asked")}
          <label className={`${LABEL} mt-4`}>Date booked, if you have one (optional)
            <input type="date" value={form.bookedDate || ""} onChange={(e) => set({ bookedDate: e.target.value })} className={INPUT} />
          </label>
          {form.bookedDate && <label className={`${LABEL} mt-3`}>Time (optional)<input type="time" value={form.bookedTime || ""} onChange={(e) => set({ bookedTime: e.target.value })} className={INPUT} /></label>}
        </>
      )}

      {kind === "asked_other" && (
        <>
          <p className={LABEL}>What did they ask for?</p>
          <div className="mt-2 grid gap-2" role="radiogroup" aria-label="What they asked for">{ASKED_FOR.map((a) => <Tile key={a.key} selected={form.askedFor === a.key} onClick={() => set({ askedFor: a.key })}>{a.label}</Tile>)}</div>
          {dateField("Date they asked")}
          {noteField("A note", "Anything to remember about it")}
        </>
      )}

      {kind === "contacted" && (
        <>
          <p className={LABEL}>How were you in touch?</p>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="How you were in touch">{CORRESPONDENCE_TYPES.map((t) => <Tile key={t} selected={form.type === t} onClick={() => set({ type: t })}>{t === "meeting" ? "Face-to-face meeting" : friendly(t)}</Tile>)}</div>
          {dateField("Date")}
          {noteField("What was said or sent?", "A line or two", true)}
        </>
      )}

      {kind === "letter_ready" && (
        <>
          {review.ready
            ? <p className="flex items-start gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{review.parties.length ? "Everyone involved has accepted it." : "No outside party is involved in this case."}</p>
            : <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900"><p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Not everyone has accepted it yet</p><ul className="mt-1 list-disc pl-5">{review.blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>}
          {!review.ready && noteField("Why is it ready to send?", "e.g. the deadline is today and they agreed by phone", true)}
        </>
      )}

      {kind === "extend" && (
        <>
          <p className="text-sm text-[var(--medtrak-muted)]">Currently due {toDate(concern.finalResponseDueAt) ? toDate(concern.finalResponseDueAt).toLocaleDateString("en-GB") : "not set"}.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">{[[7, "1 week"], [14, "2 weeks"], [28, "4 weeks"]].map(([days, label]) => {
            const base = formatDateInput(toDate(concern.finalResponseDueAt) || new Date());
            const value = plusDays(base, days);
            return <button key={days} type="button" onClick={() => set({ newDue: value })} className={`rounded-xl border px-2 py-3 text-sm font-bold ${form.newDue === value ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]"}`}>+ {label}</button>;
          })}</div>
          <label className={`${LABEL} mt-3`}>Or choose the date<input type="date" value={form.newDue || ""} onChange={(e) => set({ newDue: e.target.value })} className={INPUT} /></label>
          <p className={`${LABEL} mt-4`}>Why?</p>
          <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Why more time">{REASONS_FOR_MORE_TIME.map((r) => <Tile key={r.key} selected={form.reason === r.key} onClick={() => set({ reason: r.key })}>{r.label}</Tile>)}</div>
          {noteField("A note", "")}
        </>
      )}

      {(kind === "owner" || kind === "share") && (
        <label className={LABEL}>{kind === "owner" ? "Who should deal with it?" : "Who should be able to see it?"}
          <select value={form.uid || ""} onChange={(e) => set({ uid: e.target.value })} className={INPUT}>
            <option value="">Choose a person…</option>
            {otherUsers.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.email || u.id}</option>)}
          </select>
        </label>
      )}

      {kind === "note" && noteField("Your note", "Anything to remember about this case", true)}

      {kind === "statement_toggle" && (
        <p className="text-sm text-[var(--medtrak-muted)]">{isStatementOnly(concern)
          ? "This case is marked as needing only a statement. Switch it back if they now want a full response."
          : "Use this when they only want a statement, for example the Health Board. Once the statement has been sent the case can be closed without the learning, Welsh Risk Pool or Duty of Candour steps."}</p>
      )}

      {kind === "stage" && (
        <>
          <p className="text-sm text-[var(--medtrak-muted)]">Now at: {friendly(concern.status)}. Closing the case has its own steps.</p>
          <div className="mt-3 grid gap-2" role="radiogroup" aria-label="The stage">{STAGE_MOVES.map((s) => <Tile key={s.key} selected={form.stage === s.key} onClick={() => set({ stage: s.key })} note={s.note}>{s.label}</Tile>)}</div>
          {["acknowledged", "listening_offered", "listening_done"].includes(form.stage) && (
            <>
              {dateField("What day was it?")}
              <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Use the day it really happened, even if that was a while ago. The case stays at the stage it has reached.</p>
            </>
          )}
        </>
      )}

      <Problems list={problems} />
      <button type="button" onClick={save} disabled={busy} className={`${PRIMARY} mt-5`}>{busy ? "Saving…" : kind === "stage" ? "Move it" : kind === "statement_toggle" ? (isStatementOnly(concern) ? "Switch back to a full response" : "Mark as statement only") : "Record this"}</button>
    </Shell>
  );
}

// ---- Close this case ----

const CLOSE_TITLES = {
  response: "Has the final response been sent?",
  learning: "Is there anything to learn?",
  lfe: "Does the Welsh Risk Pool need a report?",
  candour: "The Duty of Candour",
  outcome: "What was the outcome?",
  check: "Check it, then close the case",
};

export function ConcernCloseWizard({ concern, actor, onClose, onClosed }) {
  const steps = useCaseSteps(concern?.id);
  const [learningActions, setLearningActions] = useState([]);
  useEffect(() => subscribeLearningActions(concern?.id, setLearningActions, () => setLearningActions([])), [concern?.id]);
  const today = dayKey(new Date());
  const [index, setIndex] = useState(0);
  const [closing, setClosing] = useState({ responseSentOn: today, newLearning: [], lfe: concern?.lfeReportStatus && concern.lfeReportStatus !== "not_required" ? concern.lfeReportStatus : "", candourConsidered: concern?.dutyOfCandourConsidered === true ? true : undefined });
  const [newLine, setNewLine] = useState("");
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const statementOnly = isStatementOnly(concern);
  const closeSteps = closeStepsFor(concern);
  const step = closeSteps[index];
  const learningCount = learningActions.length;
  const review = useMemo(() => reviewStatus(concern, steps), [concern, steps]);
  const ctx = { closing, concern, steps, learningCount };
  const set = (patch) => { setProblems([]); setClosing((c) => ({ ...c, ...patch })); };

  function next() {
    const found = closeStepProblems(step, ctx);
    setProblems(found);
    if (!found.length) setIndex((i) => Math.min(closeSteps.length - 1, i + 1));
  }
  const back = () => { setProblems([]); setIndex((i) => Math.max(0, i - 1)); };
  const addLine = () => { const text = newLine.trim(); if (!text) return; set({ newLearning: [...(closing.newLearning || []), text] }); setNewLine(""); };

  async function close() {
    setBusy(true); setProblems([]);
    try {
      await closeConcernGuided({ concern, steps, closing, learningCount, actor });
      setFinished(true);
      onClosed?.();
    } catch (error) {
      setProblems([error?.message || "The case could not be closed. Try again."]);
    } finally {
      setBusy(false);
    }
  }

  if (finished) {
    return (
      <Shell title="Case closed" eyebrow={`Close ${concern.reference || "this case"}`} onClose={onClose}>
        <p className="flex items-start gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-800" role="status"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />{concern.reference} is closed. Everything you recorded is on the case timeline.</p>
        <button type="button" onClick={onClose} className={`${PRIMARY} mt-5`}>Done</button>
      </Shell>
    );
  }

  const summaryRows = statementOnly ? [
    ["Statement", `${ukDay(closing.responseSentOn)} · ${RESPONSE_HOW.find((h) => h.key === closing.responseHow)?.label || ""}`, 0],
    ["Outcome", CONCERN_OUTCOME_LABELS.statement_provided, 0],
  ] : [
    ["Final response", `${ukDay(closing.responseSentOn)} · ${RESPONSE_HOW.find((h) => h.key === closing.responseHow)?.label || ""}${review.ready ? "" : " (before everyone had accepted)"}`, 0],
    ["Learning", closing.learning === "yes" ? `${learningCount + (closing.newLearning || []).length} to follow up` : `None: ${closing.learningNote || ""}`, 1],
    ["Welsh Risk Pool report", LFE_STATUSES.find((s) => s.key === closing.lfe)?.label || "", 2],
    ["Duty of Candour", closing.candourTriggered ? "Triggered" : "Considered, not triggered", 3],
    ["Outcome", CONCERN_OUTCOME_LABELS[closing.outcome] || "", 4],
  ];

  return (
    <Shell title={statementOnly && step === "response" ? "Has the statement been sent?" : CLOSE_TITLES[step]} eyebrow={`Close ${concern.reference || "this case"}`} progress={[index + 1, closeSteps.length]} onClose={onClose} onBack={index > 0 ? back : undefined}>
      {step === "response" && (
        <>
          <p className="text-sm text-[var(--medtrak-muted)]">{statementOnly ? "They only asked for a statement. The case is closed once it has gone." : "A case is closed once the final response has gone."}</p>
          {!statementOnly && !review.ready && (
            <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-bold"><Clock className="h-4 w-4" aria-hidden="true" /> Not everyone involved has accepted it</p>
              <ul className="mt-1 list-disc pl-5">{review.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          )}
          <label className={`${LABEL} mt-4`}>Date it was sent<input type="date" max={today} value={closing.responseSentOn || ""} onChange={(e) => set({ responseSentOn: e.target.value })} className={INPUT} /></label>
          <p className={`${LABEL} mt-4`}>How was it sent?</p>
          <div className="mt-2 grid gap-2" role="radiogroup" aria-label="How it was sent">{RESPONSE_HOW.map((h) => <Tile key={h.key} selected={closing.responseHow === h.key} onClick={() => set({ responseHow: h.key })}>{h.label}</Tile>)}</div>
          {!statementOnly && !review.ready && <label className={`${LABEL} mt-4`}>Why was it sent before they accepted?<textarea rows={2} value={closing.overrideReason || ""} onChange={(e) => set({ overrideReason: e.target.value })} placeholder="e.g. the deadline was today and they agreed by phone" className={`${INPUT} py-3`} /></label>}
        </>
      )}

      {step === "learning" && (
        <>
          <div className="grid gap-2" role="radiogroup" aria-label="Anything to learn">{LEARNING.map((l) => <Tile key={l.key} selected={closing.learning === l.key} onClick={() => set({ learning: l.key })}>{l.label}</Tile>)}</div>
          {closing.learning === "yes" && (
            <>
              {learningActions.length > 0 && <ul className="mt-3 space-y-1 text-sm">{learningActions.map((a) => <li key={a.id} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2">{a.title}</li>)}</ul>}
              {(closing.newLearning || []).length > 0 && <ul className="mt-2 space-y-1 text-sm">{closing.newLearning.map((l, i) => <li key={`${l}-${i}`} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2"><span>{l}</span><button type="button" onClick={() => set({ newLearning: closing.newLearning.filter((_, j) => j !== i) })} className="text-xs font-semibold underline" aria-label={`Remove ${l}`}>Remove</button></li>)}</ul>}
              <label className={`${LABEL} mt-3`}>What will change or be looked at?
                <span className="mt-2 flex gap-2"><input value={newLine} onChange={(e) => setNewLine(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine(); } }} placeholder="e.g. Change the phone message wording" className="min-h-12 flex-1 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 text-base font-normal normal-case text-[var(--medtrak-text)] outline-none" /><button type="button" onClick={addLine} className="rounded-2xl bg-[var(--medtrak-accent)] px-4 font-bold text-white">Add</button></span>
              </label>
            </>
          )}
          {closing.learning === "none" && <label className={`${LABEL} mt-3`}>Why is there nothing to learn?<textarea rows={2} value={closing.learningNote || ""} onChange={(e) => set({ learningNote: e.target.value })} placeholder="e.g. A one-off. The process was followed." className={`${INPUT} py-3`} /></label>}
        </>
      )}

      {step === "lfe" && (
        <>
          <p className="text-sm text-[var(--medtrak-muted)]">A Learning from Events report goes to the Welsh Risk Pool for some cases.</p>
          <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Welsh Risk Pool report">{LFE_STATUSES.map((s) => <Tile key={s.key} selected={closing.lfe === s.key} onClick={() => set({ lfe: s.key })}>{s.label}</Tile>)}</div>
          {closing.lfe === "in_progress" && <p className="mt-3 text-sm text-amber-800">You can close the case while it is being prepared. Update it from the case when it has been sent.</p>}
        </>
      )}

      {step === "candour" && (
        <>
          <button type="button" role="checkbox" aria-checked={closing.candourConsidered === true} onClick={() => set({ candourConsidered: closing.candourConsidered === true ? false : true })} className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left ${closing.candourConsidered === true ? "border-emerald-500/50 bg-emerald-500/10" : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]"}`}>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${closing.candourConsidered === true ? "bg-emerald-500 text-white" : "border border-[var(--medtrak-border)]"}`}>{closing.candourConsidered === true && <CheckCircle2 className="h-5 w-5" />}</span>
            <span className="text-sm font-bold">We have considered whether the Duty of Candour applies</span>
          </button>
          {closing.candourConsidered === true && (
            <>
              <p className={`${LABEL} mt-4`}>Was it triggered?</p>
              <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Duty of Candour triggered">
                <Tile selected={closing.candourTriggered === false} onClick={() => set({ candourTriggered: false })}>No</Tile>
                <Tile selected={closing.candourTriggered === true} onClick={() => set({ candourTriggered: true })}>Yes</Tile>
              </div>
              {closing.candourTriggered === true && <label className={`${LABEL} mt-4`}>How was the patient told?<textarea rows={2} value={closing.candourNote || ""} onChange={(e) => set({ candourNote: e.target.value })} placeholder="e.g. By phone on the 18th, then in writing" className={`${INPUT} py-3`} /></label>}
            </>
          )}
        </>
      )}

      {step === "outcome" && <div className="grid gap-2" role="radiogroup" aria-label="Outcome">{OUTCOMES.map((o) => <Tile key={o.key} selected={closing.outcome === o.key} onClick={() => set({ outcome: o.key })}>{o.label}</Tile>)}</div>}

      {step === "check" && (
        <>
          <dl className="divide-y divide-[var(--medtrak-border)] rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]">
            {summaryRows.map(([label, value, target]) => (
              <div key={label} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0"><dt className={LABEL}>{label}</dt><dd className="mt-0.5 break-words font-semibold">{value || "—"}</dd></div>
                <button type="button" onClick={() => { setProblems([]); setIndex(target); }} className="shrink-0 text-xs font-semibold text-[var(--medtrak-accent)] underline">Change</button>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-[var(--medtrak-muted)]">Closing writes all of this to the case timeline, with your name and today's date.</p>
        </>
      )}

      <Problems list={problems} />
      {step === "check"
        ? <button type="button" onClick={close} disabled={busy} className={`${PRIMARY} mt-5`}>{busy ? "Closing…" : "Close this case"}</button>
        : <button type="button" onClick={next} className={`${PRIMARY} mt-5`}>Next</button>}
    </Shell>
  );
}
