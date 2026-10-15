import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Printer, Upload, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { printHtmlDocument } from "@/lib/printHtmlDocument";
import { listStaffDirectory } from "@/services/staffDirectoryService";
import { GROUPS, LIGHT, STATUS, STATUS_LABEL, buildMatrix, dateKey, dueOf, filterMatrix, parseKey, tally } from "@/modules/training/training";
import { likelyLiveSheet, parseTrainingSheets, planImport, suggestAccountLinks } from "@/modules/training/trainingImport";
import { readWorkbook } from "@/modules/training/readWorkbook";
import { matrixHtml } from "@/modules/training/trainingPrint";
import { applyImportPlan, newCourseId, newPersonId, saveCourse, savePerson, saveRecord, useTrainingData } from "@/modules/training/trainingService";

// Staff training (Operations > Staff training): everyone's courses in one matrix with a traffic light for each, who is due or
// overdue, the people and courses behind it, and a way to bring in the practice's existing spreadsheet. The Practice Manager and
// management assistants see and update everyone; a nurse manager only the clinical team.

const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-400";
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 disabled:opacity-40";
const PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";
const CELL = {
  green: "bg-emerald-500/25 text-emerald-100",
  amber: "bg-amber-400/30 text-amber-100",
  red: "bg-rose-500/35 text-rose-100",
  blue: "bg-sky-500/20 text-sky-100",
  purple: "bg-violet-500/25 text-violet-100",
  grey: "bg-white/5 text-slate-500",
};
const INTERVALS = [{ value: 0, label: "Once only" }, { value: 12, label: "Every year" }, { value: 24, label: "Every 2 years" }, { value: 36, label: "Every 3 years" }, { value: 60, label: "Every 5 years" }];
const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const short = (key) => (key ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(2, 4)}` : "");
const groupLabel = (key) => GROUPS.find((g) => g.key === key)?.label.split(" (")[0] || key;

function Tile({ label, value, tone }) {
  return <div className={`rounded-xl border border-white/10 p-3 ${tone || "bg-slate-900/60"}`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-50">{value}</p></div>;
}

// set, change or clear one person's record for one course
function RecordDialog({ person, course, record, actor, onClose }) {
  const [completedOn, setCompletedOn] = useState(record?.completedOn || "");
  const [dueOn, setDueOn] = useState(record?.dueOn || "");
  const [status, setStatus] = useState(record?.status || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const worked = completedOn ? dueOf({ completedOn }, course) : "";
  async function save(clear = false) {
    setBusy(true); setError("");
    try {
      await saveRecord({ person, course, completedOn: clear ? "" : completedOn, dueOn: clear ? "" : dueOn, status: clear ? "" : status }, actor);
      onClose();
    } catch (problem) { setError(problem?.message || "That didn't save. Check you have permission."); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Training record" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-50">{course.name}</h2><p className="text-sm text-slate-400">{person.name}{person.jobRole ? ` · ${person.jobRole}` : ""}</p><p className="text-xs text-slate-500">{course.intervalMonths ? `Repeats every ${course.intervalMonths / 12} year${course.intervalMonths === 12 ? "" : "s"}` : "Once only"}</p></div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 space-y-3">
          <label className={LABEL}>Marked as
            <select className={FIELD} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Done (give the date)</option>
              <option value={STATUS.notRequired}>Not required for this person</option>
              <option value={STATUS.onLeave}>Away (sick or maternity)</option>
            </select>
          </label>
          {!status && (
            <>
              <label className={LABEL}>Completed on<input type="date" className={FIELD} value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} /></label>
              <label className={LABEL}>Runs out on <span className="font-normal normal-case text-slate-500">(leave blank to work it out{worked ? `: ${uk(worked)}` : ""})</span><input type="date" className={FIELD} value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></label>
            </>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <button type="button" disabled={busy || !record} className={BTN} onClick={() => save(true)}>Clear this record</button>
          <div className="flex gap-2"><button type="button" className={BTN} onClick={onClose}>Cancel</button><button type="button" disabled={busy || (!status && !completedOn && !dueOn)} className={PRIMARY} onClick={() => save(false)}>{busy ? "Saving…" : "Save"}</button></div>
        </div>
      </div>
    </div>
  );
}

function MatrixTab({ data, actor, canManageAll }) {
  const { courses, people, records, scope } = data;
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState(null);
  const now = useMemo(() => new Date(), []);
  const live = useMemo(() => courses.filter((c) => c.active !== false && (!category || (c.category || "General") === category)), [courses, category]);
  const matrix = useMemo(() => buildMatrix({ people: people.filter((p) => p.active !== false), courses: live, records, now }), [people, live, records, now]);
  const shown = useMemo(() => filterMatrix(matrix, { group, search, onlyProblems }), [matrix, group, search, onlyProblems]);
  const totals = tally(shown.flatMap((row) => row.cells));
  const categories = [...new Set(courses.map((c) => c.category || "General"))];
  const spans = live.reduce((list, c) => { const cat = c.category || "General"; if (list.length && list[list.length - 1].cat === cat) list[list.length - 1].n += 1; else list.push({ cat, n: 1 }); return list; }, []);

  const print = () => printHtmlDocument(matrixHtml({ matrix: shown, courses: live, title: `Staff training matrix${group ? `: ${groupLabel(group)}` : ""}`, printedBy: actor.displayName, now }));

  if (!people.length) return <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">No staff are on the training matrix yet. {canManageAll ? "Open the Import tab to bring in your spreadsheet, or add people under People." : "Ask the Practice Manager to add the team."}</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <Tile label="In date" value={totals[STATUS.inDate]} tone="bg-emerald-500/10" />
        <Tile label="Due in 60 days" value={totals[STATUS.dueSoon]} tone="bg-amber-400/10" />
        <Tile label="Overdue" value={totals[STATUS.overdue]} tone="bg-rose-500/10" />
        <Tile label="Not recorded yet" value={totals[STATUS.none]} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {scope === "all" && <label className={LABEL}>Team<select className={FIELD} value={group} onChange={(e) => setGroup(e.target.value)}><option value="">Everyone</option>{GROUPS.map((g) => <option key={g.key} value={g.key}>{groupLabel(g.key)}</option>)}</select></label>}
        <label className={LABEL}>Courses<select className={FIELD} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All courses</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className={LABEL}>Find a person<input className={FIELD} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or job" /></label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Only people with something due or overdue</label>
        <button type="button" className={`${BTN} ml-auto`} onClick={print}><Printer className="h-4 w-4" /> Print or save as PDF</button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-slate-300">
        {[STATUS.inDate, STATUS.dueSoon, STATUS.overdue, STATUS.notRequired, STATUS.onLeave, STATUS.none].map((s) => <span key={s} className={`rounded-full px-2.5 py-1 ${CELL[LIGHT[s]]}`}>{STATUS_LABEL[s]}</span>)}
        <span className="py-1 text-slate-500">Each cell shows the date it runs out. Click one to update it.</span>
      </div>
      <div className="max-h-[68vh] overflow-auto rounded-2xl border border-white/10">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-slate-900">
            <tr>
              <th className="sticky left-0 z-30 bg-slate-900 px-2 py-1 text-left text-slate-400" />
              {spans.map((s) => <th key={s.cat} colSpan={s.n} className="border-l border-white/10 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">{s.cat}</th>)}
            </tr>
            <tr>
              <th className="sticky left-0 z-30 min-w-[11rem] bg-slate-900 px-2 py-2 text-left text-slate-200">Person</th>
              {live.map((c) => <th key={c.id} className="min-w-[5.2rem] max-w-[6.5rem] border-l border-white/10 px-1.5 py-2 align-bottom text-left font-semibold text-slate-200">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.person.id}>
                <th className="sticky left-0 z-10 bg-slate-900 px-2 py-1.5 text-left font-semibold text-slate-100">{row.person.name}<span className="block text-[10px] font-normal text-slate-400">{row.person.jobRole}</span></th>
                {row.cells.map((cell) => (
                  <td key={cell.course.id} className="border-l border-t border-white/5 p-0">
                    <button type="button" onClick={() => setEditing({ person: row.person, course: cell.course, record: cell.record })} title={`${row.person.name}: ${cell.course.name}. ${STATUS_LABEL[cell.status]}`} aria-label={`${row.person.name}, ${cell.course.name}: ${STATUS_LABEL[cell.status]}${cell.due ? `, runs out ${uk(cell.due)}` : ""}`} className={`block h-full min-h-[2.2rem] w-full px-1 py-1.5 text-center ${CELL[LIGHT[cell.status]]}`}>
                      {cell.status === STATUS.notRequired ? "n/r" : cell.status === STATUS.onLeave ? "away" : cell.due ? short(cell.due) : cell.status === STATUS.inDate ? "done" : ""}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="p-4 text-sm text-slate-400">Nobody matches those filters.</p>}
      </div>
      {editing && <RecordDialog {...editing} actor={actor} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PeopleTab({ data, canManageAll }) {
  const { people, records } = data;
  const [staff, setStaff] = useState([]);
  const [staffError, setStaffError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState({ name: "", jobRole: "", group: canManageAll ? "admin" : "clinical" });
  const [showLeft, setShowLeft] = useState(false);
  useEffect(() => { listStaffDirectory().then(setStaff).catch(() => setStaffError("The list of accounts could not be loaded, so people can't be linked just now.")); }, []);
  const suggestions = useMemo(() => suggestAccountLinks(people, staff), [people, staff]);
  const roles = useMemo(() => [...new Set(people.map((p) => p.jobRole).filter(Boolean))].sort(), [people]);
  const shown = people.filter((p) => showLeft || p.active !== false);

  async function change(person, patch) {
    setBusyId(person.id); setMessage("");
    try { await savePerson({ ...person, ...patch }, { previous: person, records }); } catch (problem) { setMessage(problem?.message || "That didn't save."); } finally { setBusyId(""); }
  }
  async function linkAll() {
    setBusyId("all"); setMessage("");
    try {
      for (const s of suggestions) { const person = people.find((p) => p.id === s.personId); if (person) await savePerson({ ...person, uid: s.uid }, { previous: person, records }); }
      setMessage(`${suggestions.length} linked.`);
    } catch (problem) { setMessage(problem?.message || "That didn't save."); } finally { setBusyId(""); }
  }
  async function add(event) {
    event.preventDefault();
    if (!adding.name.trim()) return;
    setBusyId("new"); setMessage("");
    try { await savePerson({ id: newPersonId(adding.name), ...adding, uid: "", active: true }); setAdding({ ...adding, name: "", jobRole: "" }); } catch (problem) { setMessage(problem?.message || "That didn't save."); } finally { setBusyId(""); }
  }

  return (
    <div className="space-y-3">
      {suggestions.length > 0 && canManageAll && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-300/30 bg-teal-500/10 p-3 text-sm text-teal-100">
          <span>{suggestions.length} {suggestions.length === 1 ? "person matches" : "people match"} a Primovex account by name. Linking lets them see their own training and be reminded.</span>
          <button type="button" className={PRIMARY} disabled={busyId === "all"} onClick={linkAll}>{busyId === "all" ? "Linking…" : "Link them"}</button>
        </div>
      )}
      {staffError && <p className="text-sm text-amber-200">{staffError}</p>}
      {message && <p className="text-sm text-slate-200" role="status">{message}</p>}
      <form onSubmit={add} className="grid gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3 sm:grid-cols-5">
        <label className={`${LABEL} sm:col-span-2`}>Add a person<input className={FIELD} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Full name" /></label>
        <label className={LABEL}>Job<input className={FIELD} list="training-roles" value={adding.jobRole} onChange={(e) => setAdding({ ...adding, jobRole: e.target.value })} placeholder="e.g. HCA" /></label>
        <label className={LABEL}>Team<select className={FIELD} value={adding.group} onChange={(e) => setAdding({ ...adding, group: e.target.value })}>{GROUPS.filter((g) => canManageAll || g.key === "clinical").map((g) => <option key={g.key} value={g.key}>{groupLabel(g.key)}</option>)}</select></label>
        <div className="flex items-end"><button type="submit" className={PRIMARY} disabled={busyId === "new" || !adding.name.trim()}>Add</button></div>
      </form>
      <datalist id="training-roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>
      <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> Show people who have left</label>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Job</th><th className="px-3 py-2">Team</th><th className="px-3 py-2">Primovex account</th><th className="px-3 py-2">Working here</th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="px-3 py-1.5 font-semibold text-slate-100">{p.name}</td>
                <td className="px-3 py-1.5"><input className="w-40 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-100" list="training-roles" defaultValue={p.jobRole || ""} onBlur={(e) => e.target.value !== (p.jobRole || "") && change(p, { jobRole: e.target.value })} aria-label={`Job for ${p.name}`} /></td>
                <td className="px-3 py-1.5"><select className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-100" value={p.group} disabled={!canManageAll} onChange={(e) => change(p, { group: e.target.value })} aria-label={`Team for ${p.name}`}>{GROUPS.map((g) => <option key={g.key} value={g.key}>{groupLabel(g.key)}</option>)}</select></td>
                <td className="px-3 py-1.5">
                  <select className="max-w-[14rem] rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-100" value={p.uid || ""} disabled={busyId === p.id || !staff.length} onChange={(e) => change(p, { uid: e.target.value })} aria-label={`Account for ${p.name}`}>
                    <option value="">Not linked</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5"><label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={p.active !== false} onChange={(e) => change(p, { active: e.target.checked })} /> {p.active !== false ? "Yes" : "Left"}</label></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoursesTab({ data, canManageAll }) {
  const { courses } = data;
  const [adding, setAdding] = useState({ name: "", category: "General", intervalMonths: 12 });
  const [message, setMessage] = useState("");
  const categories = useMemo(() => [...new Set(courses.map((c) => c.category || "General"))], [courses]);
  const change = async (course, patch) => { setMessage(""); try { await saveCourse({ ...course, ...patch }); } catch (problem) { setMessage(problem?.message || "That didn't save."); } };
  async function add(event) {
    event.preventDefault();
    if (!adding.name.trim()) return;
    try { await saveCourse({ id: newCourseId(adding.name), ...adding, order: courses.length }); setAdding({ ...adding, name: "" }); } catch (problem) { setMessage(problem?.message || "That didn't save."); }
  }
  if (!canManageAll) return <p className="text-sm text-slate-300">The list of courses is kept by the Practice Manager. It is: {courses.map((c) => c.name).join(", ") || "empty so far"}.</p>;
  return (
    <div className="space-y-3">
      {message && <p className="text-sm text-rose-300" role="alert">{message}</p>}
      <form onSubmit={add} className="grid gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3 sm:grid-cols-5">
        <label className={`${LABEL} sm:col-span-2`}>Add a course<input className={FIELD} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Course name" /></label>
        <label className={LABEL}>Group<input className={FIELD} list="training-categories" value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value })} /></label>
        <label className={LABEL}>Repeats<select className={FIELD} value={adding.intervalMonths} onChange={(e) => setAdding({ ...adding, intervalMonths: Number(e.target.value) })}>{INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}</select></label>
        <div className="flex items-end"><button type="submit" className={PRIMARY} disabled={!adding.name.trim()}>Add</button></div>
      </form>
      <datalist id="training-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Course</th><th className="px-3 py-2">Group</th><th className="px-3 py-2">Repeats</th><th className="px-3 py-2">Shown</th></tr></thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-t border-white/5">
                <td className="px-3 py-1.5"><input className="w-64 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-100" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && change(c, { name: e.target.value })} aria-label={`Name of ${c.name}`} /></td>
                <td className="px-3 py-1.5"><input className="w-44 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-100" list="training-categories" defaultValue={c.category || "General"} onBlur={(e) => e.target.value !== (c.category || "General") && change(c, { category: e.target.value })} aria-label={`Group of ${c.name}`} /></td>
                <td className="px-3 py-1.5"><select className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-100" value={c.intervalMonths || 0} onChange={(e) => change(c, { intervalMonths: Number(e.target.value) })} aria-label={`How often ${c.name} repeats`}>{INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}</select></td>
                <td className="px-3 py-1.5"><label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={c.active !== false} onChange={(e) => change(c, { active: e.target.checked })} /> {c.active !== false ? "Yes" : "Hidden"}</label></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Changing how often a course repeats changes when each person's date runs out, where only the date done is recorded.</p>
    </div>
  );
}

function ImportTab({ data }) {
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]); // [{ name, rows, use }]
  const [parsed, setParsed] = useState(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const plan = useMemo(() => (parsed ? planImport(parsed, { courses: data.courses, people: data.people, records: data.records }) : null), [parsed, data.courses, data.people, data.records]);

  async function choose(event) {
    const picked = event.target.files?.[0];
    setParsed(null); setResult(""); setError(""); setSheets([]);
    if (!picked) return;
    setFile(picked);
    try {
      const read = readWorkbook(new Uint8Array(await picked.arrayBuffer()));
      setSheets(read.map((s) => ({ ...s, use: likelyLiveSheet(s.name) })));
    } catch { setError("That file could not be read. It needs to be an Excel (.xlsx) file."); }
  }
  const readSheets = () => { setResult(""); setParsed(parseTrainingSheets(sheets.filter((s) => s.use))); };
  async function run() {
    setBusy(true); setError("");
    try { const done = await applyImportPlan(plan); setResult(`Imported: ${done.written} entries saved. People and courses already on file were left as they are.`); setParsed(null); setSheets([]); setFile(null); } catch (problem) { setError(problem?.message || "The import did not finish."); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">Bring in your training spreadsheet</p>
        <p className="mt-1">Choose your matrix (an Excel file). It is read on this computer; nothing is uploaded until you press Import. It brings in people, courses and the dates, and works out the traffic lights from the dates (not from the colours in the spreadsheet). Anything already in Primovex is kept: nothing is deleted, and an older date never replaces a newer one. You can import again later.</p>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 py-2 font-semibold text-slate-100"><Upload className="h-4 w-4" /> Choose an Excel file<input type="file" accept=".xlsx" className="sr-only" onChange={choose} /></label>
        {file && <span className="ml-3 text-slate-400">{file.name}</span>}
      </div>
      {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
      {result && <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100" role="status">{result}</p>}
      {sheets.length > 0 && !parsed && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
          <p className="font-semibold text-slate-100">Which sheets hold your staff?</p>
          <p className="text-sm text-slate-400">The sheets that look like the toolkit's examples or old staff are left unticked.</p>
          <ul className="mt-2 space-y-1">{sheets.map((s, i) => <li key={s.name}><label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={s.use} onChange={(e) => setSheets(sheets.map((x, j) => (j === i ? { ...x, use: e.target.checked } : x)))} /> {s.name} <span className="text-slate-500">({s.rows.length} rows)</span></label></li>)}</ul>
          <button type="button" className={`${PRIMARY} mt-3`} disabled={!sheets.some((s) => s.use)} onClick={readSheets}>Read these sheets</button>
        </div>
      )}
      {parsed && plan && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <Tile label="People found" value={parsed.people.length} />
            <Tile label="Courses found" value={parsed.courses.length} />
            <Tile label="Dates found" value={parsed.records.length} />
            <Tile label="Cells to check" value={parsed.warnings.length} tone={parsed.warnings.length ? "bg-amber-400/10" : ""} />
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200">
            <p className="font-semibold text-slate-100">If you press Import now</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>{plan.newPeople.length} new {plan.newPeople.length === 1 ? "person" : "people"} added ({plan.existingPeople} already here are kept as they are)</li>
              <li>{plan.newCourses.length} new {plan.newCourses.length === 1 ? "course" : "courses"} added ({plan.existingCourses} already here are kept)</li>
              <li>{plan.records.length} dates saved ({plan.unchanged} are no newer than what is already recorded{plan.kept ? `, ${plan.kept} marked not required or away are left alone` : ""})</li>
            </ul>
            <p className="mt-2 text-slate-400">Afterwards: check the course names and how often each repeats under Courses, and link people to their Primovex accounts under People.</p>
          </div>
          {parsed.warnings.length > 0 && (
            <details className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 text-sm text-amber-100">
              <summary className="cursor-pointer font-semibold">{parsed.warnings.length} cells were not imported (open to see which)</summary>
              <ul className="mt-2 max-h-56 list-disc space-y-0.5 overflow-y-auto pl-5">{parsed.warnings.map((w, i) => <li key={i}>{w.sheet}{w.person ? `, ${w.person}` : ""}{w.course ? `, ${w.course}` : ""}: {w.text}</li>)}</ul>
            </details>
          )}
          <div className="flex gap-2"><button type="button" className={PRIMARY} disabled={busy || (!plan.records.length && !plan.newPeople.length && !plan.newCourses.length)} onClick={run}>{busy ? "Importing…" : "Import"}</button><button type="button" className={BTN} onClick={() => setParsed(null)}>Back</button></div>
        </div>
      )}
    </div>
  );
}

export default function Training() {
  const { user, displayName, can } = useAuth();
  const actor = { displayName: displayName || user?.email || "", email: user?.email || "" };
  const data = useTrainingData(true);
  const canManageAll = can("training.manage");
  const [tab, setTab] = useState("matrix");
  const tabs = [["matrix", "Matrix"], ["people", "People"], ["courses", "Courses"], ...(canManageAll ? [["import", "Import"]] : [])];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><GraduationCap className="h-6 w-6 text-teal-300" aria-hidden="true" /> Staff training</h1>
          <p className="text-sm text-slate-400">{data.scope === "clinical" ? "The clinical team's training: who has done what, and when it runs out." : "Everyone's training: who has done what, and when it runs out."} Staff are reminded 60 days before a course runs out and when it has.</p>
        </div>
      </div>
      <div className="flex gap-1 border-b border-white/10" role="tablist">
        {tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${tab === key ? "bg-white/10 text-slate-50" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>)}
      </div>
      {data.error && <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100" role="alert">{data.error}</p>}
      {!data.ready ? <p className="text-sm text-slate-400">Opening…</p> : tab === "matrix" ? <MatrixTab data={data} actor={actor} canManageAll={canManageAll} />
        : tab === "people" ? <PeopleTab data={data} canManageAll={canManageAll} />
          : tab === "courses" ? <CoursesTab data={data} canManageAll={canManageAll} />
            : <ImportTab data={data} />}
    </div>
  );
}
