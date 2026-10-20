import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, Phone, ShieldCheck, X } from "lucide-react";
import {
  CONCERN_CATEGORIES,
  CONCERN_SOURCES,
  CONCERN_PRIORITIES,
  addDays,
  addWorkingDays,
  createConcern,
  createConcernReference,
  friendly,
  getConcernContact,
  subscribeConcernContact,
} from "@/modules/governance/services/concernService";
import {
  CONTACT_PREFERENCES,
  CONTACT_PREFERENCE_LABELS,
  legacyContact,
  hasContact,
  quickConcernSeed,
  replyIsEmpty,
  sourceLabel,
  validateConcernStep,
  wizardStepsFor,
} from "@/modules/governance/concernContact";

// Shared by the desktop and the phone: the fields for whoever raised a concern, the card that shows them, and the short
// "log a concern" sheet. Styled with the app's theme variables so it suits both.

const INPUT = "mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case text-[var(--medtrak-text)] outline-none focus:ring-2 focus:ring-[var(--medtrak-accent)]";
const LABEL = "block text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]";

// The person raising it: initials (when it is not the patient), phone, email and the best way to reach them.
export function ConcernContactFields({ form, update, showInitials = true, showReach = true }) {
  return (
    <div className="space-y-3">
      {showInitials && (
        <label className={LABEL}>Their initials
          <input value={form.raisedByInitials} onChange={(e) => update({ raisedByInitials: e.target.value.toUpperCase() })} placeholder="e.g. J.S." className={INPUT} autoComplete="off" />
        </label>
      )}
      {showReach && <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Phone number
          <input type="tel" inputMode="tel" value={form.raisedByPhone} onChange={(e) => update({ raisedByPhone: e.target.value })} placeholder="07123 456789" className={INPUT} autoComplete="off" />
        </label>
        <label className={LABEL}>Email address
          <input type="email" inputMode="email" value={form.raisedByEmail} onChange={(e) => update({ raisedByEmail: e.target.value })} placeholder="name@example.com" className={INPUT} autoComplete="off" />
        </label>
      </div>
      <div>
        <p className={LABEL}>Best way to reach them</p>
        <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Best way to reach them">
          {CONTACT_PREFERENCES.map((option) => (
            <button key={option} type="button" role="radio" aria-checked={form.raisedByPreferred === option} onClick={() => update({ raisedByPreferred: option })}
              className={`min-h-10 flex-1 rounded-xl border px-3 text-sm font-semibold ${form.raisedByPreferred === option ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : "border-[var(--medtrak-border)] text-[var(--medtrak-text)]"}`}>
              {CONTACT_PREFERENCE_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
      <p className="flex items-start gap-2 text-[11px] text-[var(--medtrak-muted)]"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Only the concerns team and the case owner can see these details. They never show in lists or printed packs. The person's full name and address stay in the paper file.</p>
      </>}
    </div>
  );
}

// Loads the saved details into an edit form, once. Until it has, saving leaves the details untouched.
export function useLoadedContact(concern, update) {
  useEffect(() => {
    if (!concern?.id) return undefined;
    let live = true;
    (async () => {
      const saved = (await getConcernContact(concern.id)) || legacyContact(concern);
      if (live) update({ raisedByPhone: saved.phone || "", raisedByEmail: saved.email || "", raisedByPreferred: saved.preferred || "either", contactLoaded: true });
    })();
    return () => { live = false; };
  }, [concern]); // eslint-disable-line react-hooks/exhaustive-deps
}

// On a case: who raised it and how to reach them. People who may not see the details are only told some exist.
export function ConcernContactCard({ concern, canSee }) {
  const [contact, setContact] = useState(undefined);
  useEffect(() => {
    if (!canSee) return undefined;
    return subscribeConcernContact(concern, setContact);
  }, [canSee, concern?.id, concern?.raisedByContactValue]); // eslint-disable-line react-hooks/exhaustive-deps
  const relationship = friendly(concern?.source || "patient");
  const who = [relationship, concern?.raisedByInitials].filter(Boolean).join(" — ");
  if (!canSee) {
    return concern?.hasContactDetails ? <p className="text-xs text-[var(--medtrak-muted)]">Raised by: {who}. Contact details are recorded; the concerns team and the owner can see them.</p> : <p className="text-xs text-[var(--medtrak-muted)]">Raised by: {who}</p>;
  }
  const shown = contact && hasContact(contact) ? contact : null;
  return (
    <div className="rounded-xl border border-[var(--medtrak-border)] p-3 text-sm" aria-label="Raised by">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Raised by</p>
      <p className="mt-1 font-semibold">{who}</p>
      {shown ? (
        <div className="mt-2 space-y-1.5">
          {shown.phone && <a href={`tel:${shown.phone.replace(/[^\d+]/g, "")}`} className="flex min-h-9 items-center gap-2 text-[var(--medtrak-accent)] underline"><Phone className="h-4 w-4" aria-hidden="true" />{shown.phone}</a>}
          {shown.email && <a href={`mailto:${shown.email}`} className="flex min-h-9 items-center gap-2 break-all text-[var(--medtrak-accent)] underline"><Mail className="h-4 w-4 shrink-0" aria-hidden="true" />{shown.email}</a>}
          <p className="text-xs text-[var(--medtrak-muted)]">Prefers: {CONTACT_PREFERENCE_LABELS[shown.preferred] || "Either"}</p>
        </div>
      ) : (
        <p className="mt-1 text-xs text-[var(--medtrak-muted)]">{contact === undefined ? "Loading…" : "No contact details recorded. Add them with Edit."}</p>
      )}
    </div>
  );
}

const fullForm = (quick) => ({
  ...quick,
  reference: createConcernReference(new Date()),
  externalReference: "",
  priority: CONCERN_PRIORITIES.low,
  desiredOutcome: "",
  namedContactName: "",
  earlyResolutionSuitable: true,
  dutyOfCandourConsidered: false,
  dutyOfCandourTriggered: false,
  clinicalReviewRequired: false,
  mddusRequired: false,
  gmpiReference: "",
  learningRequired: true,
});

const shortDate = (date) => date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

const STEP_TITLES = {
  who: "Who is raising it?",
  reply: "How do we reply to them?",
  patient: "Which patient is it about?",
  about: "What is it about?",
  owner: "Who will deal with it?",
  check: "Check it, then log it",
};

const STEP_HELP = {
  who: "Tap the one that fits best.",
  reply: "So the case owner can answer them. You can skip this if they did not leave any details.",
  patient: "Anonymised identifiers only. No patient names.",
  about: "Pick the type, then say what happened in a sentence or two.",
  owner: "You can leave this for later and the practice manager will pick it up.",
  check: "Look it over. Tap Change on anything that is not right.",
};

const longDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

function Tile({ selected, onClick, children }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-semibold ${selected ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : "border-[var(--medtrak-border)] text-[var(--medtrak-text)]"}`}>
      {children}
    </button>
  );
}

// "Log a concern", one question at a time: who raised it, how to reply, which patient, what it is about, who deals with it,
// then a last screen to check it. The deadlines are worked out, and everything else (priority, Duty of Candour, clinical
// review...) is filled in on the case when the owner reviews it. Used on the desktop and the phone.
export function QuickConcernSheet({ actor, users = [], onClose, onCreated }) {
  const [form, setForm] = useState(() => quickConcernSeed());
  const [useInitials, setUseInitials] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const top = useRef(null);
  const initialsBox = useRef(null);
  const errorBox = useRef(null);
  const update = (patch) => setForm((f) => ({ ...f, ...patch }));
  const raiserIsPatient = form.source === "patient";

  const steps = wizardStepsFor(users.length > 0);
  const step = steps[stepIndex];
  const last = stepIndex === steps.length - 1;

  useEffect(() => { top.current?.scrollTo?.({ top: 0 }); }, [stepIndex]);
  // what just appeared (the initials box, a message) is brought into view, as the tiles above push it off a small screen
  useEffect(() => { if (step === "who" && !raiserIsPatient) initialsBox.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [step, raiserIsPatient]);
  useEffect(() => { if (errors.length) errorBox.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [errors]);

  const dates = useMemo(() => {
    const received = form.receivedAt ? new Date(form.receivedAt) : new Date();
    if (Number.isNaN(received.getTime())) return null;
    return { ack: addWorkingDays(received, 5), final: addDays(received, 30) };
  }, [form.receivedAt]);

  function goTo(name) { setErrors([]); setStepIndex(Math.max(0, steps.indexOf(name))); }
  function back() { setErrors([]); setStepIndex((i) => Math.max(0, i - 1)); }
  function next() {
    const problems = validateConcernStep(step, form);
    setErrors(problems);
    if (!problems.length) setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  }
  function chooseSource(source) { update({ source, raisedByInitials: source === "patient" ? "" : form.raisedByInitials }); }
  function chooseOwner(uid) {
    const person = users.find((x) => x.id === uid);
    update({ ownerUid: uid, ownerName: uid ? (person?.displayName || person?.email || "Unassigned") : "Unassigned" });
  }
  function switchIdentifier() {
    setUseInitials((v) => !v);
    update(useInitials ? { patientInitials: "", dateOfBirth: "" } : { emisNumber: "" });
  }

  async function submit(event) {
    event.preventDefault();
    if (!last) { next(); return; }
    const problems = validateConcernStep("check", form);
    setErrors(problems);
    if (problems.length) return;
    setBusy(true);
    try {
      const id = await createConcern(fullForm(form), actor);
      onCreated?.(id);
      onClose?.();
    } catch (error) {
      setErrors([error?.message || "Could not log the concern."]);
    } finally {
      setBusy(false);
    }
  }

  const summaryRows = [
    ["Raised by", [sourceLabel(form.source), raiserIsPatient ? "" : form.raisedByInitials].filter(Boolean).join(" — "), "who"],
    ["Reply by", [form.raisedByPhone, form.raisedByEmail].filter(Boolean).join(" · ") || "No contact details", "reply"],
    ["Patient", form.emisNumber ? `EMIS ${form.emisNumber}` : `${form.patientInitials}, born ${longDate(form.dateOfBirth)}`, "patient"],
    ["Type", friendly(form.category), "about"],
    ["Received", longDate(form.receivedAt), "about"],
    ["About", form.summary, "about"],
    ...(users.length > 0 ? [["Dealt with by", form.ownerUid ? form.ownerName : "Decide later", "owner"]] : []),
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation">
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-labelledby="quick-concern-title" ref={top} className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 text-[var(--medtrak-text)] shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Log a concern · Step {stepIndex + 1} of {steps.length}</p>
            <h2 id="quick-concern-title" className="mt-1 text-xl font-black">{STEP_TITLES[step]}</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{STEP_HELP[step]}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--medtrak-border)]" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={stepIndex + 1} aria-label="Progress">
          <div className="h-full rounded-full bg-[var(--medtrak-accent)] transition-all" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
        </div>

        <div className="mt-5 space-y-3">
          {step === "who" && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Who is raising it">
                {CONCERN_SOURCES.map((option) => <Tile key={option} selected={form.source === option} onClick={() => chooseSource(option)}>{sourceLabel(option)}</Tile>)}
              </div>
              {!raiserIsPatient && <div ref={initialsBox}><ConcernContactFields form={form} update={update} showInitials showReach={false} /></div>}
            </>
          )}

          {step === "reply" && <ConcernContactFields form={form} update={update} showInitials={false} />}

          {step === "patient" && (
            <>
              {!useInitials ? (
                <label className={LABEL}>EMIS number
                  <input value={form.emisNumber} onChange={(e) => update({ emisNumber: e.target.value })} placeholder="e.g. 123456" className={INPUT} autoComplete="off" inputMode="numeric" />
                </label>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={LABEL}>Patient's initials<input value={form.patientInitials} onChange={(e) => update({ patientInitials: e.target.value.toUpperCase() })} placeholder="A.B." className={INPUT} autoComplete="off" /></label>
                  <label className={LABEL}>Date of birth<input type="date" value={form.dateOfBirth} onChange={(e) => update({ dateOfBirth: e.target.value })} className={INPUT} /></label>
                </div>
              )}
              <button type="button" onClick={switchIdentifier} className="text-sm font-semibold text-[var(--medtrak-accent)] underline">{useInitials ? "Use the EMIS number instead" : "No EMIS number? Use their initials and date of birth"}</button>
            </>
          )}

          {step === "about" && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Type of concern">
                {CONCERN_CATEGORIES.map((option) => <Tile key={option} selected={form.category === option} onClick={() => update({ category: option })}>{friendly(option)}</Tile>)}
              </div>
              <label className={LABEL}>Date received<input type="date" value={form.receivedAt} onChange={(e) => update({ receivedAt: e.target.value })} className={INPUT} /></label>
              <label className={LABEL}>In a sentence or two, without the patient's name
                <textarea value={form.summary} onChange={(e) => update({ summary: e.target.value })} rows={4} className={INPUT} placeholder="e.g. Waited 40 minutes past the appointment time and was not told why." />
              </label>
            </>
          )}

          {step === "owner" && (
            <label className={LABEL}>Who will deal with it?
              <select value={form.ownerUid} onChange={(e) => chooseOwner(e.target.value)} className={INPUT}>
                <option value="">Decide later</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.email || u.id}</option>)}
              </select>
            </label>
          )}

          {step === "check" && (
            <>
              <dl className="divide-y divide-[var(--medtrak-border)] rounded-xl border border-[var(--medtrak-border)]">
                {summaryRows.map(([label, value, target]) => (
                  <div key={label} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <dt className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">{label}</dt>
                      <dd className="mt-0.5 break-words font-semibold">{value || "—"}</dd>
                    </div>
                    <button type="button" onClick={() => goTo(target)} className="shrink-0 text-xs font-semibold text-[var(--medtrak-accent)] underline">Change</button>
                  </div>
                ))}
              </dl>
              {dates && <p className="rounded-xl bg-black/5 px-3 py-2 text-xs text-[var(--medtrak-muted)]">Worked out for you: acknowledge by <b>{shortDate(dates.ack)}</b>, final response by <b>{shortDate(dates.final)}</b>.</p>}
            </>
          )}
        </div>

        {errors.length > 0 && <ul ref={errorBox} className="mt-3 space-y-1 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}

        <div className="mt-5 flex gap-2 sm:justify-end">
          <button type="button" onClick={stepIndex === 0 ? onClose : back} className="min-h-12 flex-1 rounded-xl border border-[var(--medtrak-border)] px-5 font-semibold sm:flex-none">{stepIndex === 0 ? "Cancel" : "Back"}</button>
          <button type="submit" disabled={busy} className="min-h-12 flex-[2] rounded-xl bg-[var(--medtrak-accent)] px-6 font-bold text-white disabled:opacity-50 sm:flex-none">
            {last ? (busy ? "Logging…" : "Log concern") : step === "reply" && replyIsEmpty(form) ? "Skip" : "Next"}
          </button>
        </div>
      </form>
    </div>
  );
}
