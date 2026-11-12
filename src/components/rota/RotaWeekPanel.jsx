import { useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Download, Info, Pin, Printer, ShieldCheck, Smartphone, UserMinus } from "lucide-react";
import { printHtmlDocument } from "@/lib/printHtmlDocument";
import { DAYS, DAY_LABELS, addDays, availabilityOn, dateOf, isoOf, offText, partTimes, ruleCoversShift, timeLabel, weekDates, weekLabel } from "@/modules/rota/rotaModel";
import { generateWeek, weekCounters } from "@/modules/rota/rotaEngine";
import { checkWeek, historyBefore, lockedOf, setPlace, slotsOfDay, withNames } from "@/modules/rota/rotaWeek";
import { buildRotaHtml, buildRotaXlsx, counterColumns, runningCounters } from "@/modules/rota/rotaExport";
import { saveWeek } from "@/modules/rota/rotaService";
import { publishWeeks } from "@/modules/rota/rotaTeamService";
import { isPublishedCurrent } from "@/modules/rota/rotaPublish";
import { groupColour, initials, personColour, tint } from "./rotaStyle";
import RotaReviewPanel from "./RotaReviewPanel";

// The rota for a week: a grid of shifts by day, each kind of shift in its own colour and each person as a coloured chip. Primovex builds it from the rules and who is off; every place can be changed by
// hand (click the chip), the change is checked straight away (double bookings, someone who is off, hours, weekly limits, an empty essential shift), and a place fixed by hand is kept when the week is
// built again. Print it, or take it to Excel.
const BTN = "inline-flex items-center gap-1.5 rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold text-[var(--medtrak-text)] transition hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,transparent)] disabled:opacity-40";
const PRIMARY = "inline-flex items-center gap-1.5 rounded-xl bg-[var(--medtrak-accent)] px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:brightness-110 disabled:opacity-40";
const CARD = "rounded-2xl border border-[var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-panel,#0f172a)_60%,transparent)]";
const shortDay = (iso) => dateOf(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const dayNumber = (iso) => dateOf(iso).getDate();

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
}

function Tile({ icon: Icon, tone, label, value, note }) {
  const colours = { good: "#10b981", warn: "#f59e0b", bad: "#f43f5e", info: "#3b82f6" }[tone] || "#64748b";
  return (
    <div className={`${CARD} flex items-start gap-3 p-3.5`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: tint(colours, 18), color: colours }}><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">{label}</p>
        <p className="text-lg font-black leading-tight text-[var(--medtrak-text)]">{value}</p>
        {note && <p className="mt-0.5 truncate text-xs text-[var(--medtrak-muted)]" title={note}>{note}</p>}
      </div>
    </div>
  );
}

