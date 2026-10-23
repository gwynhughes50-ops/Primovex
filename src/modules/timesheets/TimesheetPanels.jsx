import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyStaffRecord, useClaims, usePlaces } from "@/modules/mileage/mileageService";
import { printHtmlDocument } from "@/lib/printHtmlDocument";
import { auditHtml, historySteps, stateWords } from "./timesheetAudit";
import { periodTotals } from "@/modules/mileage/mileage";
import { CODES, STATE, STATE_LABEL, codeLabel, declarationText, describeLines, dueStatus, expectedFor, lineProblem, needsStaff, payrollCsv, periodLabel, periodProblem, submitProblem, suggestPeriod, summary } from "./timesheet";
import { dateKey, hoursLabel, parseKey } from "./workPattern";
import { useTimesheetStaff } from "./timesheetService";
import { decideTimesheet, dispatchTimesheet, savePeriod, sendTimesheet, takeBackTimesheet, useCurrentPeriod, useHistory, usePeriods, useSheets } from "./timesheetFlowService";

// The screens for pay-period timesheets, used on the desktop (My timesheet page) and the phone (Me tab). `skin` picks the look.
//   MyTimesheetPanel   the person: "no changes" in one tap, or record what was different
//   SignOffPanel       the line manager: declarations to sign off in one go, and the ones with changes in full
//   PayrollPanel       the payroll team: signed-off timesheets, sent on or returned with a reason (desktop)
//   PeriodsPanel       whoever manages timesheets: the pay periods and who has not sent theirs yet (desktop)

const SKINS = {
  desktop: {
    field: "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60",
    label: "block text-xs font-semibold uppercase tracking-wide text-slate-400",
    card: "rounded-2xl border border-white/10 bg-slate-900/70 p-4", muted: "text-slate-400", strong: "text-slate-100", body: "text-slate-200",
    btn: "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40",
    primary: "inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40",
    big: "flex-1 rounded-2xl border border-white/15 p-4 text-left hover:bg-white/5", bigOn: "flex-1 rounded-2xl border border-teal-300/60 bg-teal-500/10 p-4 text-left",
    warn: "rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100", ok: "rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100", bad: "text-rose-300",
    note: "rounded-lg bg-white/5 p-3 text-sm text-slate-300", line: "border-t border-white/5",
    chip: { submitted: "bg-amber-400/25 text-amber-100", approved: "bg-sky-500/20 text-sky-100", sent: "bg-emerald-500/20 text-emerald-100", declined: "bg-rose-500/20 text-rose-100", returned: "bg-rose-500/20 text-rose-100", draft: "bg-white/10 text-slate-200" },
  },
  phone: {
    field: "mt-1 min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 text-base",
    label: "block text-sm font-bold", card: "rounded-2xl border border-[var(--medtrak-border)] p-3", muted: "text-[var(--medtrak-muted)]", strong: "", body: "",
    btn: "min-h-12 rounded-2xl border border-[var(--medtrak-border)] px-4 font-bold disabled:opacity-40", primary: "min-h-12 rounded-2xl bg-[var(--medtrak-accent)] px-4 font-bold text-white disabled:opacity-40",
    big: "rounded-2xl border border-[var(--medtrak-border)] p-4 text-left", bigOn: "rounded-2xl border-2 border-[var(--medtrak-accent)] bg-black/5 p-4 text-left",
    warn: "rounded-2xl bg-amber-400/20 p-3 text-sm font-semibold text-amber-900", ok: "rounded-2xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-800", bad: "text-rose-700",
    note: "rounded-2xl bg-black/5 p-3 text-sm", line: "border-t border-[var(--medtrak-border)]",
    chip: { submitted: "bg-amber-400/25 text-amber-800", approved: "bg-sky-500/15 text-sky-800", sent: "bg-emerald-500/15 text-emerald-700", declined: "bg-rose-500/15 text-rose-700", returned: "bg-rose-500/15 text-rose-700", draft: "bg-black/5" },
  },
};

