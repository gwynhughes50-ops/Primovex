import { useMemo, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { LEAVE_GROUPS, calculateEntitlement, employmentPeriod, groupOf } from "@/modules/leave/leaveEntitlement";
import { Workings } from "@/modules/leave/LeavePanels";
import { saveStaff } from "@/modules/timesheets/timesheetService";
import { averageWeekHours, patternOn, dateKey } from "@/modules/timesheets/workPattern";

// "Work out annual leave": one question at a time, ending with the figure and how it was worked out.
//   a person chosen from the staff list: their record fills in what is known, and the answers can be saved back to it
//   "someone new" (a new starter not on the list yet): a calculator only, with the hours typed in; nothing is saved
// The questions: who, which group, service (or sessions and days for a doctor), hours, the part of the year they are here, carry-over.

const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-teal-300/60";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-400";
const BTN = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40";
const PRIMARY = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500/90 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";
const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const fix = (value) => (Math.round(Number(value) * 100) / 100).toString();

function Tile({ selected, onClick, title, note }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick} className={`w-full rounded-xl border px-4 py-3 text-left ${selected ? "border-teal-300/70 bg-teal-500/10" : "border-white/10 hover:bg-white/5"}`}>
      <span className="block text-sm font-semibold text-slate-100">{title}</span>
      {note && <span className="block text-xs text-slate-400">{note}</span>}
    </button>
  );
}

// the hours a week from a person's working pattern today (0 when none or zero hours)
function hoursFromPattern(person) {
  const current = person ? patternOn(person.patterns, dateKey(new Date())) : null;
  return current && current.mode !== "zero-hours" ? averageWeekHours(current) : 0;
}

// what a person's record already says, as the answers to the questions
function answersFrom(person, year) {
  const adjust = person?.leaveAdjust?.[year.key] || {};
  const period = person ? employmentPeriod(person, year) : null;
  const starts = Boolean(period && !period.none && period.from !== year.from);
  const leaves = Boolean(period && !period.none && period.to !== year.to);
  return {
    leaveGroup: person?.leaveGroup || "", serviceFrom: person?.serviceFrom || "", sessions: person?.leaveSessions || "", fixedDays: adjust.fixedDays || "",
    hoursChoice: hoursFromPattern(person) ? "pattern" : "", weeklyHours: "",
    span: !person ? "" : starts && leaves ? "both" : starts ? "starts" : leaves ? "leaves" : "whole",
    startedOn: starts ? period.from : "", leftOn: leaves ? period.to : "", carryOver: adjust.carryOver || "",
  };
}

