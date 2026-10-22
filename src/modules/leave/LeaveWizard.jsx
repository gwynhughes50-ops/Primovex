import { useMemo, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { SERVICE_TIERS, calculateEntitlement, employmentPeriod, groupOf, groupsFor, ownDaysOf, serviceTier } from "@/modules/leave/leaveEntitlement";
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

// how a person's days are set: by their group and service ("group"), one number whatever their service ("flat"), or four of their own ("own")
function daysChoiceOf(person) {
  const own = ownDaysOf(person);
  return !own ? "group" : own.every((d) => d === own[0]) ? "flat" : "own";
}

// the days a form's answers describe: null means "the group's"
const daysFromForm = (form) => (form.daysChoice === "flat" && Number(form.flatDays) > 0 ? [1, 2, 3, 4].map(() => Number(form.flatDays)) : form.daysChoice === "own" ? form.ownDays.map(Number) : []);

// what a person's record already says, as the answers to the questions
function answersFrom(person, year) {
  const adjust = person?.leaveAdjust?.[year.key] || {};
  const period = person ? employmentPeriod(person, year) : null;
  const starts = Boolean(period && !period.none && period.from !== year.from);
  const leaves = Boolean(period && !period.none && period.to !== year.to);
  return {
    leaveGroup: person?.leaveGroup || "", daysChoice: daysChoiceOf(person), flatDays: daysChoiceOf(person) === "flat" ? String(ownDaysOf(person)[0]) : "", ownDays: ownDaysOf(person) ? ownDaysOf(person).map(String) : ["", "", "", ""], serviceFrom: person?.serviceFrom || "", sessions: person?.leaveSessions || "", fixedDays: adjust.fixedDays || "",
    hoursChoice: hoursFromPattern(person) ? "pattern" : "", weeklyHours: "",
    span: !person ? "" : starts && leaves ? "both" : starts ? "starts" : leaves ? "leaves" : "whole",
    startedOn: starts ? period.from : "", leftOn: leaves ? period.to : "", carryOver: adjust.carryOver || "",
    extraDays: adjust.extraDays || "", extraReason: adjust.extraReason || "",
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
    ...(doctor ? [] : ["days"]),
    doctor ? "doctor" : form.daysChoice === "flat" ? null : "service",
    ...(doctor ? [] : ["hours"]),
    "period",
    "extra",
    "carry",
    "result",
  ].filter(Boolean);
  const step = steps[stepIndex];

  // the person as the answers describe them
  const spanChoice = form.span;
  const draft = useMemo(() => {
    const typed = !doctor && (newStarter || !patternHours || form.hoursChoice === "other") ? Number(form.weeklyHours) || 0 : 0;
    return {
      ...(person || {}), leaveGroup: form.leaveGroup, leaveDays: doctor ? [] : daysFromForm(form), serviceFrom: form.serviceFrom, leaveSessions: Number(form.sessions) || 0, weeklyHours: typed,
      startedOn: spanChoice === "starts" || spanChoice === "both" ? form.startedOn : "",
      // "the whole year" overrides a start date from BrightHR that falls inside the year
      startDate: spanChoice === "whole" && person?.startDate > year.from ? "" : (person?.startDate || ""),
      leftOn: spanChoice === "leaves" || spanChoice === "both" ? form.leftOn : "",
      leaveAdjust: { [year.key]: { carryOver: Number(form.carryOver) || 0, fixedDays: Number(form.fixedDays) || 0, extraDays: Number(form.extraDays) || 0, extraReason: form.extraReason || "" } },
    };
  }, [person, form, newStarter, patternHours, doctor, spanChoice, year.key]);
  const result = useMemo(() => (step === "result" ? calculateEntitlement(draft, year, settings) : null), [step, draft, year, settings]);

  function check() {
    if (step === "who" && !personId) return "Choose who it is for, or choose someone new.";
    if (step === "group" && !groupOf(form.leaveGroup, settings)) return "Choose their leave group.";
    if (step === "days" && form.daysChoice === "flat" && !(Number(form.flatDays) > 0)) return "Type the number of days they get.";
    if (step === "days" && form.daysChoice === "own" && form.ownDays.some((d) => !(Number(d) > 0))) return "Type the days for each of the four levels from their contract.";
    if (step === "extra" && Number(form.extraDays) && !String(form.extraReason || "").trim()) return "Say why they have extra (or fewer) days, so it is clear later.";
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
        leaveGroup: form.leaveGroup, leaveDays: doctor ? [] : daysFromForm(form), serviceFrom: doctor ? person.serviceFrom || "" : form.serviceFrom, startedOn: draft.startedOn, leftOn: draft.leftOn, leaveSessions: form.sessions,
        leaveAdjust: { ...(person.leaveAdjust || {}), [year.key]: { carryOver: form.carryOver, fixedDays: form.fixedDays, extraDays: form.extraDays, extraReason: form.extraReason } },
      }, actor);
      setSaved(true);
    } catch (failure) { setProblem(failure?.message || "That didn't save. Check you have permission."); } finally { setBusy(false); }
  }

  const title = { who: "Who is it for?", group: "Which leave group?", days: "Their days at each level", service: "When does their NHS service start?", doctor: "Their leave and sessions", hours: "How many hours a week do they work?", period: `Are they here for all of ${year.key}?`, extra: "Extra days for them?", carry: "Any leave carried over?", result: "Their annual leave" }[step];
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
              {groupsFor(settings).map((g) => <Tile key={g.key} selected={form.leaveGroup === g.key} onClick={() => set({ leaveGroup: g.key })} title={g.label} note={g.hours ? `${g.days[0]} days basic, up to ${g.days[3]} days after 10 years (full-time)${g.changed || g.custom ? " · set in Settings" : ""}` : "Leave typed in per person, in days"} />)}
            </div>
          )}

          {step === "days" && (() => {
            const g = groupOf(form.leaveGroup, settings);
            const levels = ["Basic (under 1 year)", "After 1 year", "After 5 years", "After 10 years"];
            return (
              <>
                <div className="space-y-2" role="radiogroup" aria-label="Their days">
                  <Tile selected={form.daysChoice === "group"} onClick={() => set({ daysChoice: "group" })} title={`The group's days, by their service${g?.days ? `: ${g.days.join(" / ")}` : ""}`} note="They move up a level after 1, 5 and 10 years. For a full-timer, before bank holidays." />
                  <Tile selected={form.daysChoice === "flat"} onClick={() => set({ daysChoice: "flat" })} title="The same days whatever their service" note="One number, for example 38 days, that does not change as they move up. Bank holidays are added on top." />
                  <Tile selected={form.daysChoice === "own"} onClick={() => set({ daysChoice: "own", ownDays: form.ownDays.some((d) => d !== "") ? form.ownDays : (g?.days || ["", "", "", ""]).map(String) })} title="Different days at each level" note="Type the four numbers from their contract (basic, after 1, 5 and 10 years)." />
                </div>
                {form.daysChoice === "flat" && (
                  <label className={`${LABEL} mt-3`}>Days for a full-timer, before bank holidays
                    <input type="number" min="0" max="100" step="0.5" className={FIELD} value={form.flatDays} onChange={(e) => set({ flatDays: e.target.value })} placeholder="e.g. 38" />
                    <span className="mt-1 block text-xs font-normal normal-case text-slate-500">Shared out by their hours and the part of the year they are here. Kept on their record.</span>
                  </label>
                )}
                {form.daysChoice === "own" && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {levels.map((label, i) => <label key={label} className={LABEL}>{label}<input type="number" min="0" max="100" step="0.5" className={FIELD} value={form.ownDays[i]} onChange={(e) => set({ ownDays: form.ownDays.map((d, j) => (j === i ? e.target.value : d)) })} /></label>)}
                  </div>
                )}
              </>
            );
          })()}

          {step === "service" && (
            <>
            <label className={LABEL}>Counting service from
              <input type="date" className={FIELD} value={form.serviceFrom} onChange={(e) => set({ serviceFrom: e.target.value })} />
              <span className="mt-1 block text-xs font-normal normal-case text-slate-500">
                {newStarter ? "Their first day, or earlier if previous NHS service counts." : `Leave blank to use their start date from BrightHR${person?.startDate ? ` (${uk(person.startDate)})` : ""}. Use an earlier date if previous NHS service counts.`} It decides when they move up to the next level (after 1, 5 and 10 years).
              </span>
            </label>
            {(() => {
              const g = groupOf(form.leaveGroup, settings);
              const days = form.daysChoice === "own" ? form.ownDays.map(Number) : g?.days;
              const from = form.serviceFrom || person?.startedOn || person?.startDate || "";
              if (!days || days.some((d) => !(d > 0))) return null;
              if (!from) return <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-100">No start date yet, so they would be counted as new: {days[0]} days. Type the date their service started.</p>;
              const tier = serviceTier(from, year.from);
              return <p className="mt-3 rounded-lg bg-white/5 p-3 text-sm text-slate-200">On {uk(year.from)} that is {tier === 0 ? "under a year" : `${SERVICE_TIERS[tier].years}+ years`} of service, so <b>{days[tier]} days</b> ({SERVICE_TIERS[tier].label.toLowerCase()}). {tier < 3 ? `After ${SERVICE_TIERS[tier + 1].years} years it is ${days[tier + 1]} days.` : "They are on the top level."}</p>;
            })()}
            </>
          )}

          {step === "doctor" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={LABEL}>Their leave for {year.key}, in days<input type="number" min="0" step="0.5" className={FIELD} value={form.fixedDays} onChange={(e) => set({ fixedDays: e.target.value })} /></label>
              <label className={LABEL}>Sessions a week they work<input type="number" min="0" step="1" className={FIELD} value={form.sessions} onChange={(e) => set({ sessions: e.target.value })} /></label>
              <p className="text-xs text-slate-500 sm:col-span-2">Type the leave for a whole year. Someone who starts or leaves part-way through gets 1/12th for each whole month of service. Doctors do not work bank holidays either, so every bank holiday counts, shared by the sessions they work (their sessions ÷ the most sessions in a week, up to the half day).</p>
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

          {step === "extra" && (
            <>
              <p className="text-sm text-slate-400">For a person whose days are different from their group's: add days (for example 3 IPR days) or take some off (a minus). Leave at 0 if they get just what their group gets. It is shared out by their hours and the part of the year they are here, like the rest of their leave.</p>
              <label className={`${LABEL} mt-3`}>Extra days for {year.key} (use a minus for fewer)
                <input type="number" min="-60" max="60" step="0.5" className={FIELD} value={form.extraDays} onChange={(e) => set({ extraDays: e.target.value })} placeholder="0" />
              </label>
              {Number(form.extraDays) !== 0 && form.extraDays !== "" && (
                <label className={`${LABEL} mt-3`}>Why?
                  <input className={FIELD} maxLength={60} value={form.extraReason} onChange={(e) => set({ extraReason: e.target.value })} placeholder="e.g. IPR days, agreed with their manager" />
                </label>
              )}
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
                  <p className="mt-1 text-sm text-slate-300">{groupOf(draft.leaveGroup, settings)?.label.split(" (")[0]} · {period.label.toLowerCase()}{result.carryOver > 0 ? ` · includes ${fix(result.carryOver)} carried over` : ""}</p>
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