const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const dayLabel = (key) => { const d = parseKey(key); return d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : key; };
const stamp = (at) => (at?.seconds ? new Date(at.seconds * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const today = () => dateKey(new Date());
const SHORT_STATE = { draft: "Not sent", submitted: "With your line manager", declined: "Declined", approved: "Signed off", returned: "Returned", sent: "Sent to payroll" };

function PeriodPicker({ s, periods, value, onChange }) {
  return (
    <label className={s.label}>Pay period
      <select className={s.field} value={value || ""} onChange={(e) => onChange(e.target.value)}>{periods.map((p) => <option key={p.id} value={p.id}>{p.name}: {periodLabel(p)}</option>)}</select>
    </label>
  );
}

// the steps a timesheet has been through, from the server's trail
const CHANGE_WORD = { added: "Added", removed: "Removed", changed: "Changed" };
const whenText = (ms) => (ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

function History({ s, sheet, role, period = null }) {
  const { user, displayName } = useAuth();
  const [open, setOpen] = useState(false);
  const history = useHistory(sheet, role, open);
  const steps = useMemo(() => historySteps(history.list || []), [history.list]);
  const print = () => printHtmlDocument(auditHtml({ sheet, period, steps, stateLabel: stateWords(sheet.state), printedBy: displayName || user?.email || "" }));
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={`text-sm font-semibold underline ${s.muted}`} onClick={() => setOpen(!open)}>{open ? "Hide the history" : "Show the history"}</button>
        {open && steps.length > 0 && <button type="button" className={s.btn} onClick={print}>Print the audit</button>}
      </div>
      {open && (history.list === null ? <p className={`mt-1 text-sm ${s.muted}`}>Opening…</p> : !history.list.length ? <p className={`mt-1 text-sm ${s.muted}`}>{history.error || "Nothing is recorded yet (it can take a moment to appear)."}</p> : (
        <ol className="mt-2 space-y-2 text-sm">
          {steps.map((h) => (
            <li key={h.id} className={`${s.note} space-y-0.5`}>
              <p className={s.body}><b className={s.strong}>{h.action.charAt(0).toUpperCase() + h.action.slice(1)}</b>{h.who ? ` by ${h.who}` : ""} <span className={s.muted}>· {whenText(h.atMs)}</span></p>
              {h.reason && <p className={s.body}>Reason: “{h.reason}”</p>}
              {h.reference && <p className={s.body}>Reference: {h.reference}</p>}
              {h.kindNote && <p className={s.body}>{h.kindNote}</p>}
              {h.changes.map((c, i) => <p key={i} className={s.body}><b>{CHANGE_WORD[c.type]}:</b> {c.text}{c.type === "changed" ? <span className={s.muted}> (was {c.from.replace(/^[^:]*: /, "")})</span> : null}</p>)}
              {h.totals && <p className={`text-xs ${s.muted}`}>After this step: {h.totals}</p>}
            </li>
          ))}
        </ol>
      ))}
    </div>
  );
}

const lineList = (s, lines) => lines.map((l, i) => <li key={i} className={s.body}>{dayLabel(l.date)}: {codeLabel(l.code)}, {l.hours}h{l.comment ? ` (${l.comment})` : ""}</li>);

// ---------------------------------------------------------------------------------------------------------------------------------
export function MyTimesheetPanel({ skin = "desktop" }) {
  const s = SKINS[skin];
  const { user, displayName } = useAuth();
  const actor = { displayName: displayName || user?.email || "" };
  const me = useMyStaffRecord();
  const periods = usePeriods();
  const sheets = useSheets("mine");
  const [periodId, setPeriodId] = useState("");
  const [mode, setMode] = useState(null); // null | "no-change" | "changes"
  const [lines, setLines] = useState([]);
  const [draft, setDraft] = useState({ date: "", code: "B", hours: "", comment: "" });
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const current = useCurrentPeriod(periods.list, today());
  const period = (periods.list || []).find((p) => p.id === periodId) || current;
  const existing = period ? (sheets.list || []).find((t) => t.periodId === period.id) || null : null;
  const expected = useMemo(() => (period && me.record ? expectedFor(me.record.patterns || [], period) : null), [period, me.record]);

  // when the period or the saved timesheet changes, start the form from what is saved
  useEffect(() => {
    setMode(existing && needsStaff(existing.state) ? existing.kind || null : null);
    setLines(existing?.lines || []);
    setConfirmed(false); setError("");
  }, [period?.id, existing?.id, existing?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me.ready || periods.list === null || sheets.list === null) return <p className={`text-sm ${s.muted}`}>Opening…</p>;
  if (!me.record) return <p className={s.warn}>Your sign-in isn't linked to a staff record yet, so there is no timesheet for you. Ask the Practice Manager to link it (Timesheets, then People).</p>;
  if (!period) return <p className={s.warn}>No pay period has been set up yet. Ask the Practice Manager.</p>;

  const due = dueStatus(period, existing?.state || STATE.draft, today());
  const editable = !existing || needsStaff(existing.state);
  const reason = existing && needsStaff(existing.state) ? (existing.state === STATE.returned ? existing.payroll : existing.decision)?.reason : "";
  const reasonBy = existing?.state === STATE.returned ? existing?.payroll?.by : existing?.decision?.by;
  const days = (expected?.days || []).map((d) => d.date);
  const problem = mode ? submitProblem({ kind: mode, lines, confirmed }, period) : "";
  const lineIssue = draft.date ? lineProblem(draft, period) : "";

  async function send(asDraft = false) {
    setBusy(true); setError(""); setMessage("");
    try {
      await sendTimesheet({ period, me: me.record, uid: user.uid, actor, existing, kind: mode, lines, send: !asDraft });
      setMessage(asDraft ? "Saved. It has not been sent yet." : "Sent to your line manager. Thank you.");
    } catch (failure) { setError(failure?.message || "That didn't send. Check you have permission."); } finally { setBusy(false); }
  }
  // a line being changed is lifted out of the list into the boxes below; "Update this line" puts it back, "Leave it as it was" restores it
  const [editing, setEditing] = useState(null); // { index, line }
  const addLine = () => {
    const line = { ...draft, hours: Number(draft.hours) };
    setLines(editing ? [...lines.slice(0, editing.index), line, ...lines.slice(editing.index)] : [...lines, line]);
    setEditing(null); setDraft({ date: "", code: draft.code, hours: "", comment: "" });
  };
  const editLine = (i) => {
    const line = lines[i];
    if (editing) setLines((list) => [...list.slice(0, editing.index), editing.line, ...list.slice(editing.index)]);
    setEditing({ index: Math.min(i, lines.length - 1), line });
    setDraft({ date: line.date, code: line.code, hours: String(line.hours), comment: line.comment || "" });
    setLines(lines.filter((_, j) => j !== i));
  };
  const cancelEdit = () => { if (editing) setLines([...lines.slice(0, editing.index), editing.line, ...lines.slice(editing.index)]); setEditing(null); setDraft({ date: "", code: draft.code, hours: "", comment: "" }); };
  async function takeBack() {
    setBusy(true); setError(""); setMessage("");
    try { await takeBackTimesheet(existing, { actor, uid: user.uid }); setMessage("Taken back. You can change it now, then send it again."); } catch (failure) { setError(failure?.message || "That could not be done. Try again."); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <PeriodPicker s={s} periods={periods.list} value={period.id} onChange={setPeriodId} />
      <p className={`text-sm ${s.muted}`}>Due by {uk(period.due)}{due === "overdue" ? " (overdue)" : due === "due-soon" ? " (soon)" : ""}. Your usual hours in this period: <b className={s.strong}>{hoursLabel(expected?.hours || 0)}</b>{expected?.days.some((d) => d.bankHoliday) ? `, including ${expected.days.filter((d) => d.bankHoliday).map((d) => d.bankHoliday).join(" and ")}` : ""}.</p>
      {!expected?.hasPattern && <p className={s.warn}>Your working pattern hasn't been set up yet, so there are no usual hours to compare with. Ask the Practice Manager to set it (Timesheets, People).</p>}
      {message && <p className={s.ok} role="status">{message}</p>}
      {reason && <p className={s.warn} role="alert">{existing.state === STATE.returned ? "Returned by payroll" : "Declined"}{reasonBy ? ` by ${reasonBy}` : ""}: “{reason}”. Put it right and send it again.</p>}

      {existing && !editable ? (
        <div className={s.card}>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className={`font-semibold ${s.strong}`}>{existing.kind === "no-change" ? "You said your hours were as normal." : "You recorded changes."}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.chip[existing.state]}`}>{SHORT_STATE[existing.state]}</span></div>
          <p className={`mt-1 text-sm ${s.muted}`}>{STATE_LABEL[existing.state]}.</p>
          {existing.lines?.length > 0 && <><p className={`mt-2 text-xs font-bold uppercase tracking-wide ${s.muted}`}>What you sent</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{lineList(s, existing.lines)}</ul></>}
          {existing.state === STATE.submitted && (
            <div className={`${s.note} mt-3`}>
              <p className="text-sm">Spotted a mistake, or want to add or remove a day? You can take it back, change it and send it again, as long as your line manager has not signed it off.</p>
              {error && <p className={`mt-1 text-sm font-semibold ${s.bad}`} role="alert">{error}</p>}
              <button type="button" className={`${s.btn} mt-2`} disabled={busy} onClick={takeBack}>{busy ? "Taking it back…" : "Take it back to change it"}</button>
            </div>
          )}
          <History s={s} sheet={existing} role="staff" period={period} />
        </div>
      ) : (
        <>
          <div className={skin === "phone" ? "grid gap-2" : "flex gap-3"}>
            <button type="button" className={mode === "no-change" ? s.bigOn : s.big} onClick={() => { setMode("no-change"); setLines([]); setConfirmed(false); }}><span className={`block font-bold ${s.strong}`}>No changes</span><span className={`text-sm ${s.muted}`}>My hours were the same as my usual pattern.</span></button>
            <button type="button" className={mode === "changes" ? s.bigOn : s.big} onClick={() => { setMode("changes"); setConfirmed(false); }}><span className={`block font-bold ${s.strong}`}>Something was different</span><span className={`text-sm ${s.muted}`}>Overtime, time in lieu, sickness, leave or anything else.</span></button>
          </div>

          {mode === "changes" && (
            <div className={`${s.card} space-y-2`}>
              <p className={`font-semibold ${s.strong}`}>What was different?</p>
              {lines.length > 0 && (
                <div className="space-y-2">
                  <p className={`text-xs font-bold uppercase tracking-wide ${s.muted}`}>Added so far ({lines.length}): not sent yet</p>
                  <ul className="space-y-1.5">{lines.map((l, i) => (
                    <li key={i} className={`${s.note} flex flex-wrap items-center justify-between gap-2 text-sm`}>
                      <span><b className={s.strong}>{dayLabel(l.date)}</b> · {codeLabel(l.code)} · <b className={s.strong}>{l.hours}h</b>{l.comment ? ` · ${l.comment}` : ""}</span>
                      <span className="flex gap-2"><button type="button" className={s.btn} onClick={() => editLine(i)}>Edit</button><button type="button" className={s.btn} onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button></span>
                    </li>
                  ))}</ul>
                  <p className={`text-xs ${s.muted}`}>Nothing has gone to your line manager yet. When you have finished, press "Send to my line manager" below, or "Save, send later" to keep it for now.</p>
                </div>
              )}
              {editing && <p className={s.warn}>You are changing a line: {dayLabel(editing.line.date)}, {codeLabel(editing.line.code)}, {editing.line.hours}h. Change it below, then press "Update this line".</p>}
              <div className="grid gap-2 sm:grid-cols-4">
                <label className={s.label}>Day<select className={s.field} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })}><option value="">Choose a day</option>{days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}</select></label>
                <label className={s.label}>What<select className={s.field} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })}>{CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
                <label className={s.label}>Hours<input type="number" inputMode="decimal" min="0" step="0.25" className={s.field} value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} /></label>
                <label className={s.label}>Comment{draft.code === "F" ? " (needed)" : ""}<input className={s.field} value={draft.comment} maxLength={200} onChange={(e) => setDraft({ ...draft, comment: e.target.value })} /></label>
              </div>
              {lineIssue && <p className={`text-sm ${s.muted}`}>{lineIssue}</p>}
              <span className="flex flex-wrap gap-2"><button type="button" className={s.btn} disabled={!draft.date || Boolean(lineIssue)} onClick={addLine}>{editing ? "Update this line" : "Add this"}</button>{editing && <button type="button" className={s.btn} onClick={cancelEdit}>Leave it as it was</button>}</span>
              <p className={`text-xs ${s.muted}`}>Leave, sickness and time in lieu are still booked in BrightHR: list them here so payroll has them.</p>
            </div>
          )}

          {mode && (
            <div className={`${s.card} space-y-2`}>
              <p className="text-sm">{declarationText(mode, period)}</p>
              <label className={`flex items-start gap-2 text-sm font-semibold ${skin === "phone" ? "min-h-12" : ""}`}><input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirm this is correct</label>
              {problem && confirmed === false ? null : problem ? <p className={`text-sm ${s.muted}`}>{problem}</p> : null}
              {error && <p className={`text-sm font-semibold ${s.bad}`} role="alert">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                {mode === "changes" && <button type="button" className={s.btn} disabled={busy || lines.length === 0} onClick={() => send(true)}>Save, send later</button>}
                <button type="button" className={s.primary} disabled={busy || Boolean(problem)} onClick={() => send(false)}>{busy ? "Sending…" : "Send to my line manager"}</button>
              </div>
            </div>
          )}
          {existing && <History s={s} sheet={existing} role="staff" period={period} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
export function SignOffPanel({ skin = "desktop", canManage = false }) {
  const s = SKINS[skin];
  const { user, displayName } = useAuth();
  const actor = { displayName: displayName || user?.email || "" };
  const periods = usePeriods();
  const sheets = useSheets(canManage ? "all" : "managed");
  const [periodId, setPeriodId] = useState("");
  const [declining, setDeclining] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const mine = useMemo(() => (sheets.list || []).filter((t) => t.uid !== user?.uid && (t.managerUid === user?.uid || (!t.managerUid && canManage))), [sheets.list, user?.uid, canManage]);
  const waiting = mine.filter((t) => t.state === STATE.submitted);
  const periodIds = [...new Set(waiting.map((t) => t.periodId))];
  const shownPeriods = (periods.list || []).filter((p) => periodIds.includes(p.id));
  const period = shownPeriods.find((p) => p.id === periodId) || shownPeriods[0] || null;
  const inPeriod = waiting.filter((t) => t.periodId === period?.id);
  const noChange = inPeriod.filter((t) => t.kind === "no-change");
  const changed = inPeriod.filter((t) => t.kind !== "no-change");

  async function run(id, work, done) { setBusy(id); setError(""); setMessage(""); try { await work(); setMessage(done); } catch (failure) { setError(failure?.message || "That didn't save. Check you have permission."); } finally { setBusy(""); } }
  const approve = (t) => run(t.id, () => decideTimesheet(t, STATE.approved, { actor, uid: user.uid }), `${t.staffName}'s timesheet is signed off.`);
  const approveAll = () => run("all", async () => { for (const t of noChange) await decideTimesheet(t, STATE.approved, { actor, uid: user.uid }); }, `${noChange.length} signed off.`);
  const decline = (t) => run(t.id, async () => { await decideTimesheet(t, STATE.declined, { reason, actor, uid: user.uid }); setDeclining(""); setReason(""); }, `${t.staffName}'s timesheet was declined, with your reason.`);

  if (periods.list === null || sheets.list === null) return <p className={`text-sm ${s.muted}`}>Opening…</p>;
  return (
    <div className="space-y-3">
      {message && <p className={s.ok} role="status">{message}</p>}
      {error && <p className={`text-sm font-semibold ${s.bad}`} role="alert">{error}</p>}
      {sheets.error && <p className={s.warn}>{sheets.error}</p>}
      {!waiting.length ? <p className={`text-sm ${s.muted}`}>Nothing is waiting for you to sign off.</p> : (
        <>
          {shownPeriods.length > 1 && <PeriodPicker s={s} periods={shownPeriods} value={period?.id} onChange={setPeriodId} />}
          {noChange.length > 0 && (
            <div className={s.card}>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className={`font-semibold ${s.strong}`}>{noChange.length} said their hours were as normal</p><button type="button" className={s.primary} disabled={Boolean(busy)} onClick={approveAll}>{busy === "all" ? "Signing off…" : `Sign off all ${noChange.length}`}</button></div>
              <ul className="mt-2 text-sm">{noChange.map((t) => <li key={t.id} className={`py-1 ${s.line}`}><span className={s.body}>{t.staffName}</span> <span className={s.muted}>confirmed {stamp({ seconds: Date.parse(t.declaration?.confirmedAt) / 1000 })}</span> <button type="button" className={`ml-2 text-xs font-semibold underline ${s.muted}`} onClick={() => { setDeclining(t.id); setReason(""); }}>Decline…</button>
                {declining === t.id && <DeclineBox s={s} reason={reason} setReason={setReason} busy={busy === t.id} onConfirm={() => decline(t)} onCancel={() => setDeclining("")} />}</li>)}</ul>
            </div>
          )}
          {changed.map((t) => (
            <div key={t.id} className={s.card}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className={`font-semibold ${s.strong}`}>{t.staffName}</p><p className={`text-sm ${s.muted}`}>Usual hours {hoursLabel(t.expected?.hours || 0)}. Something was different:</p></div>
                {t.submissions > 1 && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.chip.draft}`}>Sent again</span>}
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{lineList(s, t.lines || [])}</ul>
              <p className={`mt-1 text-xs ${s.muted}`}>{CODES.filter((c) => t.totals?.[c.code]).map((c) => `${c.label} ${t.totals[c.code]}h`).join(" · ")}</p>
              {declining === t.id ? <DeclineBox s={s} reason={reason} setReason={setReason} busy={busy === t.id} onConfirm={() => decline(t)} onCancel={() => setDeclining("")} /> : (
                <div className={skin === "phone" ? "mt-2 grid grid-cols-2 gap-2" : "mt-2 flex gap-2"}><button type="button" className={s.primary} disabled={Boolean(busy)} onClick={() => approve(t)}>Sign off</button><button type="button" className={s.btn} disabled={Boolean(busy)} onClick={() => { setDeclining(t.id); setReason(""); }}>Decline…</button></div>
              )}
              <History s={s} sheet={t} role="manager" period={period} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function DeclineBox({ s, reason, setReason, busy, onConfirm, onCancel }) {
  return (
    <div className="mt-2 space-y-2">
      <label className={s.label}>Why is it declined? (they will see this)<input className={s.field} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Overtime on the 12th was not agreed" /></label>
      <div className="flex gap-2"><button type="button" className={s.primary} disabled={busy || reason.trim().length < 3} onClick={onConfirm}>Decline with this reason</button><button type="button" className={s.btn} onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
export function PayrollPanel({ skin = "desktop", canSend }) {
  const s = SKINS[skin];
  const { user, displayName } = useAuth();
  const actor = { displayName: displayName || user?.email || "" };
  const periods = usePeriods();
  const sheets = useSheets("payroll");
  const claims = useClaims({ scope: "all" });
  const places = usePlaces(true);
  const [periodId, setPeriodId] = useState("");
  const [picked, setPicked] = useState({});
  const [reference, setReference] = useState("");
  const [returning, setReturning] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const period = (periods.list || []).find((p) => p.id === periodId) || (periods.list || []).find((p) => (sheets.list || []).some((t) => t.periodId === p.id)) || (periods.list || [])[0] || null;
  const list = (sheets.list || []).filter((t) => t.periodId === period?.id).sort((a, b) => String(a.staffName).localeCompare(String(b.staffName)));
  const toSend = list.filter((t) => t.state === STATE.approved);
  const mileage = useMemo(() => (period ? Object.fromEntries(periodTotals(claims.list || [], period.from, period.to, places.rates).map((r) => [r.uid, r.pence])) : {}), [claims.list, period, places.rates]);
  const chosen = toSend.filter((t) => picked[t.id]);
  const sum = summary(list);

  async function run(id, work, done) { setBusy(id); setError(""); setMessage(""); try { await work(); setMessage(done); } catch (failure) { setError(failure?.message || "That didn't save. Check you have permission."); } finally { setBusy(""); } }
  const send = () => run("send", async () => { for (const t of chosen) await dispatchTimesheet(t, STATE.sent, { reference, actor, uid: user.uid }); setPicked({}); }, `${chosen.length} marked as sent to payroll.`);
  const giveBack = (t) => run(t.id, async () => { await dispatchTimesheet(t, STATE.returned, { reason, actor, uid: user.uid }); setReturning(""); setReason(""); }, `${t.staffName}'s timesheet was returned, with your reason.`);
  function download() {
    const url = URL.createObjectURL(new Blob([payrollCsv(list, period, mileage)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url; link.download = `primovex-timesheets-${period.from}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  if (periods.list === null || sheets.list === null) return <p className={`text-sm ${s.muted}`}>Opening…</p>;
  if (!period) return <p className={`text-sm ${s.muted}`}>No pay period has been set up yet.</p>;
  return (
    <div className="space-y-3">
      <PeriodPicker s={s} periods={periods.list} value={period.id} onChange={(id) => { setPeriodId(id); setPicked({}); }} />
      {message && <p className={s.ok} role="status">{message}</p>}
      {error && <p className={`text-sm font-semibold ${s.bad}`} role="alert">{error}</p>}
      <p className={`text-sm ${s.muted}`}>{list.length} signed off ({sum.noChange} with no changes, {sum.withChanges} with changes){toSend.length ? `; ${toSend.length} still to send to payroll` : ""}.</p>
      {!list.length ? <p className={`text-sm ${s.muted}`}>No signed-off timesheets for this period yet.</p> : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400"><tr>{canSend && <th className="px-2 py-2" />}<th className="px-3 py-2">Person</th><th className="px-3 py-2">Payroll no</th><th className="px-3 py-2">Hours</th><th className="px-3 py-2">Mileage</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody>{list.map((t) => (
              <tr key={t.id} className="border-t border-white/5 align-top">
                {canSend && <td className="px-2 py-2">{t.state === STATE.approved && <input type="checkbox" checked={Boolean(picked[t.id])} onChange={(e) => setPicked({ ...picked, [t.id]: e.target.checked })} aria-label={`Select ${t.staffName}`} />}</td>}
                <td className="px-3 py-2 font-semibold text-slate-100">{t.staffName}</td>
                <td className="px-3 py-2 text-slate-200">{t.payrollNo || <span className="text-amber-200">missing</span>}</td>
                <td className="px-3 py-2 text-slate-200">{t.kind === "no-change" ? "As normal" : <><span>{CODES.filter((c) => t.totals?.[c.code]).map((c) => `${c.code} ${t.totals[c.code]}h`).join(" · ")}</span><span className="block text-xs text-slate-400">{describeLines(t.lines)}</span></>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-200">{mileage[t.uid] ? `£${(mileage[t.uid] / 100).toFixed(2)}` : ""}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.chip[t.state]}`}>{SHORT_STATE[t.state]}</span>{t.payroll?.reference && t.state === STATE.sent ? <span className="block text-xs text-slate-400">ref {t.payroll.reference}</span> : null}</td>
                <td className="px-3 py-2 text-right">{canSend && t.state === STATE.approved && (returning === t.id
                  ? <DeclineBox s={s} reason={reason} setReason={setReason} busy={busy === t.id} onConfirm={() => giveBack(t)} onCancel={() => setReturning("")} />
                  : <button type="button" className={s.btn} onClick={() => { setReturning(t.id); setReason(""); }}>Return…</button>)}
                  <History s={s} sheet={t} role="payroll" period={period} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {canSend && <><label className={s.label}>Reference for payroll (optional)<input className={s.field} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. the batch or email reference" /></label>
          <button type="button" className={s.primary} disabled={!chosen.length || Boolean(busy)} onClick={send}>{busy === "send" ? "Saving…" : `Mark ${chosen.length || ""} as sent to payroll`}</button>
          <button type="button" className={s.btn} onClick={() => setPicked(Object.fromEntries(toSend.map((t) => [t.id, true])))} disabled={!toSend.length}>Select all</button></>}
        <button type="button" className={`${s.btn} ml-auto`} onClick={download} disabled={!list.length}>Download CSV</button>
      </div>
      <p className={`text-xs ${s.muted}`}>Mileage is the approved claims for journeys in this period. Returning a timesheet sends it back to the person with your reason; they correct it and it goes back through their line manager.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
export function PeriodsPanel({ skin = "desktop" }) {
  const s = SKINS[skin];
  const periods = usePeriods();
  const staff = useTimesheetStaff(true);
  const sheets = useSheets("all");
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (periods.list === null || !staff.ready || sheets.list === null) return <p className={`text-sm ${s.muted}`}>Opening…</p>;
  const active = staff.staff.filter((p) => p.active !== false);
  const problem = form ? periodProblem(form, periods.list) : "";
  async function save() { setBusy(true); setError(""); try { await savePeriod(form); setForm(null); setMessage("Pay period saved."); } catch (failure) { setError(failure?.message || "That didn't save."); } finally { setBusy(false); } }
  return (
    <div className="space-y-3">
      {message && <p className={s.ok} role="status">{message}</p>}
      {form ? (
        <div className={`${s.card} space-y-2`}>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className={s.label}>Name<input className={s.field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className={s.label}>First day<input type="date" className={s.field} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
            <label className={s.label}>Last day<input type="date" className={s.field} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
            <label className={s.label}>Timesheets due<input type="date" className={s.field} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></label>
          </div>
          {(problem || error) && <p className={`text-sm ${error ? s.bad : s.muted}`}>{error || problem}</p>}
          <div className="flex gap-2"><button type="button" className={s.primary} disabled={busy || Boolean(problem)} onClick={save}>Save pay period</button><button type="button" className={s.btn} onClick={() => setForm(null)}>Cancel</button></div>
        </div>
      ) : <div><button type="button" className={s.primary} onClick={() => { setForm(suggestPeriod(periods.list)); setMessage(""); }}>Add the next pay period</button></div>}
      {periods.list.map((p) => {
        const mine = sheets.list.filter((t) => t.periodId === p.id);
        const by = (state) => mine.filter((t) => t.state === state).length;
        const sentBy = new Set(mine.filter((t) => !needsStaff(t.state)).map((t) => t.staffId));
        const outstanding = active.filter((person) => !sentBy.has(person.id));
        const status = dueStatus(p, STATE.draft, today());
        return (
          <section key={p.id} className={s.card}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className={`font-semibold ${s.strong}`}>{p.name}</p><p className={`text-sm ${s.muted}`}>{periodLabel(p)} · due {uk(p.due)}{status === "overdue" ? " (past due)" : ""}</p></div>
              <p className={`text-sm ${s.body}`}>{by("submitted")} with managers · {by("approved")} signed off · {by("sent")} sent to payroll{by("declined") + by("returned") ? ` · ${by("declined") + by("returned")} sent back` : ""}</p></div>
            {outstanding.length > 0 ? <details className="mt-2 text-sm"><summary className={`cursor-pointer font-semibold ${s.strong}`}>{outstanding.length} of {active.length} haven't sent theirs yet</summary><p className={`mt-1 ${s.body}`}>{outstanding.map((o) => o.name).join(", ")}</p></details> : <p className={`mt-2 text-sm ${s.body}`}>Everyone has sent theirs.</p>}
          </section>
        );
      })}
    </div>
  );
}
