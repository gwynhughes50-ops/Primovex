import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { listStaffDirectory } from "@/services/staffDirectoryService";
import { DAYS, DAY_LABELS, DAY_SHORT, MODES, TIME_CHOICES, checkRules, groupLabel, groupsOf, inStandardOrder, newPerson, timeLabel } from "@/modules/rota/rotaModel";
import { saveRules } from "@/modules/rota/rotaService";

// The rules, entered once. Each person: the days they work, how they take part (rotate / always one shift / a usual shift and cover / only certain shifts), shifts they never do, earliest start and
// latest finish for each day, a weekly limit on a kind of shift, and a day when they always do one shift until a set time (Karen L on a Wednesday). Everything is picked from a list.
// Below: the shifts themselves (times, how many people, which are essential) and two settings. Changes are kept only when "Save the rules" is pressed.
const FIELD = "rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--medtrak-text)] [&>option]:text-slate-900";
const BTN = "rounded-lg border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold text-[var(--medtrak-text)] disabled:opacity-40";
const PRIMARY = "rounded-lg bg-[var(--medtrak-accent)] px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";
const clone = (v) => JSON.parse(JSON.stringify(v));
const shiftText = (s) => `${s.label} (${timeLabel(s.start)}–${timeLabel(s.end)})`;

function Check({ checked, onChange, children, disabled }) {
  return <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {children}</label>;
}
const toggled = (list, value, on) => (on ? [...new Set([...(list || []), value])] : (list || []).filter((x) => x !== value));

