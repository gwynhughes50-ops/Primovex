import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query, serverTimestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { AlertTriangle, CheckCircle2, ChevronLeft, Thermometer, X } from "lucide-react";
import { addDocResendSafe } from "@/lib/resendSafeWrites";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { isQuarantined } from "@/modules/temperature/fridgeIncidents";
import { ACTIONS, buildIncidentDoc, buildReadingDoc, checkReadings, dateKeyOf, normaliseUnit, parseTemp, rangeFor, resolveUnit, slotOf } from "./fridgeCheck";

// The manual fridge check, one question at a time: the current reading on the thermometer, then its
// minimum, then its maximum, then "I pressed reset", then a summary that says in or out of range. The
// person and the time are added automatically. An out-of-range check also asks what was done (ticked,
// not typed) and opens an incident. Opened by scanning the fridge's tag (NFC or QR).

const STEPS = [
  { key: "current", title: "What does it read now?", hint: "The big number on the thermometer display.", label: "Current temperature" },
  { key: "min", title: "What is the minimum?", hint: "Press MIN on the thermometer and read the lowest it has been.", label: "Minimum" },
  { key: "max", title: "What is the maximum?", hint: "Press MAX on the thermometer and read the highest it has been.", label: "Maximum" },
];
const TOTAL = STEPS.length + 2; // + reset, + review