function Avatar({ uid, name, size = "h-6 w-6 text-[10px]" }) {
  return <span className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${size}`} style={{ background: personColour(uid) }} aria-hidden="true">{initials(name)}</span>;
}

export default function RotaWeekPanel({ rules, weeks, absences, actor, canManage, startMonday, published = {}, teamAccess = false }) {
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
  const today = isoOf(new Date());

  // weeks from this one on that now have someone on who is off (an absence was added after they were built)
  const stale = useMemo(() => Object.values(weeks).filter((w) => w.mondayIso >= startMonday && checkWeek(rules, w, absences).some((i) => /but is off/.test(i.text))).map((w) => w.mondayIso).sort(), [weeks, rules, absences, startMonday]);

  const rows = useMemo(() => {
    const seen = new Set(); const list = [];
    for (const day of DAYS) for (const s of slotsOfDay(rules, day)) if (!seen.has(s.key)) { seen.add(s.key); list.push(s); }
    return list.sort((a, b) => (rules.shifts.indexOf(a.shift) - rules.shifts.indexOf(b.shift)) || a.key.localeCompare(b.key));
  }, [rules]);
  const groupOrder = useMemo(() => [...new Set(rules.shifts.map((s) => s.group))], [rules]);
  const colourOf = (shift) => groupColour(shift.group, groupOrder.indexOf(shift.group));

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

  // what the team can see of this week: nothing until the coordinator publishes it, and a note when the rota has changed since
  const pubDoc = published[monday];
  const pubState = !week ? "none" : !pubDoc ? "not" : isPublishedCurrent(week, pubDoc, rules) ? "current" : "changed";
  const unpublished = Object.values(weeks).filter((w) => w.mondayIso >= startMonday && w.days && !(published[w.mondayIso] && isPublishedCurrent(w, published[w.mondayIso], rules)));
  async function publish(list) {
    setBusy(true); setError("");
    try { await publishWeeks(list, rules, actor); } catch (e) { setError(e?.message || "That could not be published."); }
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

  // the numbers at the top
  const cover = useMemo(() => {
    let total = 0; let covered = 0;
    for (const { day } of weekDates(monday)) for (const s of slotsOfDay(rules, day)) if (s.shift.essential) { total += 1; if (week?.days?.[day]?.slots?.[s.key]) covered += 1; }
    return { total, covered };
  }, [rules, week, monday]);
  const gaps = issues.filter((i) => i.severity === "gap");
  const notes = issues.filter((i) => i.severity !== "gap");
  const offPeople = people.filter((p) => dates.some(({ iso }) => offText(absences, p.uid, iso)));
  const maxIn = (group) => Math.max(1, ...people.map((p) => counters[p.uid]?.[group] || 0));
  const maxTotal = Math.max(1, ...people.map((p) => counters[p.uid]?.total || 0));
  const lastDay = addDays(monday, 4);

  return (
    <div className="space-y-5">
      <div className={`${CARD} flex flex-wrap items-center gap-3 p-3`}>
        <div className="flex items-center gap-1 rounded-xl border border-[var(--medtrak-border)] p-1">
          <button type="button" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_14%,transparent)]" onClick={() => setMonday(addDays(monday, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
          <div className="px-3 text-center leading-tight">
            <p className="text-sm font-black text-[var(--medtrak-text)]">Week commencing {weekLabel(monday)}</p>
            <p className="text-[11px] text-[var(--medtrak-muted)]">{shortDay(monday)} to {shortDay(lastDay)}</p>
          </div>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_14%,transparent)]" onClick={() => setMonday(addDays(monday, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
        </div>
        {monday !== startMonday && <button type="button" className={BTN} onClick={() => setMonday(startMonday)}><CalendarRange className="h-4 w-4" aria-hidden="true" />This week</button>}
        {week && <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: tint("#10b981", 16), color: "#10b981" }}>Built</span>}
        {!week && <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: tint("#f59e0b", 16), color: "#f59e0b" }}>Not built yet</span>}
        {week && <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: tint(pubState === "current" ? "#8b5cf6" : "#64748b", 16), color: pubState === "current" ? "#8b5cf6" : "#94a3b8" }} title={teamAccess ? "" : "The team's access is off, so they cannot see published weeks yet"}>{pubState === "current" ? "Published to the team" : pubState === "changed" ? "Changed since published" : "Not published"}</span>}
        {canManage && week && pubState !== "current" && <button type="button" className={BTN} disabled={busy} onClick={() => publish([week])}><Smartphone className="h-4 w-4" aria-hidden="true" />{pubState === "changed" ? "Publish the changes" : "Publish to the team"}</button>}
        {canManage && unpublished.length > 1 && <button type="button" className={BTN} disabled={busy} onClick={() => publish(unpublished)}>Publish all {unpublished.length} built weeks</button>}
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={BTN} disabled={!named} onClick={() => doPrint([named])}><Printer className="h-4 w-4" aria-hidden="true" />Print this week</button>
          <button type="button" className={BTN} disabled={!named} onClick={() => download(buildRotaXlsx([named], rules), `reception-rota-${monday}.xlsx`)}><Download className="h-4 w-4" aria-hidden="true" />Excel, this week</button>
          <button type="button" className={BTN} disabled={!builtFromNow.length} onClick={() => download(buildRotaXlsx(builtFromNow, rules), `reception-rota-from-${startMonday}.xlsx`)}><Download className="h-4 w-4" aria-hidden="true" />Excel, all built weeks</button>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={week && cover.covered === cover.total ? ShieldCheck : AlertTriangle} tone={!week ? "info" : cover.covered === cover.total ? "good" : "bad"} label="Essential shifts covered" value={week ? `${cover.covered} of ${cover.total}` : "Not built"} note={week ? (cover.covered === cover.total ? "Every essential shift has someone" : `${cover.total - cover.covered} without anyone`) : "Build the rota to see cover"} />
        <Tile icon={gaps.length ? AlertTriangle : CheckCircle2} tone={!week ? "info" : gaps.length ? "bad" : notes.length ? "warn" : "good"} label="Needs attention" value={!week ? "—" : gaps.length ? `${gaps.length} to fix` : "Nothing to fix"} note={week ? `${notes.length} note${notes.length === 1 ? "" : "s"} to know about` : ""} />
        <Tile icon={UserMinus} tone={offPeople.length ? "warn" : "info"} label="Off this week" value={offPeople.length ? `${offPeople.length} ${offPeople.length === 1 ? "person" : "people"}` : "Nobody"} note={offPeople.map((p) => p.name).join(", ")} />
      </div>

      <RotaReviewPanel rules={rules} weeks={weeks} absences={absences} startMonday={startMonday} canManage={canManage} onGoToWeek={setMonday} />

      {canManage && (
        <div className={`${CARD} flex flex-wrap items-center gap-3 p-3`}>
          <label className="flex items-center gap-2 text-sm font-semibold text-[var(--medtrak-text)]">Build
            <select value={span} onChange={(e) => { setSpan(Number(e.target.value)); setConfirmBuild(false); }} className="rounded-xl border border-[var(--medtrak-border)] bg-transparent px-2.5 py-2 text-sm font-normal [&>option]:text-slate-900">{[1, 2, 4, 8, 12].map((n) => <option key={n} value={n}>{n === 1 ? "this week only" : `${n} weeks from here`}</option>)}</select>
          </label>
          {confirmBuild
            ? <><span className="text-sm text-amber-200">Weeks already built will be built again. Places you fixed by hand stay.</span><button type="button" className={PRIMARY} disabled={busy} onClick={() => build(targets)}>Yes, build</button><button type="button" className={BTN} onClick={() => setConfirmBuild(false)}>Cancel</button></>
            : <button type="button" className={PRIMARY} disabled={busy || !people.length} onClick={() => (alreadyBuilt ? setConfirmBuild(true) : build(targets))}>{busy ? "Building…" : "Build the rota"}</button>}
          {stale.length > 0 && !confirmBuild && <button type="button" className={BTN} disabled={busy} onClick={() => build(stale)}>Rebuild the {stale.length} week{stale.length === 1 ? "" : "s"} where someone is now off</button>}
          <span className="ml-auto text-xs text-[var(--medtrak-muted)]">Click any name in the rota to change it. Places you change are kept when it is built again.</span>
        </div>
      )}
      {stale.length > 0 && <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">Someone is now off in {stale.length === 1 ? "a week that was built before the absence was entered" : `${stale.length} weeks that were built before the absences were entered`}: {stale.map((m) => weekLabel(m)).join(", ")}. {canManage ? "Rebuild them (above)." : "Ask whoever builds the rota."}</p>}
      {error && <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>}
      {!week && <p className={`${CARD} p-4 text-sm text-[var(--medtrak-muted)]`}>No rota has been built for this week yet.{canManage ? " Press Build the rota." : ""}</p>}

      <div className={`${CARD} overflow-auto`}>
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 min-w-[170px] bg-[var(--medtrak-bg,#0b1220)] p-2.5" />
              {dates.map(({ day, iso }) => {
                const isToday = iso === today;
                return (
                  <th key={day} className={`sticky top-0 z-10 bg-[var(--medtrak-bg,#0b1220)] p-2.5 text-left ${isToday ? "border-b-2 border-[var(--medtrak-accent)]" : "border-b border-[var(--medtrak-border)]"}`}>
                    <span className="flex items-baseline gap-2">
                      <span className={`grid h-8 w-8 place-items-center rounded-lg text-base font-black ${isToday ? "bg-[var(--medtrak-accent)] text-slate-950" : "bg-[color:color-mix(in_srgb,var(--medtrak-text)_8%,transparent)] text-[var(--medtrak-text)]"}`}>{dayNumber(iso)}</span>
                      <span><span className="block text-sm font-bold text-[var(--medtrak-text)]">{DAY_LABELS[day]}</span><span className="block text-[11px] font-normal text-[var(--medtrak-muted)]">{dateOf(iso).toLocaleDateString("en-GB", { month: "short" })}{isToday ? " · today" : ""}</span></span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((slot) => {
              const c = colourOf(slot.shift);
              return (
                <tr key={slot.key} className="align-top">
                  <th className="sticky left-0 z-10 border-b border-[var(--medtrak-border)] bg-[var(--medtrak-bg,#0b1220)] p-0 text-left">
                    <div className="flex h-full items-center gap-2.5 py-2 pl-0 pr-2.5">
                      <span className="h-10 w-1.5 rounded-r-full" style={{ background: c }} aria-hidden="true" />
                      <span><span className="block text-sm font-bold text-[var(--medtrak-text)]">{slot.shift.label}</span><span className="block text-[11px] font-normal text-[var(--medtrak-muted)]">{timeLabel(slot.shift.start)}–{timeLabel(slot.shift.end)}{slot.shift.essential ? "" : " · optional"}</span></span>
                    </div>
                  </th>
                  {dates.map(({ day, iso }) => {
                    const isToday = iso === today;
                    if (!slotsOfDay(rules, day).some((s) => s.key === slot.key)) return <td key={day} className={`border-b border-[var(--medtrak-border)] p-2 text-center text-[var(--medtrak-muted)] ${isToday ? "bg-[color:color-mix(in_srgb,var(--medtrak-accent)_5%,transparent)]" : ""}`}>–</td>;
                    const place = week?.days?.[day]?.slots?.[slot.key];
                    const person = place && people.find((p) => p.uid === place.uid);
                    const name = place ? place.name || person?.name || "Someone" : "";
                    const bad = place && issues.some((i) => i.day === day && i.severity === "gap" && i.text.includes(person?.name || place.name || "\u0000"));
                    const fixed = week?.edited?.[`${day}|${slot.key}`];
                    const times = [place?.from ? `from ${timeLabel(place.from)}` : "", place?.until ? `until ${timeLabel(place.until)}` : ""].filter(Boolean).join(" ");
                    const options = people.filter((p) => (p.days || []).includes(day) || p.uid === place?.uid);
                    return (
                      <td key={day} className={`border-b border-[var(--medtrak-border)] p-1.5 ${isToday ? "bg-[color:color-mix(in_srgb,var(--medtrak-accent)_5%,transparent)]" : ""}`}>
                        <div className="group relative">
                          {place ? (
                            <div className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 transition group-hover:brightness-110 ${bad ? "ring-2 ring-rose-400" : ""}`} style={{ background: tint(c, 15), borderColor: tint(c, 42) }}>
                              <Avatar uid={place.uid} name={name} />
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--medtrak-text)]">{name}</span>
                              {canManage && <ChevronRight className="h-3.5 w-3.5 rotate-90 text-[var(--medtrak-muted)] opacity-0 transition group-hover:opacity-100" aria-hidden="true" />}
                            </div>
                          ) : (
                            <div className={`rounded-xl border border-dashed px-2.5 py-1.5 text-sm ${slot.shift.essential ? "font-semibold" : ""}`} style={slot.shift.essential ? { borderColor: tint("#f43f5e", 55), background: tint("#f43f5e", 9), color: "#f43f5e" } : { borderColor: "var(--medtrak-border)", color: "var(--medtrak-muted)" }}>
                              {slot.shift.essential ? "Nobody" : "Not staffed"}
                            </div>
                          )}
                          {canManage && (
                            <select value={place?.uid || ""} onChange={(e) => change(day, slot.key, e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer rounded-xl opacity-0 [&>option]:text-slate-900 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--medtrak-accent)]" aria-label={`${slot.shift.label} on ${DAY_LABELS[day]}`}>
                              <option value="">{slot.shift.essential ? "— nobody —" : "— not staffed —"}</option>
                              {options.map((p) => <option key={p.uid} value={p.uid}>{p.name}{offText(absences, p.uid, iso) ? ` (off ${offText(absences, p.uid, iso)})` : ""}</option>)}
                            </select>
                          )}
                        </div>
                        {(times || fixed) && (
                          <span className="mt-1 flex flex-wrap items-center gap-1">
                            {times && <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: tint("#f59e0b", 18), color: "#d97706" }}>{times}</span>}
                            {fixed && <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-[var(--medtrak-muted)]" style={{ background: tint("#64748b", 14) }}><Pin className="h-2.5 w-2.5" aria-hidden="true" />fixed by hand</span>}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="align-top">
              <th className="sticky left-0 z-10 bg-[var(--medtrak-bg,#0b1220)] p-0 text-left"><div className="flex items-center gap-2.5 py-3 pr-2.5"><span className="h-6 w-1.5 rounded-r-full bg-[var(--medtrak-muted)] opacity-40" aria-hidden="true" /><span className="text-sm font-bold text-[var(--medtrak-muted)]">Off</span></div></th>
              {dates.map(({ day, iso }) => (
                <td key={day} className={`p-1.5 ${iso === today ? "bg-[color:color-mix(in_srgb,var(--medtrak-accent)_5%,transparent)]" : ""}`}>
                  <span className="flex flex-wrap gap-1">
                    {people.filter((p) => offText(absences, p.uid, iso)).map((p) => (
                      <span key={p.uid} className="inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-[var(--medtrak-text)]" style={{ background: tint("#f59e0b", 16) }}><Avatar uid={p.uid} name={p.name} size="h-4 w-4 text-[8px]" />{p.name} · {offText(absences, p.uid, iso)}</span>
                    ))}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {week && (
        <section className={`${CARD} p-4`}>
          <h3 className="flex items-center gap-2 text-sm font-black text-[var(--medtrak-text)]"><Info className="h-4 w-4 text-[var(--medtrak-muted)]" aria-hidden="true" />Things to know about this week</h3>
          {issues.length ? (
            <ul className="mt-2 space-y-1.5">
              {[...gaps, ...notes].map((i, k) => (
                <li key={k} className="flex items-start gap-2 rounded-xl px-3 py-2 text-sm" style={i.severity === "gap" ? { background: tint("#f43f5e", 10), color: "var(--medtrak-text)" } : { background: tint("#f59e0b", 9), color: "var(--medtrak-text)" }}>
                  {i.severity === "gap" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />}
                  <span>{i.severity === "gap" && <strong className="mr-1 text-rose-400">Needs attention:</strong>}{i.text}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: tint("#10b981", 12) }}><CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />Every shift is covered and nothing needs attention.</p>}
        </section>
      )}

      {week && (
        <section className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-2 text-sm font-black text-[var(--medtrak-text)]">Shift counter</h3>
            <div className="inline-flex rounded-xl border border-[var(--medtrak-border)] p-0.5">
              <button type="button" className={`rounded-lg px-3 py-1 text-xs font-semibold ${counterView === "week" ? "bg-[var(--medtrak-accent)] text-slate-950" : "text-[var(--medtrak-text)]"}`} onClick={() => setCounterView("week")}>This week</button>
              <button type="button" className={`rounded-lg px-3 py-1 text-xs font-semibold ${counterView === "total" ? "bg-[var(--medtrak-accent)] text-slate-950" : "text-[var(--medtrak-text)]"}`} onClick={() => setCounterView("total")}>Running total ({throughThis.length} week{throughThis.length === 1 ? "" : "s"})</button>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-y-1 text-left text-sm">
              <thead className="text-[11px] text-[var(--medtrak-muted)]">
                <tr>
                  <th className="px-2 py-1 font-bold uppercase tracking-wide">Name</th>
                  {cols.map((c) => <th key={c.group} className="px-1 py-1 font-bold uppercase tracking-wide"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: groupColour(c.group, groupOrder.indexOf(c.group)) }} aria-hidden="true" />{c.label}</span></th>)}
                  <th className="px-2 py-1 font-bold uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody>
                {people.filter((p) => counters[p.uid]?.total).map((p) => (
                  <tr key={p.uid}>
                    <td className="px-2 py-1"><span className="inline-flex items-center gap-2 font-semibold text-[var(--medtrak-text)]"><Avatar uid={p.uid} name={p.name} size="h-5 w-5 text-[9px]" />{p.name}</span></td>
                    {cols.map((col) => {
                      const v = counters[p.uid][col.group] || 0;
                      const colour = groupColour(col.group, groupOrder.indexOf(col.group));
                      const pct = Math.round((v / maxIn(col.group)) * 100);
                      return <td key={col.group} className="px-1 py-1"><div className="relative h-6 min-w-[44px] overflow-hidden rounded-md" style={{ background: tint(colour, 7) }}><div className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${pct}%`, background: tint(colour, 30) }} /><span className="relative z-10 flex h-full items-center px-2 text-xs font-semibold text-[var(--medtrak-text)]">{v || <span className="text-[var(--medtrak-muted)]">0</span>}</span></div></td>;
                    })}
                    <td className="px-2 py-1"><div className="relative h-6 min-w-[48px] overflow-hidden rounded-md" style={{ background: tint("#64748b", 10) }}><div className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${Math.round((counters[p.uid].total / maxTotal) * 100)}%`, background: tint("#64748b", 30) }} /><span className="relative z-10 flex h-full items-center px-2 text-xs font-black text-[var(--medtrak-text)]">{counters[p.uid].total}</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--medtrak-muted)]">{counterView === "total" ? `Added up over every built week up to and including this one (from week commencing ${throughThis.length ? weekLabel(throughThis[0].mondayIso) : ""}). ` : ""}Counts every place a name appears in; a part shift (for example until 12) counts as one.</p>
        </section>
      )}
    </div>
  );
}
