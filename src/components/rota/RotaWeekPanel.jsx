import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Printer, Pin } from "lucide-react";
import { printHtmlDocument } from "@/lib/printHtmlDocument";
import { DAYS, DAY_LABELS, addDays, availabilityOn, dateOf, offText, partTimes, ruleCoversShift, timeLabel, weekDates, weekLabel } from "@/modules/rota/rotaModel";
import { generateWeek, weekCounters } from "@/modules/rota/rotaEngine";
import { checkWeek, historyBefore, lockedOf, setPlace, slotsOfDay, withNames } from "@/modules/rota/rotaWeek";
import { buildRotaHtml, buildRotaXlsx, counterColumns, runningCounters } from "@/modules/rota/rotaExport";
import { saveWeek } from "@/modules/rota/rotaService";

// The rota for a week: a grid of shifts by day. Primovex builds it from the rules and who is off; every place can be changed by hand, the change is checked straight away (double bookings, someone who
// is off, hours, weekly limits, an empty essential shift), and a place fixed by hand is kept when the week is built again. Print it, or take it to Excel.
const FIELD = "w-full rounded-lg border border-[var(--medtrak-border)] bg-transparent px-1.5 py-1.5 text-sm text-[var(--medtrak-text)] [&>option]:text-slate-900";
const BTN = "rounded-lg border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold text-[var(--medtrak-text)] disabled:opacity-40";
const PRIMARY = "rounded-lg bg-[var(--medtrak-accent)] px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";
const shortDay = (iso) => dateOf(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
}