export default function LeaveWizard({ people = [], person: given = null, year, settings, actor, onClose }) {
  const [personId, setPersonId] = useState(given?.id || "");
  const person = given || people.find((p) => p.id === personId) || null;
  const newStarter = !given && personId === "new";
  const patternHours = hoursFromPattern(person);

  const [form, setForm] = useState(() => answersFrom(given, year));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const [stepIndex, setStepIndex] = useState(0);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const doctor = form.leaveGroup === "doctor";
  const known = Boolean(person) && !newStarter;

  // when someone is chosen from the list, what the record already holds fills the answers in
  function choose(id) {
    setPersonId(id);
    setForm(answersFrom(people.find((x) => x.id === id) || null, year));
    setProblem("");
  }

  const steps = [
    ...(given ? [] : ["who"]),
    "group",
    doctor ? "doctor" : "service",
    ...(doctor ? [] : ["hours"]),
    "period",
    "carry",
    "result",
  ];
  const step = steps[stepIndex];

  // the person as the answers describe them
  const spanChoice = form.span;
  const draft = useMemo(() => {
    const typed = !doctor && (newStarter || !patternHours || form.hoursChoice === "other") ? Number(form.weeklyHours) || 0 : 0;
    return {
      ...(person || {}), leaveGroup: form.leaveGroup, serviceFrom: form.serviceFrom, leaveSessions: Number(form.sessions) || 0, weeklyHours: typed,
      startedOn: spanChoice === "starts" || spanChoice === "both" ? form.startedOn : "",
      // "the whole year" overrides a start date from BrightHR that falls inside the year
      startDate: spanChoice === "whole" && person?.startDate > year.from ? "" : (person?.startDate || ""),
      leftOn: spanChoice === "leaves" || spanChoice === "both" ? form.leftOn : "",
      leaveAdjust: { [year.key]: { carryOver: Number(form.carryOver) || 0, fixedDays: Number(form.fixedDays) || 0 } },
    };
  }, [person, form, newStarter, patternHours, doctor, spanChoice, year.key]);
  const result = useMemo(() => (step === "result" ? calculateEntitlement(draft, year, settings) : null), [step, draft, year, settings]);

  function check() {
    if (step === "who" && !personId) return "Choose who it is for, or choose someone new.";
    if (step === "group" && !groupOf(form.leaveGroup)) return "Choose their leave group.";
    if (step === "doctor") {
      if (!(Number(form.fixedDays) > 0)) return `Type their leave for ${year.key}, in days.`;
      if (!(Number(form.sessions) > 0)) return "Type how many sessions a week they work.";
    }
    if (step === "service" && newStarter && !form.serviceFrom) return "Give the date their NHS service starts (a new starter's start date).";
    if (step === "hours") {
      if (known && patternHours && !form.hoursChoice) return "Choose whether to use their working pattern or different hours.";
      if ((newStarter || !patternHours || form.hoursChoice === "other") && !(Number(form.weeklyHours) > 0)) return "Type the hours they work in a week.";
    }
    if (step === "period") {
      if (!spanChoice) return "Say whether they are here for the whole year.";
      if ((spanChoice === "starts" || spanChoice === "both") && !form.startedOn) return "Give the day they start.";
      if ((spanChoice === "leaves" || spanChoice === "both") && !form.leftOn) return "Give their last day.";
    }
    return "";
  }
  const next = () => { const found = check(); setProblem(found); if (!found) setStepIndex((i) => Math.min(steps.length - 1, i + 1)); };
  const back = () => { setProblem(""); setStepIndex((i) => Math.max(0, i - 1)); };

  async function save() {
    setBusy(true); setProblem("");
    try {
      await saveStaff(person, {
        leaveGroup: form.leaveGroup, serviceFrom: doctor ? person.serviceFrom || "" : form.serviceFrom, startedOn: draft.startedOn, leftOn: draft.leftOn, leaveSessions: form.sessions,
        leaveAdjust: { ...(person.leaveAdjust || {}), [year.key]: { carryOver: form.carryOver, fixedDays: form.fixedDays } },
      }, actor);
      setSaved(true);
    } catch (failure) { setProblem(failure?.message || "That didn't save. Check you have permission."); } finally { setBusy(false); }
  }

  const title = { who: "Who is it for?", group: "Which leave group?", service: "When does their NHS service start?", doctor: "Their leave and sessions", hours: "How many hours a week do they work?", period: `Are they here for all of ${year.key}?`, carry: "Any leave carried over?", result: "Their annual leave" }[step];
  const period = result ? employmentPeriod(draft, year) : null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Work out annual leave" className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Annual leave {year.key} · step {stepIndex + 1} of {steps.length}</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-50">{title}</h2>
            {person && !newStarter && <p className="text-sm text-slate-400">{person.name}{person.jobTitle ? ` · ${person.jobTitle}` : ""}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/10" aria-hidden="true"><div className="h-1.5 rounded-full bg-teal-400" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>

        <div className="mt-4">
          {step === "who" && (
            <>
              <label className={LABEL}>Choose a member of staff
                <select className={FIELD} value={personId === "new" ? "" : personId} onChange={(e) => choose(e.target.value)}>
                  <option value="">Choose…</option>
                  {people.filter((p) => p.active !== false).map((p) => <option key={p.id} value={p.id}>{p.name}{p.jobTitle ? ` (${p.jobTitle})` : ""}</option>)}
                </select>
              </label>
              <p className="my-3 text-center text-xs text-slate-500">or</p>
              <Tile selected={personId === "new"} onClick={() => choose("new")} title="Someone new, not on the list yet" note="Just works it out; nothing is saved. You type the hours and dates." />
            </>
          )}

          {step === "group" && (
            <div className="space-y-2" role="radiogroup" aria-label="Leave group">
              {LEAVE_GROUPS.map((g) => <Tile key={g.key} selected={form.leaveGroup === g.key} onClick={() => set({ leaveGroup: g.key })} title={g.label} note={g.hours ? `${g.hours[0] / 7.5} days basic, up to ${g.hours[3] / 7.5} days after 10 years (full-time)` : "Leave typed in per person, in days"} />)}
            </div>
          )}

          {step === "service" && (
            <label className={LABEL}>Counting service from
              <input type="date" className={FIELD} value={form.serviceFrom} onChange={(e) => set({ serviceFrom: e.target.value })} />
              <span className="mt-1 block text-xs font-normal normal-case text-slate-500">
                {newStarter ? "Their first day, or earlier if previous NHS service counts." : `Leave blank to use their start date from BrightHR${person?.startDate ? ` (${uk(person.startDate)})` : ""}. Use an earlier date if previous NHS service counts.`} It decides when they move up to the next level (after 1, 5 and 10 years).
              </span>
            </label>
          )}

          {step === "doctor" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={LABEL}>Their leave for {year.key}, in days<input type="number" min="0" step="0.5" className={FIELD} value={form.fixedDays} onChange={(e) => set({ fixedDays: e.target.value })} /></label>
              <label className={LABEL}>Sessions a week they work<input type="number" min="0" step="1" className={FIELD} value={form.sessions} onChange={(e) => set({ sessions: e.target.value })} /></label>
              <p className="text-xs text-slate-500 sm:col-span-2">Doctors do not work bank holidays either, so every bank holiday counts, shared by the sessions they work (their sessions ÷ the most sessions in a week, up to the half day).</p>
            </div>
          )}

          {step === "hours" && (
            <>
              {known && patternHours > 0 && (
                <div className="space-y-2" role="radiogroup" aria-label="Hours">
                  <Tile selected={form.hoursChoice === "pattern"} onClick={() => set({ hoursChoice: "pattern" })} title={`${fix(patternHours)} hours a week`} note="From their working pattern in Timesheets. If their hours change during the year, each part is worked out." />
                  <Tile selected={form.hoursChoice === "other"} onClick={() => set({ hoursChoice: "other" })} title="Different hours" note="To see what a change would mean. Their working pattern is not changed." />
                </div>
              )}
              {(newStarter || !patternHours || form.hoursChoice === "other") && (
                <label className={`${LABEL} ${known && patternHours ? "mt-3" : ""}`}>Hours a week
                  <input type="number" min="0" step="0.5" className={FIELD} value={form.weeklyHours} onChange={(e) => set({ weeklyHours: e.target.value })} placeholder="e.g. 37.5" />
                  {known && !patternHours && <span className="mt-1 block text-xs font-normal normal-case text-slate-500">They have no working pattern in Timesheets yet, so type the hours.</span>}
                </label>
              )}
            </>
          )}

          {step === "period" && (
            <>
              <div className="space-y-2" role="radiogroup" aria-label="Part of the year">
                <Tile selected={spanChoice === "whole"} onClick={() => set({ span: "whole", startedOn: "", leftOn: "" })} title="Yes, the whole year" note={`${uk(year.from)} to ${uk(year.to)}`} />
                <Tile selected={spanChoice === "starts"} onClick={() => set({ span: "starts", leftOn: "" })} title="They start part-way through" />
                <Tile selected={spanChoice === "leaves"} onClick={() => set({ span: "leaves", startedOn: "" })} title="They leave before the end" />
                <Tile selected={spanChoice === "both"} onClick={() => set({ span: "both" })} title="Both: start and leave in the year" />
              </div>
              {(spanChoice === "starts" || spanChoice === "both") && <label className={`${LABEL} mt-3`}>First day<input type="date" className={FIELD} min={year.from} max={year.to} value={form.startedOn} onChange={(e) => set({ startedOn: e.target.value })} /></label>}
              {(spanChoice === "leaves" || spanChoice === "both") && <label className={`${LABEL} mt-3`}>Last day<input type="date" className={FIELD} min={year.from} max={year.to} value={form.leftOn} onChange={(e) => set({ leftOn: e.target.value })} /></label>}
            </>
          )}

          {step === "carry" && (
            <label className={LABEL}>Carried over into {year.key}, in {doctor ? "days" : "hours"} (leave blank if none)
              <input type="number" min="0" step="0.5" className={FIELD} value={form.carryOver} onChange={(e) => set({ carryOver: e.target.value })} />
              <span className="mt-1 block text-xs font-normal normal-case text-slate-500">Added after the year's leave is rounded up to the half hour.</span>
            </label>
          )}

          {step === "result" && result && (
            <div className="space-y-3">
              {!result.ready ? (
                <ul className="list-disc space-y-0.5 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 pl-7 text-sm text-amber-100">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              ) : (
                <div className="rounded-xl border border-teal-300/30 bg-teal-500/10 p-4">
                  <p className="text-3xl font-black text-slate-50">{fix(result.total)} <span className="text-base font-semibold">{result.unit}</span></p>
                  {result.unit === "hours" && <p className="text-sm text-slate-300">{fix(result.total / 7.5)} days of 7.5 hours</p>}
                  <p className="mt-1 text-sm text-slate-300">{groupOf(draft.leaveGroup)?.label.split(" (")[0]} · {period.label.toLowerCase()}{result.carryOver > 0 ? ` · includes ${fix(result.carryOver)} carried over` : ""}</p>
                  {result.warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-slate-300">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                </div>
              )}
              {result.ready && <details className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-200">How it was worked out</summary><Workings s={{ body: "text-slate-200", strong: "text-slate-100", muted: "text-slate-400", line: "border-t border-white/5" }} result={result} /></details>}
              {saved && <p className="text-sm text-emerald-300" role="status">Saved to their record.</p>}
            </div>
          )}
        </div>

        {problem && <p className="mt-3 text-sm text-rose-300" role="alert">{problem}</p>}
        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" className={BTN} onClick={stepIndex === 0 ? onClose : back}>{stepIndex === 0 ? "Cancel" : <><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back</>}</button>
          {step !== "result" ? <button type="button" className={PRIMARY} onClick={next}>Next</button> : (
            <span className="flex gap-2">
              {known && result?.ready && !saved && <button type="button" className={PRIMARY} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save to their record"}</button>}
              <button type="button" className={saved || !known ? PRIMARY : BTN} onClick={onClose}>Done</button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
