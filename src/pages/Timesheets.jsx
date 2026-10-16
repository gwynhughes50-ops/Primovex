import { useEffect, useMemo, useState } from "react";
import { Clock, Plus, Trash2, Upload, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { listStaffDirectory } from "@/services/staffDirectoryService";
import { DAYS, DAY_LABEL, MAX_CYCLE_WEEKS, averageWeekHours, dateKey, dayHours, describeWeek, emptyDay, emptyWeek, hoursLabel, newPattern, patternOn, patternProblems, weekHours } from "@/modules/timesheets/workPattern";
import { parseHolidayReport, planStaffImport } from "@/modules/timesheets/brightHr";
import { applyStaffImport, removeStaff, saveStaff, useTimesheetStaff } from "@/modules/timesheets/timesheetService";

// Timesheets (Operations > Timesheets). Stage 1: each person's working pattern (days, times, unpaid break, alternate weeks, split
// shifts, zero hours) and their leave figures from BrightHR. A timesheet is then worked out from the pattern, so a person only
// records what was different. Only people with the timesheets permission see this page; staff are never shown each other's.

const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60";
const SMALL = "rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 outline-none focus:border-teal-300/60";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-400";
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40";
const PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";
const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const today = () => dateKey(new Date());
const clone = (value) => JSON.parse(JSON.stringify(value));

function Tile({ label, value, tone }) {
  return <div className={`rounded-xl border border-white/10 p-3 ${tone || "bg-slate-900/60"}`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-50">{value}</p></div>;
}

// the pattern a person has today, in a line
function patternLine(person) {
  const p = patternOn(person.patterns, today());
  if (!p) return { text: "No pattern set", hours: null, set: false };
  if (p.mode === "zero-hours") return { text: "Zero hours", hours: null, set: true };
  const text = describeWeek(p.weeks[0]);
  return { text: p.weeks.length > 1 ? `${p.weeks.length}-week cycle: ${text}, ...` : text, hours: averageWeekHours(p), set: true };
}

// one day's row in the editor
function DayRow({ label, day, onChange }) {
  const working = (day.blocks || []).length > 0;
  const setBlock = (index, patch) => onChange({ ...day, blocks: day.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
  return (
    <div className="grid grid-cols-[6.5rem_1fr_auto] items-start gap-2 border-t border-white/5 py-2">
      <label className="flex items-center gap-2 pt-1 text-sm font-semibold text-slate-100">
        <input type="checkbox" checked={working} onChange={(e) => onChange(e.target.checked ? { blocks: [{ start: "08:30", end: "17:00" }], breakMin: 60 } : emptyDay())} aria-label={`Works on ${label}`} />{label}
      </label>
      {working ? (
        <div className="space-y-1">
          {day.blocks.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input type="time" className={SMALL} value={b.start} onChange={(e) => setBlock(i, { start: e.target.value })} aria-label={`${label} start ${i + 1}`} />
              <span className="text-slate-400">to</span>
              <input type="time" className={SMALL} value={b.end} onChange={(e) => setBlock(i, { end: e.target.value })} aria-label={`${label} end ${i + 1}`} />
              {day.blocks.length > 1 && <button type="button" className="text-xs text-slate-400 underline hover:text-rose-300" onClick={() => onChange({ ...day, blocks: day.blocks.filter((_, j) => j !== i) })}>Remove</button>}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <button type="button" className="underline" onClick={() => onChange({ ...day, blocks: [...day.blocks, { start: "13:00", end: "17:00" }], breakMin: 0 })}>Split shift: add another time</button>
            <label className="flex items-center gap-1">Unpaid break
              <input type="number" min="0" step="5" className={`${SMALL} w-16`} value={day.breakMin ?? 0} onChange={(e) => onChange({ ...day, breakMin: Math.max(0, Number(e.target.value) || 0) })} aria-label={`${label} unpaid break in minutes`} /> min
            </label>
          </div>
        </div>
      ) : <span className="pt-1 text-sm text-slate-500">Not working</span>}
      <span className="pt-1 text-right text-sm font-semibold text-slate-200">{working ? hoursLabel(dayHours(day)) : ""}</span>
    </div>
  );
}

// set, change or add a person's working pattern
function PatternDialog({ person, actor, onClose }) {
  const [patterns, setPatterns] = useState(() => (person.patterns?.length ? clone(person.patterns) : [newPattern(today())]));
  const [index, setIndex] = useState(() => { const sorted = (person.patterns || []).map((p, i) => [p.from, i]).filter(([from]) => from <= today()).sort((a, b) => b[0].localeCompare(a[0])); return sorted[0]?.[1] ?? Math.max(0, (person.patterns?.length || 1) - 1); });
  const [week, setWeek] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pattern = patterns[index] || patterns[0];
  const update = (patch) => setPatterns((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const setDay = (d, day) => update({ weeks: pattern.weeks.map((w, i) => (i === week ? { ...w, [d]: day } : w)) });
  const problems = patterns.flatMap((p) => patternProblems(p).map((text) => `${uk(p.from) || "New pattern"}: ${text}`));
  const total = pattern.mode === "zero-hours" ? null : weekHours(pattern.weeks[Math.min(week, pattern.weeks.length - 1)]);

  function setCycle(count) {
    const weeks = Array.from({ length: count }, (_, i) => clone(pattern.weeks[i] || pattern.weeks[pattern.weeks.length - 1] || emptyWeek()));
    update({ weeks });
    setWeek(Math.min(week, count - 1));
  }
  function setMode(mode) { update(mode === "zero-hours" ? { mode, weeks: [] } : { mode, weeks: pattern.weeks.length ? pattern.weeks : [emptyWeek()] }); setWeek(0); }
  function copyMonday() { const monday = pattern.weeks[week].mon; update({ weeks: pattern.weeks.map((w, i) => (i === week ? { ...w, tue: clone(monday), wed: clone(monday), thu: clone(monday), fri: clone(monday) } : w)) }); }
  function copyToAllWeeks() { update({ weeks: pattern.weeks.map(() => clone(pattern.weeks[week])) }); }
  function addPattern() { const base = clone(pattern); setPatterns([...patterns, { ...base, from: today() }]); setIndex(patterns.length); setWeek(0); }
  function removePattern() { const next = patterns.filter((_, i) => i !== index); setPatterns(next.length ? next : [newPattern(today())]); setIndex(0); setWeek(0); }
  async function save() {
    setBusy(true); setError("");
    try { await saveStaff(person, { patterns: [...patterns].sort((a, b) => a.from.localeCompare(b.from)) }, actor); onClose(); } catch (failure) { setError(failure?.message || "That didn't save. Check you have permission."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Working pattern" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-50">Working pattern</h2><p className="text-sm text-slate-400">{person.name}{person.jobTitle ? ` · ${person.jobTitle}` : ""}</p></div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className={LABEL}>Pattern starting
            <select className={FIELD} value={index} onChange={(e) => { setIndex(Number(e.target.value)); setWeek(0); }}>{patterns.map((p, i) => <option key={i} value={i}>{p.from ? uk(p.from) : "new"}{patternOn(patterns, today()) === p ? " (current)" : ""}</option>)}</select>
          </label>
          <label className={LABEL}>Starts on<input type="date" className={FIELD} value={pattern.from} onChange={(e) => update({ from: e.target.value })} /></label>
          <button type="button" className={BTN} onClick={addPattern}><Plus className="h-4 w-4" /> New pattern from a date</button>
          {patterns.length > 1 && <button type="button" className={BTN} onClick={removePattern}><Trash2 className="h-4 w-4" /> Remove this one</button>}
        </div>
        <p className="mt-1 text-xs text-slate-500">When hours change, add a new pattern from that date: the old one stays for past timesheets.</p>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-200">
          <label className="flex items-center gap-2"><input type="radio" checked={pattern.mode !== "zero-hours"} onChange={() => setMode("fixed")} /> Set days and times</label>
          <label className="flex items-center gap-2"><input type="radio" checked={pattern.mode === "zero-hours"} onChange={() => setMode("zero-hours")} /> Zero hours (no usual hours; they record what they work)</label>
        </div>

        {pattern.mode !== "zero-hours" && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className={LABEL}>Repeats every<select className={FIELD} value={pattern.weeks.length} onChange={(e) => setCycle(Number(e.target.value))}>{Array.from({ length: MAX_CYCLE_WEEKS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? "week" : `${n} weeks (a rota)`}</option>)}</select></label>
              {pattern.weeks.length > 1 && <div className="flex gap-1" role="tablist">{pattern.weeks.map((_, i) => <button key={i} type="button" role="tab" aria-selected={week === i} onClick={() => setWeek(i)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${week === i ? "bg-white/15 text-slate-50" : "text-slate-400 hover:text-slate-200"}`}>Week {i + 1}</button>)}</div>}
            </div>
            <div className="mt-2">
              {DAYS.map((d) => <DayRow key={d} label={DAY_LABEL[d]} day={pattern.weeks[week]?.[d] || emptyDay()} onChange={(day) => setDay(d, day)} />)}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-sm text-slate-300">
              <span className="flex flex-wrap gap-2"><button type="button" className={BTN} onClick={copyMonday}>Copy Monday to Tuesday-Friday</button>{pattern.weeks.length > 1 && <button type="button" className={BTN} onClick={copyToAllWeeks}>Copy this week to all weeks</button>}</span>
              <span>This week <b className="text-slate-100">{hoursLabel(total)}</b>{pattern.weeks.length > 1 && <> · average <b className="text-slate-100">{hoursLabel(averageWeekHours(pattern))}</b> a week</>}</span>
            </div>
          </>
        )}

        {problems.length > 0 && <ul className="mt-3 list-disc space-y-0.5 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 pl-7 text-sm text-amber-100">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" className={BTN} onClick={onClose}>Cancel</button><button type="button" className={PRIMARY} disabled={busy || problems.length > 0} onClick={save}>{busy ? "Saving…" : "Save pattern"}</button></div>
      </div>
    </div>
  );
}

function PeopleTab({ data, actor }) {
  const { staff } = data;
  const [accounts, setAccounts] = useState([]);
  const [accountError, setAccountError] = useState("");
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [showLeft, setShowLeft] = useState(false);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [removing, setRemoving] = useState("");
  useEffect(() => { listStaffDirectory().then(setAccounts).catch(() => setAccountError("The list of accounts could not be loaded, so people can't be linked just now.")); }, []);

  const active = useMemo(() => staff.filter((p) => p.active !== false), [staff]);
  const teams = useMemo(() => [...new Set(staff.flatMap((p) => p.teams || []))].sort(), [staff]);
  const withPattern = active.filter((p) => patternLine(p).set).length;
  const shown = staff.filter((p) => (showLeft || p.active !== false)
    && (!team || (p.teams || []).includes(team))
    && (!onlyMissing || !patternLine(p).set)
    && (!search.trim() || `${p.name} ${p.jobTitle || ""}`.toLowerCase().includes(search.trim().toLowerCase())));

  // A claim names its approver by account, so the account of a person's line manager is kept on the person's own record:
  // set when the manager is chosen, and brought up to date for everyone they manage when the manager's account is linked.
  async function change(person, patch) {
    setMessage("");
    try {
      const next = { ...patch };
      if ("managerId" in patch) next.managerUid = staff.find((m) => m.id === patch.managerId)?.uid || null;
      await saveStaff(person, next, actor);
      if ("uid" in patch) for (const report of staff.filter((s) => s.managerId === person.id)) await saveStaff(report, { managerUid: patch.uid || null }, actor);
    } catch (failure) { setMessage(failure?.message || "That didn't save."); }
  }
  async function remove(person) {
    setMessage("");
    try { await removeStaff(person); setRemoving(""); setMessage(`${person.name} was removed.`); } catch (failure) { setMessage(failure?.message || "That didn't save."); }
  }

  if (!staff.length) return <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">No staff are set up for timesheets yet. Open the Import tab and bring in the BrightHR holiday report to start with your staff list.</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Tile label="Staff" value={active.length} />
        <Tile label="With a working pattern" value={`${withPattern} of ${active.length}`} tone={withPattern === active.length ? "bg-emerald-500/10" : "bg-amber-400/10"} />
        <Tile label="Linked to a Primovex account" value={`${active.filter((p) => p.uid).length} of ${active.length}`} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={LABEL}>Find a person<input className={FIELD} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or job" /></label>
        <label className={LABEL}>Team<select className={FIELD} value={team} onChange={(e) => setTeam(e.target.value)}><option value="">Everyone</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only people with no pattern yet</label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> Show people who have left</label>
      </div>
      {accountError && <p className="text-sm text-amber-200">{accountError}</p>}
      {message && <p className="text-sm text-slate-200" role="status">{message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Working pattern</th><th className="px-3 py-2">Hours a week</th><th className="px-3 py-2">Leave left</th><th className="px-3 py-2">Line manager</th><th className="px-3 py-2">Primovex account</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {shown.map((p) => {
              const line = patternLine(p);
              return (
                <tr key={p.id} className={`border-t border-white/5 align-top ${p.active === false ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2"><span className="font-semibold text-slate-100">{p.name}</span><span className="block text-xs text-slate-400">{[p.jobTitle, p.contractType].filter(Boolean).join(" · ")}</span></td>
                  <td className="max-w-xs px-3 py-2"><span className={line.set ? "text-slate-200" : "text-amber-200"}>{line.text}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-200">{line.hours === null ? "" : hoursLabel(line.hours)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-200">{p.leave ? <>{hoursLabel(p.leave.remaining)}<span className="block text-xs text-slate-500">of {hoursLabel(p.leave.entitlement)}, {uk(p.leave.asAt)}</span></> : ""}</td>
                  <td className="px-3 py-2"><select className={`${SMALL} max-w-[11rem]`} value={p.managerId || ""} onChange={(e) => change(p, { managerId: e.target.value })} aria-label={`Line manager for ${p.name}`}><option value="">Not set</option>{active.filter((m) => m.id !== p.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></td>
                  <td className="px-3 py-2"><select className={`${SMALL} max-w-[12rem]`} value={p.uid || ""} disabled={!accounts.length} onChange={(e) => change(p, { uid: e.target.value })} aria-label={`Account for ${p.name}`}><option value="">Not linked</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button type="button" className={BTN} onClick={() => setEditing(p)}><Clock className="h-4 w-4" aria-hidden="true" /> {line.set ? "Pattern" : "Set pattern"}</button>
                    {removing === p.id
                      ? <span className="ml-2 text-xs text-slate-300">Remove {p.name}? <button type="button" className={`${BTN} ml-1`} onClick={() => remove(p)}>Yes</button> <button type="button" className={BTN} onClick={() => setRemoving("")}>No</button></span>
                      : <button type="button" className="ml-2 text-xs font-semibold text-slate-400 underline hover:text-rose-300" onClick={() => setRemoving(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <p className="p-4 text-sm text-slate-400">Nobody matches those filters.</p>}
      </div>
      {editing && <PatternDialog person={editing} actor={actor} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ImportTab({ data, actor }) {
  const [report, setReport] = useState(null);
  const [fileName, setFileName] = useState("");
  const [use, setUse] = useState({ hours: true, days: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function choose(event) {
    const file = event.target.files?.[0];
    setReport(null); setError(""); setResult("");
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = parseHolidayReport(await file.text());
      if (!parsed.sections.length) setError("That doesn't look like the BrightHR Holiday Summary Report. It should start with \"Holiday Summary Report\" and have a First Name column.");
      else setReport(parsed);
    } catch { setError("That file could not be read."); }
  }
  const plans = useMemo(() => (report ? report.sections.filter((s) => use[s.unit]).map((s) => ({ unit: s.unit, ...planStaffImport(s.people, data.staff, { unit: s.unit, asAt: report.asAt }) })) : []), [report, use, data.staff]);
  const added = plans.reduce((n, p) => n + p.added.length, 0);
  const updated = plans.reduce((n, p) => n + p.updated.length, 0);
  async function run() {
    setBusy(true); setError("");
    try {
      let written = 0;
      for (const plan of plans) written += (await applyStaffImport(plan, actor)).written;
      setResult(`Imported: ${written} people saved. Working patterns, account links and line managers were not changed.`);
      setReport(null);
    } catch (failure) { setError(failure?.message || "The import did not finish."); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">Bring in your staff from BrightHR</p>
        <p className="mt-1">In BrightHR run the Holiday Summary Report and save it as a CSV. It is read on this computer; nothing is uploaded until you press Import. It brings in names, job titles, teams, contract type, payroll number, start date and leave figures. It never changes anyone's working pattern, account link or line manager, so you can import again whenever the figures change.</p>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 py-2 font-semibold text-slate-100"><Upload className="h-4 w-4" /> Choose a CSV file<input type="file" accept=".csv,text/csv" className="sr-only" onChange={choose} /></label>
        {fileName && <span className="ml-3 text-slate-400">{fileName}</span>}
      </div>
      {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
      {result && <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100" role="status">{result}</p>}
      {report && (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200">
            <p className="font-semibold text-slate-100">Report run {uk(report.asAt)}. Which parts do you want?</p>
            <ul className="mt-2 space-y-1">{report.sections.map((s) => <li key={s.unit}><label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(use[s.unit])} onChange={(e) => setUse({ ...use, [s.unit]: e.target.checked })} /> {s.unit === "hours" ? "Staff, leave counted in hours" : "Doctors and trainees, leave counted in days"} <span className="text-slate-500">({s.people.length} people)</span></label></li>)}</ul>
          </div>
          <div className="grid gap-2 sm:grid-cols-3"><Tile label="People to add" value={added} /><Tile label="People to update" value={updated} /><Tile label="Things to check" value={report.notes.length} tone={report.notes.length ? "bg-amber-400/10" : ""} /></div>
          {report.notes.length > 0 && <ul className="list-disc space-y-0.5 rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 pl-7 text-sm text-amber-100">{report.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          <div className="flex gap-2"><button type="button" className={PRIMARY} disabled={busy || !(added + updated)} onClick={run}>{busy ? "Importing…" : "Import"}</button><button type="button" className={BTN} onClick={() => setReport(null)}>Back</button></div>
        </div>
      )}
    </div>
  );
}

export default function Timesheets() {
  const { user, displayName } = useAuth();
  const actor = { displayName: displayName || user?.email || "", email: user?.email || "" };
  const data = useTimesheetStaff(true);
  const [tab, setTab] = useState("people");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><Clock className="h-6 w-6 text-teal-300" aria-hidden="true" /> Timesheets</h1>
        <p className="max-w-3xl text-sm text-slate-400">Everyone's working pattern: which days, what times, how long the unpaid break is, alternate weeks and split shifts. Timesheets are worked out from it, so a person only records what was different.</p>
      </div>
      <div className="flex gap-1 border-b border-white/10" role="tablist">
        {[["people", "People and patterns"], ["import", "Import from BrightHR"]].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${tab === key ? "bg-white/10 text-slate-50" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>)}
      </div>
      {data.error && <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100" role="alert">{data.error}</p>}
      {!data.ready ? <p className="text-sm text-slate-400">Opening…</p> : tab === "people" ? <PeopleTab data={data} actor={actor} /> : <ImportTab data={data} actor={actor} />}
    </div>
  );
}