const timeText = (date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function MobileFridgeCheckSheet({ asset, onClose }) {
  const { user, displayName, email } = useAuth();
  const actor = useMemo(() => ({ uid: user?.uid || null, displayName: displayName || user?.displayName || "", email: email || user?.email || "" }), [user, displayName, email]);
  const [units, setUnits] = useState(null); // null while loading
  const [step, setStep] = useState(0);
  const [text, setText] = useState({ current: "", min: "", max: "" });
  const [reset, setReset] = useState(false);
  const [actionKeys, setActionKeys] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // { outOfRange }
  const [already, setAlready] = useState(null); // a reading already recorded in this slot
  const [quarantined, setQuarantined] = useState(false); // a manager has quarantined this fridge
  const [opened] = useState(() => new Date());

  // the Temperature page's own list of units, to find this fridge's range and site
  useEffect(() => {
    let live = true;
    getDocs(query(collection(db, "temperature_units"), limit(200)))
      .then((snap) => { if (live) setUnits(snap.docs.map((d) => normaliseUnit(d.id, d.data()))); })
      .catch(() => { if (live) setUnits([]); });
    return () => { live = false; };
  }, []);

  const unit = useMemo(() => (units ? resolveUnit(asset, units) : null), [asset, units]);
  const range = useMemo(() => rangeFor(asset, unit), [asset, unit]);
  const unitId = unit?.id || asset?.monitoring?.fridgeId || asset?.id;

  // one check a morning and one an afternoon per fridge, as on the Temperature page; a second is only
  // allowed after a reading that was out of range (to confirm it has recovered)
  useEffect(() => {
    if (!unitId) return;
    getDocs(query(collection(db, "temperature_logs"), where("unitId", "==", unitId), where("dateKey", "==", dateKeyOf(opened)), where("slot", "==", slotOf(opened)), limit(1)))
      .then((snap) => { const row = snap.docs[0]?.data(); setAlready(row && !row.outOfRange ? row : null); })
      .catch(() => setAlready(null));
  }, [unitId, opened]);

  // is this fridge quarantined? Said at the top so nobody takes stock from it
  useEffect(() => {
    if (!unitId) return;
    getDocs(query(collection(db, "temperature_incidents"), where("unitId", "==", unitId), where("status", "==", "open"), limit(10)))
      .then((snap) => setQuarantined(snap.docs.some((d) => isQuarantined(d.data()))))
      .catch(() => setQuarantined(false));
  }, [unitId]);

  const readings = { current: parseTemp(text.current), min: parseTemp(text.min), max: parseTemp(text.max) };
  const result = checkReadings(readings, range);
  const onNumberStep = step < STEPS.length;
  const key = onNumberStep ? STEPS[step].key : null;
  const stepValue = key ? parseTemp(text[key]) : null;
  const isReview = step === STEPS.length + 1;
  const needsActions = isReview && result.outOfRange;

  const setValue = (value) => { setError(""); setText((old) => ({ ...old, [key]: value })); };
  const flipSign = () => setValue(String(text[key]).startsWith("-") ? String(text[key]).slice(1) : `-${text[key]}`);
  const next = () => {
    setError("");
    if (onNumberStep && stepValue === null) { setError("Enter the number shown, for example 4.5"); return; }
    if (step === STEPS.length && !reset) { setError("Press reset on the thermometer, then tick the box."); return; }
    // once all three are in, impossible combinations are caught before the summary
    if (step === STEPS.length - 1) {
      const check = checkReadings({ ...readings, max: stepValue }, range);
      if (check.errors.length) { setError(check.errors[0]); return; }
    }
    setStep((s) => s + 1);
  };
  const toggleAction = (actionKey) => setActionKeys((old) => (old.includes(actionKey) ? old.filter((k) => k !== actionKey) : [...old, actionKey]));

  async function save() {
    if (result.errors.length) { setError(result.errors[0]); return; }
    if (needsActions && !actionKeys.length) { setError("Tick what was done, even if it's only that you told someone."); return; }
    setBusy(true);
    setError("");
    const now = new Date();
    try {
      await addDocResendSafe(collection(db, "temperature_logs"), {
        ...buildReadingDoc({ asset, unit, range, readings, actor, now, checked: { reset, outOfRange: result.outOfRange } }),
        created_at: serverTimestamp(),
      });
      if (result.outOfRange) {
        try {
          const incidentRef = await addDocResendSafe(collection(db, "temperature_incidents"), { ...buildIncidentDoc({ asset, unit, range, readings, reasons: result.reasons, actionKeys, actor }), openedAt: serverTimestamp() });
          // tell the Practice Manager and whoever is ticked for fridge alerts, so nobody has to go looking
          let alerted = null;
          try { alerted = (await httpsCallable(functions, "raiseFridgeAlert")({ incidentId: incidentRef.id }))?.data || null; } catch (alertError) { console.error("Fridge alert could not be sent", alertError); }
          setDone({ outOfRange: true, alerted });
          setBusy(false);
          return;
        } catch (incidentError) {
          console.error("Fridge incident could not be saved", incidentError);
          setError("The reading was saved, but the incident could not be raised. Tell the Practice Manager.");
          setBusy(false);
          setDone({ outOfRange: true, incidentFailed: true });
          return;
        }
      }
      setDone({ outOfRange: result.outOfRange });
    } catch (saveError) {
      setError(saveError?.message || "Could not save the check. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!asset) return null;
  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Fridge check</p>
        <h2 className="mt-1 text-2xl font-bold">{asset.name}</h2>
        <p className="text-sm text-[var(--medtrak-muted)]">Safe range {range.min}°C to {range.max}°C</p>
      </div>
      <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button>
    </div>
  );

  return (
    <div className="pvx-mobile-sheet-backdrop">
      <section className="pvx-mobile-sheet" role="dialog" aria-modal="true" aria-label={`Fridge check, ${asset.name}`}>
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />
        {header}

        {quarantined && !done && <p className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm font-bold text-rose-700" role="alert"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> This fridge is quarantined. Do not use its stock until a manager clears it.</p>}

        {done ? (
          <div className="mt-5" role="status">
            <div className={`rounded-2xl border p-4 ${done.outOfRange ? "border-rose-500/40 bg-rose-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}>
              <p className={`flex items-center gap-2 text-lg font-bold ${done.outOfRange ? "text-rose-700" : "text-emerald-700"}`}>
                {done.outOfRange ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
                {done.outOfRange ? "Recorded as out of range" : "Check recorded"}
              </p>
              <p className="mt-1 text-sm">{done.outOfRange ? (done.incidentFailed ? "Tell the Practice Manager now." : done.alerted?.sent > 0 ? `An incident has been opened and ${done.alerted.sent === 1 ? "1 person has" : `${done.alerted.sent} people have`} been alerted (${(done.alerted.roles || []).join(", ")}).` : "An incident has been opened, but nobody could be alerted automatically. Tell the Practice Manager now.") : `${asset.name} is in range.`} Recorded by {actor.displayName || actor.email || "you"} at {timeText(new Date())}.</p>
            </div>
            {error && <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-700" role="alert">{error}</p>}
            <button type="button" onClick={onClose} className="mt-4 min-h-12 w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 font-bold text-white">Done</button>
          </div>
        ) : already ? (
          <div className="mt-5">
            <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-4">
              <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" /> Already checked this {slotOf(opened) === "AM" ? "morning" : "afternoon"}</p>
              <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{already.recordedBy || "Someone"} recorded {already.temp}°C{Number.isFinite(already.minTemp) ? ` (min ${already.minTemp}°C, max ${already.maxTemp}°C)` : ""}{already.measured_at?.toDate ? ` at ${timeText(already.measured_at.toDate())}` : ""}.</p>
            </div>
            <button type="button" onClick={onClose} className="mt-4 min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] px-4 font-bold">Close</button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-xs text-[var(--medtrak-muted)]">Recording as <b>{actor.displayName || actor.email || "you"}</b>, {timeText(opened)} today. Step {step + 1} of {TOTAL}.</p>
            <div className="mt-2 flex gap-1.5" aria-hidden="true">{Array.from({ length: TOTAL }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-[var(--medtrak-accent)]" : "bg-[var(--medtrak-border)]"}`} />)}</div>

            {onNumberStep && (
              <div className="mt-5">
                <h3 className="text-xl font-bold">{STEPS[step].title}</h3>
                <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{STEPS[step].hint}</p>
                <div className="mt-4 flex items-center gap-2">
                  <button type="button" onClick={flipSign} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[var(--medtrak-border)] text-2xl font-bold" aria-label="Switch between plus and minus">±</button>
                  <label className="relative block flex-1">
                    <span className="sr-only">{STEPS[step].label} in degrees C</span>
                    <input autoFocus inputMode="decimal" value={text[key]} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") next(); }} placeholder="0.0" className="h-14 w-full rounded-2xl border-2 border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 pr-12 text-3xl font-bold outline-none focus:border-[var(--medtrak-accent)]" />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--medtrak-muted)]">°C</span>
                  </label>
                </div>
              </div>
            )}

            {step === STEPS.length && (
              <div className="mt-5">
                <h3 className="text-xl font-bold">Now reset the thermometer</h3>
                <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Press the reset button so tomorrow's minimum and maximum start fresh.</p>
                <label className="mt-4 flex min-h-14 items-center gap-3 rounded-2xl border-2 border-[var(--medtrak-border)] px-4 text-lg font-bold">
                  <input type="checkbox" className="h-6 w-6" checked={reset} onChange={(e) => { setReset(e.target.checked); setError(""); }} /> I've pressed reset
                </label>
              </div>
            )}

            {isReview && (
              <div className="mt-5">
                <h3 className="text-xl font-bold">Check and save</h3>
                <div className={`mt-3 rounded-2xl border p-4 ${result.outOfRange ? "border-rose-500/40 bg-rose-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}>
                  <p className={`flex items-center gap-2 text-lg font-bold ${result.outOfRange ? "text-rose-700" : "text-emerald-700"}`}>
                    {result.outOfRange ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : <Thermometer className="h-5 w-5" aria-hidden="true" />}
                    {result.outOfRange ? "Outside the safe range" : "In range"}
                  </p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {[["Now", readings.current], ["Min", readings.min], ["Max", readings.max]].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--medtrak-panel)] p-2"><dt className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">{label}</dt><dd className="text-xl font-black">{value}°C</dd></div>)}
                  </dl>
                  {result.reasons.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
                </div>
                {needsActions && (
                  <fieldset className="mt-4">
                    <legend className="text-sm font-bold">What have you done about it?</legend>
                    <div className="mt-2 grid gap-2">
                      {ACTIONS.map((action) => (
                        <label key={action.key} className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold">
                          <input type="checkbox" className="h-5 w-5" checked={actionKeys.includes(action.key)} onChange={() => toggleAction(action.key)} /> {action.label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-[var(--medtrak-muted)]">Saving opens an incident that the Practice Manager will see.</p>
                  </fieldset>
                )}
              </div>
            )}

            {error && <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-700" role="alert">{error}</p>}

            <div className="mt-5 flex gap-2">
              {step > 0 && <button type="button" onClick={() => { setError(""); setStep((s) => s - 1); }} disabled={busy} className="inline-flex min-h-12 items-center gap-1 rounded-2xl border border-[var(--medtrak-border)] px-4 font-bold"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back</button>}
              {isReview
                ? <button type="button" onClick={save} disabled={busy} className="min-h-12 flex-1 rounded-2xl bg-[var(--medtrak-accent)] px-4 font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save check"}</button>
                : <button type="button" onClick={next} className="min-h-12 flex-1 rounded-2xl bg-[var(--medtrak-accent)] px-4 font-bold text-white">Next</button>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