function TimeSelect({ value, onChange, blank, disabled }) {
  return <select value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={FIELD}><option value="">{blank}</option>{TIME_CHOICES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</select>;
}

function PersonCard({ person, rules, onChange, onRemove, canManage }) {
  const shifts = rules.shifts;
  const set = (patch) => onChange({ ...person, ...patch });
  const setDay = (field, day, value) => { const next = { ...(person[field] || {}) }; if (value) next[day] = value; else delete next[day]; set({ [field]: next }); };
  const [sure, setSure] = useState(false);
  const groups = groupsOf(rules);
  return (
    <details className="rounded-2xl border border-[var(--medtrak-border)] p-3">
      <summary className="cursor-pointer text-sm"><strong>{person.name}</strong> <span className="text-[var(--medtrak-muted)]">· {MODES[person.mode]}{person.shift && (person.mode === "fixed" || person.mode === "usual") ? `: ${rules.shifts.find((s) => s.id === person.shift)?.label || ""}` : ""} · {person.days.map((d) => DAY_SHORT[d]).join(" ")}</span></summary>
      <div className="mt-3 space-y-4">
        <div>
          <p className="text-xs font-bold">Works on</p>
          <div className="mt-1 flex flex-wrap gap-3">{DAYS.map((d) => <Check key={d} checked={person.days.includes(d)} disabled={!canManage} onChange={(on) => set({ days: DAYS.filter((x) => (x === d ? on : person.days.includes(x))) })}>{DAY_LABELS[d]}</Check>)}</div>
        </div>
        <label className="block text-xs font-bold">How they take part
          <select value={person.mode} disabled={!canManage} onChange={(e) => set({ mode: e.target.value })} className={`${FIELD} mt-1 block w-full max-w-md font-normal`}>{Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        {(person.mode === "fixed" || person.mode === "usual") && (
          <label className="block text-xs font-bold">{person.mode === "fixed" ? "Their shift" : "Their usual shift"}
            <select value={person.shift} disabled={!canManage} onChange={(e) => set({ shift: e.target.value })} className={`${FIELD} mt-1 block w-full max-w-md font-normal`}><option value="">Choose a shift</option>{shifts.map((s) => <option key={s.id} value={s.id}>{shiftText(s)}</option>)}</select>
          </label>
        )}
        {person.mode === "usual" && (
          <div><p className="text-xs font-bold">Can step in on (when an essential shift would otherwise be empty)</p><div className="mt-1 flex flex-wrap gap-3">{shifts.filter((s) => s.essential).map((s) => <Check key={s.id} checked={(person.coverShifts || []).includes(s.id)} disabled={!canManage} onChange={(on) => set({ coverShifts: toggled(person.coverShifts, s.id, on) })}>{s.label}</Check>)}</div></div>
        )}
        {person.mode === "only" && (
          <div><p className="text-xs font-bold">The shifts they work</p><div className="mt-1 flex flex-wrap gap-3">{shifts.map((s) => <Check key={s.id} checked={(person.onlyShifts || []).includes(s.id)} disabled={!canManage} onChange={(on) => set({ onlyShifts: toggled(person.onlyShifts, s.id, on) })}>{shiftText(s)}</Check>)}</div></div>
        )}
        <div><p className="text-xs font-bold">Never does</p><div className="mt-1 flex flex-wrap gap-3">{shifts.map((s) => <Check key={s.id} checked={(person.cannotDo || []).includes(s.id)} disabled={!canManage} onChange={(on) => set({ cannotDo: toggled(person.cannotDo, s.id, on) })}>{s.label}</Check>)}</div></div>
        <div>
          <p className="text-xs font-bold">Hours: the earliest they can start and the latest they can finish, for each day (leave blank for no limit)</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-5">
            {DAYS.map((d) => (
              <div key={d} className="rounded-lg border border-[var(--medtrak-border)] p-2 text-xs">
                <p className="font-bold">{DAY_LABELS[d]}</p>
                <label className="mt-1 block">Not before<TimeSelect value={person.earliest?.[d]} blank="No limit" disabled={!canManage} onChange={(v) => setDay("earliest", d, v)} /></label>
                <label className="mt-1 block">Done by<TimeSelect value={person.latest?.[d]} blank="No limit" disabled={!canManage} onChange={(v) => setDay("latest", d, v)} /></label>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold">At most this many a week</p>
          <div className="mt-1 flex flex-wrap gap-3">
            {groups.map((g) => (
              <label key={g} className="text-xs">{groupLabel(rules, g)}
                <select value={person.maxPerWeek?.[g] ?? ""} disabled={!canManage} onChange={(e) => { const next = { ...(person.maxPerWeek || {}) }; if (e.target.value === "") delete next[g]; else next[g] = Number(e.target.value); set({ maxPerWeek: next }); }} className={`${FIELD} ml-1`}>
                  <option value="">No limit</option>{[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold">A day when they always do one shift, until a set time (for example a half day)</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-5">
            {DAYS.map((d) => {
              const rule = person.dayRules?.[d];
              return (
                <div key={d} className="rounded-lg border border-[var(--medtrak-border)] p-2 text-xs">
                  <p className="font-bold">{DAY_LABELS[d]}</p>
                  <select value={rule?.shift || ""} disabled={!canManage} onChange={(e) => { const next = { ...(person.dayRules || {}) }; if (!e.target.value) delete next[d]; else next[d] = { shift: e.target.value, until: rule?.until || "" }; set({ dayRules: next }); }} className={`${FIELD} mt-1 w-full`}>
                    <option value="">Normal rules</option>{groupsOf(rules).filter((g) => shifts.filter((s) => s.group === g).length > 1).map((g) => <option key={`g-${g}`} value={`group:${g}`}>Any {groupLabel(rules, g)} ({shifts.filter((s) => s.group === g).map((s) => s.label).join(" or ")})</option>)}{shifts.map((s) => <option key={s.id} value={s.id}>{s.label} only</option>)}
                  </select>
                  {rule?.shift && <label className="mt-1 block">Until<TimeSelect value={rule.until} blank="End of shift" disabled={!canManage} onChange={(v) => set({ dayRules: { ...person.dayRules, [d]: { ...rule, until: v } } })} /></label>}
                </div>
              );
            })}
          </div>
        </div>
        {canManage && (
          <div>{sure
            ? <span className="flex flex-wrap items-center gap-2 text-sm"><span className="text-amber-200">Take {person.name} off the rota?</span><button type="button" className={PRIMARY} onClick={onRemove}>Yes, take off</button><button type="button" className={BTN} onClick={() => setSure(false)}>Keep</button></span>
            : <button type="button" className={BTN} onClick={() => setSure(true)}><Trash2 className="mr-1 inline h-4 w-4" />Take off the rota</button>}</div>
        )}
      </div>
    </details>
  );
}

function ShiftsEditor({ rules, onChange, canManage }) {
  const used = (id) => rules.people.some((p) => p.shift === id || (p.onlyShifts || []).includes(id) || (p.coverShifts || []).includes(id) || (p.cannotDo || []).includes(id) || Object.values(p.dayRules || {}).some((r) => r.shift === id));
  const setShift = (i, patch) => onChange({ ...rules, shifts: rules.shifts.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const [problem, setProblem] = useState("");
  const move = (i, by) => { const next = [...rules.shifts]; const j = i + by; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j], next[i]]; onChange({ ...rules, shifts: next }); };
  return (
    <section className="rounded-2xl border border-[var(--medtrak-border)] p-4">
      <h2 className="text-lg font-bold text-slate-50">The shifts</h2>
      <p className="text-xs text-[var(--medtrak-muted)]">The order here is the order down the rota, in print and in Excel. Use the arrows to move a shift, or put them all in the usual order in one go. Press "Save the rules" afterwards.</p>
      {canManage && <button type="button" className={`${BTN} mt-2`} onClick={() => onChange({ ...rules, shifts: inStandardOrder(rules.shifts) })}>Put the shifts in the usual order (Early 1, Early 2, Mid, Late, Admin 1, 2, 3, Desk/phones, Desk/phones mornings, Ty Elan)</button>}
      <p className="text-xs text-[var(--medtrak-muted)]">An essential shift must be covered every day: if it can't be, the rota says so. A shift that is not essential is given up when there are too few people, the lowest "given up" number first.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs text-[var(--medtrak-muted)]"><tr><th className="p-1">Name</th><th className="p-1">Counted as</th><th className="p-1">Start</th><th className="p-1">Finish</th><th className="p-1">People</th><th className="p-1">Essential</th><th className="p-1">Given up</th><th className="p-1">Days</th><th className="p-1" /></tr></thead>
          <tbody>
            {rules.shifts.map((s, i) => (
              <tr key={s.id} className="align-top">
                <td className="p-1"><input value={s.label} disabled={!canManage} onChange={(e) => setShift(i, { label: e.target.value })} className={`${FIELD} w-40`} /></td>
                <td className="p-1"><select value={s.group} disabled={!canManage} onChange={(e) => setShift(i, { group: e.target.value })} className={FIELD}>{[...new Set([...groupsOf(rules), s.group])].map((g) => <option key={g} value={g}>{groupLabel(rules, g)}</option>)}</select></td>
                <td className="p-1"><TimeSelect value={s.start} blank="" disabled={!canManage} onChange={(v) => v && setShift(i, { start: v })} /></td>
                <td className="p-1"><TimeSelect value={s.end} blank="" disabled={!canManage} onChange={(v) => v && setShift(i, { end: v })} /></td>
                <td className="p-1"><select value={s.count} disabled={!canManage} onChange={(e) => setShift(i, { count: Number(e.target.value) })} className={FIELD}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
                <td className="p-1"><input type="checkbox" checked={Boolean(s.essential)} disabled={!canManage} onChange={(e) => setShift(i, { essential: e.target.checked })} aria-label={`${s.label} is essential`} /></td>
                <td className="p-1">{s.essential ? "—" : <select value={s.dropOrder || 5} disabled={!canManage} onChange={(e) => setShift(i, { dropOrder: Number(e.target.value) })} className={FIELD}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 1 ? " (first)" : ""}</option>)}</select>}</td>
                <td className="p-1"><div className="flex gap-1.5">{DAYS.map((d) => <label key={d} className="text-xs"><input type="checkbox" checked={(s.days || []).includes(d)} disabled={!canManage} onChange={(e) => setShift(i, { days: DAYS.filter((x) => (x === d ? e.target.checked : (s.days || []).includes(x))) })} /> {DAY_SHORT[d]}</label>)}</div></td>
                <td className="p-1 whitespace-nowrap">{canManage && <><button type="button" className={BTN} disabled={i === 0} aria-label={`Move ${s.label} up`} onClick={() => move(i, -1)}>↑</button> <button type="button" className={BTN} disabled={i === rules.shifts.length - 1} aria-label={`Move ${s.label} down`} onClick={() => move(i, 1)}>↓</button> </>}{canManage && <button type="button" className={BTN} aria-label={`Remove ${s.label}`} onClick={() => { if (used(s.id)) { setProblem(`${s.label} is used in someone's rules. Change their rules first.`); return; } setProblem(""); onChange({ ...rules, shifts: rules.shifts.filter((_, k) => k !== i) }); }}><Trash2 className="h-4 w-4" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {problem && <p className="mt-2 text-sm text-rose-200">{problem}</p>}
      {canManage && <button type="button" className={`${BTN} mt-3`} onClick={() => { let n = rules.shifts.length + 1; while (rules.shifts.some((s) => s.id === `shift${n}`)) n += 1; onChange({ ...rules, shifts: [...rules.shifts, { id: `shift${n}`, label: `Shift ${n}`, group: `shift${n}`, start: "09:00", end: "17:00", essential: false, count: 1, days: DAYS, dropOrder: 5 }] }); }}><Plus className="mr-1 inline h-4 w-4" />Add a shift</button>}
    </section>
  );
}

export default function RotaRulesPanel({ rules, actor, canManage }) {
  const [draft, setDraft] = useState(() => clone(rules));
  const [dirty, setDirty] = useState(false);
  const [staff, setStaff] = useState([]);
  const [staffProblem, setStaffProblem] = useState("");
  const [pick, setPick] = useState("");
  const [state, setState] = useState({ busy: false, error: "", saved: false });
  useEffect(() => { if (!dirty) setDraft(clone(rules)); }, [rules]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!canManage) return;
    listStaffDirectory().then((rows) => { setStaff(rows); setStaffProblem(rows.length ? "" : "The staff list is empty. Staff are added in Practice Admin."); }).catch((e) => { setStaff([]); setStaffProblem(`The staff list could not be loaded${e?.message ? `: ${e.message}` : "."}`); });
  }, [canManage]);

  const change = (next) => { setDraft(next); setDirty(true); setState((s) => ({ ...s, saved: false })); };
  const onRota = new Set(draft.people.map((p) => p.uid));
  const choices = useMemo(() => staff.filter((s) => !onRota.has(s.id)).sort((a, b) => String(a.label).localeCompare(String(b.label))), [staff, draft.people]); // eslint-disable-line react-hooks/exhaustive-deps
  const problems = useMemo(() => checkRules(draft), [draft]);

  async function save() {
    setState({ busy: true, error: "", saved: false });
    try { await saveRules(draft, actor); setDirty(false); setState({ busy: false, error: "", saved: true }); } catch (e) { setState({ busy: false, error: e?.message || "The rules could not be saved.", saved: false }); }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--medtrak-border)] p-4">
        <h2 className="text-lg font-bold text-slate-50">The reception team</h2>
        <p className="text-xs text-[var(--medtrak-muted)]">People are chosen from the practice's staff list. Open a person to see and change their rules.</p>
        {canManage && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold">Add to the rota<select value={pick} onChange={(e) => setPick(e.target.value)} className={`${FIELD} mt-1 block min-w-60 font-normal`}><option value="">Choose from the staff list</option>{choices.map((s) => <option key={s.id} value={s.id}>{s.label}{s.role ? ` · ${s.role}` : ""}</option>)}</select></label>
            {staffProblem && <p className="basis-full text-sm text-rose-200">{staffProblem}</p>}
            <button type="button" className={PRIMARY} disabled={!pick} onClick={() => { const s = staff.find((x) => x.id === pick); if (s) { change({ ...draft, people: [...draft.people, newPerson(s.id, s.label)] }); setPick(""); } }}>Add</button>
          </div>
        )}
        <div className="mt-3 space-y-2">
          {draft.people.map((p) => <PersonCard key={p.uid} person={p} rules={draft} canManage={canManage} onChange={(next) => change({ ...draft, people: draft.people.map((x) => (x.uid === p.uid ? next : x)) })} onRemove={() => change({ ...draft, people: draft.people.filter((x) => x.uid !== p.uid) })} />)}
          {!draft.people.length && <p className="text-sm text-slate-400">Nobody yet.</p>}
        </div>
      </section>
      <ShiftsEditor rules={draft} onChange={change} canManage={canManage} />
      <section className="rounded-2xl border border-[var(--medtrak-border)] p-4">
        <h2 className="text-lg font-bold text-slate-50">Settings</h2>
        <div className="mt-2 space-y-1">
          <Check checked={draft.settings?.avoidLateThenEarly !== false} disabled={!canManage} onChange={(on) => change({ ...draft, settings: { ...draft.settings, avoidLateThenEarly: on } })}>Avoid an early shift the morning after a late</Check>
          <Check checked={draft.settings?.rollFridayLate !== false} disabled={!canManage} onChange={(on) => change({ ...draft, settings: { ...draft.settings, rollFridayLate: on } })}>Share the Friday late round the team in turn</Check>
        </div>
      </section>
      {canManage && (
        <div className="sticky bottom-2 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel,#0f172a)] p-3">
          <button type="button" className={PRIMARY} disabled={!dirty || state.busy || problems.length > 0} onClick={save}>{state.busy ? "Saving…" : "Save the rules"}</button>
          {dirty && <button type="button" className={BTN} onClick={() => { setDraft(clone(rules)); setDirty(false); }}>Undo my changes</button>}
          {state.saved && !dirty && <span className="text-sm text-emerald-200">Saved. Build the rota again to use the new rules.</span>}
          {problems.length > 0 && <span className="text-sm text-amber-200">{problems[0]}{problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""}</span>}
          {state.error && <span className="text-sm text-rose-200">{state.error}</span>}
        </div>
      )}
    </div>
  );
}