export default function RotaWeekPanel({ rules, weeks, absences, actor, canManage, startMonday }) {
  const [monday, setMonday] = useState(startMonday);
  const [span, setSpan] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmBuild, setConfirmBuild] = useState(false);
  const [counterView, setCounterView] = useState("week"); // week | total
  const week = weeks[monday] || null;
  const named = useMemo(() => (week ? withNames(week, rules) : null), [week, rules]);
  const issues = useMemo(() => (week ? checkWeek(rules, week, absences) : []), [week, rules, absences]);
  const dates = weekDates(monday);
  const people = rules.people || [];

  // weeks from this one on that now have someone on who is off (an absence was added after they were built)
  const stale = useMemo(() => Object.values(weeks).filter((w) => w.mondayIso >= startMonday && checkWeek(rules, w, absences).some((i) => /but is off/.test(i.text))).map((w) => w.mondayIso).sort(), [weeks, rules, absences, startMonday]);

  const rows = useMemo(() => {
    const seen = new Set(); const list = [];
    for (const day of DAYS) for (const s of slotsOfDay(rules, day)) if (!seen.has(s.key)) { seen.add(s.key); list.push(s); }
    return list.sort((a, b) => (rules.shifts.indexOf(a.shift) - rules.shifts.indexOf(b.shift)) || a.key.localeCompare(b.key));
  }, [rules]);

  async function build(mondays) {
    setBusy(true); setError(""); setConfirmBuild(false);
    try {
      const local = { ...weeks };
      for (const m of mondays) {
        const result = generateWeek({ rules, mondayIso: m, absences, history: historyBefore(local, m, rules), locked: lockedOf(local[m]) });
        const edited = {};
        for (const day of DAYS) for (const [key, a] of Object.entries(result.days[day].slots)) if (a.source === "locked") edited[`${day}|${key}`] = true;
        const built = { mondayIso: m, days: result.days, issues: result.issues, edited };
        await saveWeek(built, actor, { edited, built: true });
        local[m] = built;
      }
    } catch (e) { setError(e?.message || "The rota could not be built."); }
    setBusy(false);
  }

  const targets = Array.from({ length: span }, (_, i) => addDays(monday, 7 * i));
  const alreadyBuilt = targets.some((m) => weeks[m]);

  async function change(day, key, uid) {
    setError("");
    const base = week || { mondayIso: monday, days: {}, edited: {} };
    const slot = rows.find((r) => r.key === key);
    const rule = people.find((p) => p.uid === uid)?.dayRules?.[day];
    // the times they are in for: their rule's "until", and any time off that day
    const avail = uid ? availabilityOn(absences, uid, weekDates(monday).find((d) => d.day === day).iso) : null;
    const t = avail && slot ? partTimes(avail, slot.shift) : { from: null, until: null };
    const ruleUntil = rule && ruleCoversShift(rule.shift, slot?.shift) ? rule.until || null : null;
    const until = ruleUntil && (!t.until || ruleUntil < t.until) ? ruleUntil : t.until;
    const next = setPlace(base, rules, day, key, uid, { from: t.from, until });
    try { await saveWeek(next, actor, { edited: next.edited }); } catch (e) { setError(e?.message || "That change could not be saved."); }
  }

  // the running total: every built week up to and including this one
  const throughThis = useMemo(() => Object.values(weeks).filter((w) => w.mondayIso <= monday && w.days).sort((a, b) => a.mondayIso.localeCompare(b.mondayIso)), [weeks, monday]);
  const weekOnly = named ? weekCounters(named, rules) : {};
  const counters = counterView === "total" ? runningCounters(throughThis, rules) : weekOnly;
  const cols = counterColumns(rules);
  const builtFromNow = Object.values(weeks).filter((w) => w.mondayIso >= startMonday).sort((a, b) => a.mondayIso.localeCompare(b.mondayIso)).map((w) => withNames(w, rules));
  const doPrint = (list) => printHtmlDocument(buildRotaHtml(list, rules, { printedBy: actor.displayName }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN} onClick={() => setMonday(addDays(monday, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
        <h2 className="text-lg font-bold text-slate-50">Week commencing {weekLabel(monday)}</h2>
        <button type="button" className={BTN} onClick={() => setMonday(addDays(monday, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
        {monday !== startMonday && <button type="button" className={BTN} onClick={() => setMonday(startMonday)}>This week</button>}
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={BTN} disabled={!named} onClick={() => doPrint([named])}><Printer className="mr-1 inline h-4 w-4" />Print this week</button>
          <button type="button" className={BTN} disabled={!named} onClick={() => download(buildRotaXlsx([named], rules), `reception-rota-${monday}.xlsx`)}><Download className="mr-1 inline h-4 w-4" />Excel, this week</button>
          <button type="button" className={BTN} disabled={!builtFromNow.length} onClick={() => download(buildRotaXlsx(builtFromNow, rules), `reception-rota-from-${startMonday}.xlsx`)}><Download className="mr-1 inline h-4 w-4" />Excel, all built weeks</button>
        </span>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--medtrak-border)] p-3">
          <label className="text-sm">Build <select value={span} onChange={(e) => { setSpan(Number(e.target.value)); setConfirmBuild(false); }} className="mx-1 rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2 py-1.5 text-sm [&>option]:text-slate-900">{[1, 2, 4, 8, 12].map((n) => <option key={n} value={n}>{n === 1 ? "this week only" : `${n} weeks from here`}</option>)}</select></label>
          {confirmBuild
            ? <><span className="text-sm text-amber-200">Weeks already built will be built again. Places you fixed by hand stay.</span><button type="button" className={PRIMARY} disabled={busy} onClick={() => build(targets)}>Yes, build</button><button type="button" className={BTN} onClick={() => setConfirmBuild(false)}>Cancel</button></>
            : <button type="button" className={PRIMARY} disabled={busy || !people.length} onClick={() => (alreadyBuilt ? setConfirmBuild(true) : build(targets))}>{busy ? "Building…" : "Build the rota"}</button>}
          {stale.length > 0 && !confirmBuild && <button type="button" className={BTN} disabled={busy} onClick={() => build(stale)}>Rebuild the {stale.length} week{stale.length === 1 ? "" : "s"} where someone is now off</button>}
        </div>
      )}
      {stale.length > 0 && <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">Someone is now off in {stale.length === 1 ? "a week that was built before the absence was entered" : `${stale.length} weeks that were built before the absences were entered`}: {stale.map((m) => weekLabel(m)).join(", ")}. {canManage ? "Rebuild them (above)." : "Ask whoever builds the rota."}</p>}
      {error && <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>}

      {!week && <p className="rounded-xl border border-[var(--medtrak-border)] p-3 text-sm text-slate-400">No rota has been built for this week yet.{canManage ? " Press Build the rota." : ""}</p>}

      <div className="overflow-x-auto rounded-2xl border border-[var(--medtrak-border)]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-xs text-[var(--medtrak-muted)]">
            <tr><th className="p-2" />{dates.map(({ day, iso }) => <th key={day} className="p-2">{DAY_LABELS[day]} <span className="font-normal">{shortDay(iso)}</span></th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--medtrak-border)]">
            {rows.map((slot) => (
              <tr key={slot.key} className="align-top">
                <th className="p-2 text-xs font-semibold">{slot.shift.label}<span className="block font-normal text-[var(--medtrak-muted)]">{timeLabel(slot.shift.start)}–{timeLabel(slot.shift.end)}</span></th>
                {dates.map(({ day, iso }) => {
                  if (!slotsOfDay(rules, day).some((s) => s.key === slot.key)) return <td key={day} className="p-2 text-[var(--medtrak-muted)]">–</td>;
                  const place = week?.days?.[day]?.slots?.[slot.key];
                  const person = place && people.find((p) => p.uid === place.uid);
                  const bad = place && issues.some((i) => i.day === day && i.severity === "gap" && i.text.includes(person?.name || place.name || "\u0000"));
                  const empty = !place;
                  const options = people.filter((p) => (p.days || []).includes(day) || p.uid === place?.uid);
                  return (
                    <td key={day} className={`p-1.5 ${bad ? "bg-rose-500/10" : empty && slot.shift.essential ? "bg-amber-500/10" : ""}`}>
                      {canManage ? (
                        <select value={place?.uid || ""} onChange={(e) => change(day, slot.key, e.target.value)} className={FIELD} aria-label={`${slot.shift.label} on ${DAY_LABELS[day]}`}>
                          <option value="">{slot.shift.essential ? "— nobody —" : "— not staffed —"}</option>
                          {options.map((p) => <option key={p.uid} value={p.uid}>{p.name}{offText(absences, p.uid, iso) ? ` (off ${offText(absences, p.uid, iso)})` : ""}</option>)}
                        </select>
                      ) : <span>{place ? place.name || person?.name : "—"}</span>}
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--medtrak-muted)]">{[place?.from ? `from ${timeLabel(place.from)}` : "", place?.until ? `until ${timeLabel(place.until)}` : ""].filter(Boolean).join(" ")}{week?.edited?.[`${day}|${slot.key}`] && <><Pin className="h-3 w-3" aria-hidden="true" /> fixed by hand</>}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="align-top">
              <th className="p-2 text-xs font-semibold">Off</th>
              {dates.map(({ day, iso }) => <td key={day} className="p-2 text-xs text-[var(--medtrak-muted)]">{people.filter((p) => offText(absences, p.uid, iso)).map((p) => `${p.name} (${offText(absences, p.uid, iso)})`).join(", ") || ""}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {week && (
        <section>
          <h3 className="text-sm font-bold text-slate-50">Things to know about this week</h3>
          {issues.length ? (
            <ul className="mt-1 space-y-1 text-sm">
              {issues.map((i, k) => <li key={k} className={i.severity === "gap" ? "text-rose-200" : "text-amber-100"}>{i.severity === "gap" ? "Needs attention: " : ""}{i.text}</li>)}
            </ul>
          ) : <p className="mt-1 text-sm text-emerald-200">Every shift is covered and nothing needs attention.</p>}
        </section>
      )}

      {week && (
        <section>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-50">Shift counter</h3>
            <button type="button" className={`rounded-full px-3 py-1 text-xs font-semibold ${counterView === "week" ? "bg-[var(--medtrak-accent)] text-slate-950" : "border border-[var(--medtrak-border)] text-[var(--medtrak-text)]"}`} onClick={() => setCounterView("week")}>This week</button>
            <button type="button" className={`rounded-full px-3 py-1 text-xs font-semibold ${counterView === "total" ? "bg-[var(--medtrak-accent)] text-slate-950" : "border border-[var(--medtrak-border)] text-[var(--medtrak-text)]"}`} onClick={() => setCounterView("total")}>Running total ({throughThis.length} week{throughThis.length === 1 ? "" : "s"})</button>
          </div>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-[var(--medtrak-muted)]"><tr><th className="p-1">Name</th>{cols.map((c) => <th key={c.group} className="p-1">{c.label}</th>)}<th className="p-1">Total</th></tr></thead>
              <tbody className="divide-y divide-[var(--medtrak-border)]">
                {people.filter((p) => counters[p.uid]?.total).map((p) => <tr key={p.uid}><td className="p-1">{p.name}</td>{cols.map((c) => <td key={c.group} className="p-1">{counters[p.uid][c.group] || 0}</td>)}<td className="p-1 font-semibold">{counters[p.uid].total}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-[var(--medtrak-muted)]">{counterView === "total" ? `Added up over every built week up to and including this one (from week commencing ${throughThis.length ? weekLabel(throughThis[0].mondayIso) : ""}). ` : ""}Counts every place a name appears in; a part shift (for example until 12) counts as one.</p>
        </section>
      )}
    </div>
  );
}
