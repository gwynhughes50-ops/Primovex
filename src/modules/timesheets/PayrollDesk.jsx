import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useClaims, usePlaces } from "@/modules/mileage/mileageService";
import { periodTotals } from "@/modules/mileage/mileage";
import { CODES, STATE, STATE_LABEL, declarationText } from "./timesheet";
import { DESK_STATUS, QUERY_STATUS, deskCsv, deskOptions, deskRows, deskSummary, filterDesk, stampText } from "./timesheetPayroll";
import { SKINS } from "./timesheetSkins";
import { dispatchTimesheet, useHistory, usePeriods, useSheets } from "./timesheetFlowService";
import { auditHtml, historySteps, stateWords } from "./timesheetAudit";
import { printHtmlDocument } from "@/lib/printHtmlDocument";
import { QueryThread, RaiseQuery } from "./QueryThread";
import { useQueries } from "./timesheetQueryService";

// The payroll desk (Timesheet > Payroll, desktop): every signed-off timesheet with the line manager's stamp, what the person declared, what was
// claimed and their mileage; searched by person or payroll number and grouped by team or line manager; each one opens to show its detail, its
// printable audit history and any queries raised with the person or their line manager. Sending on and returning work as they always have.

const s = SKINS.desktop;
const SHORT = { approved: "To send", sent: "Sent to payroll", returned: "Returned" };
const money = (pence) => (pence ? `£${(pence / 100).toFixed(2)}` : "");
const uk = (key) => (key ? key.split("-").reverse().join("/") : "");

function Detail({ row, period, canSend, onClose, onReturn, busy }) {
  const { user, displayName } = useAuth();
  const t = row.sheet;
  const history = useHistory(t, "payroll", true);
  const steps = useMemo(() => historySteps(history.list || []), [history.list]);
  const [asking, setAsking] = useState(false);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const print = () => printHtmlDocument(auditHtml({ sheet: t, period, steps, stateLabel: stateWords(t.state), printedBy: displayName || user?.email || "" }));
  return (
    <div className="space-y-3 border-t border-white/10 bg-slate-950/40 p-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className={s.note}>
          <p className={`font-semibold ${s.strong}`}>Line manager's sign-off</p>
          <p>{row.signedOffBy ? `${row.signedOffBy}` : "Not recorded"}{row.signedOffAt ? ` · ${stampText(row.signedOffAt)}` : ""}</p>
          <p className={`mt-2 font-semibold ${s.strong}`}>Declared by the person</p>
          <p>{row.declaredBy || row.name}{row.declaredAt ? ` · ${stampText(row.declaredAt)}` : ""}</p>
          {t.declaration?.text && <p className={`mt-1 text-xs ${s.muted}`}>“{t.declaration.text}”</p>}
          {!t.declaration?.text && <p className={`mt-1 text-xs ${s.muted}`}>{declarationText(t.kind, period || { from: t.from, to: t.to })}</p>}
          {row.submissions > 1 && <p className={`mt-1 text-xs ${s.muted}`}>Sent {row.submissions} times (declined or returned before).</p>}
        </div>
        <div className={`${s.note} lg:col-span-2`}>
          <p className={`font-semibold ${s.strong}`}>{row.kind === "no-change" ? "No changes: the hours were as normal" : "What was claimed"}</p>
          {row.lines.length > 0 && (
            <table className="mt-1 w-full text-sm"><tbody>{row.lines.map((l, i) => (
              <tr key={i} className="border-t border-white/5"><td className="py-1 pr-3 whitespace-nowrap">{uk(l.date)}</td><td className="pr-3">{CODES.find((c) => c.code === l.code)?.label || l.code}</td><td className="pr-3 text-right">{l.hours}h</td><td className={s.muted}>{l.comment}</td></tr>
            ))}</tbody></table>
          )}
          <p className={`mt-2 text-xs ${s.muted}`}>{CODES.filter((c) => row.totals[c.code]).map((c) => `${c.label} ${row.totals[c.code]}h`).join(" · ") || "No hours to add or take off."}{row.mileagePence ? ` · Mileage ${money(row.mileagePence)}` : ""}</p>
          {t.payroll?.reference && t.state === STATE.sent && <p className={`mt-1 text-xs ${s.muted}`}>Sent by {t.payroll.by}, reference {t.payroll.reference}.</p>}
          {t.payroll?.reason && t.state === STATE.returned && <p className={`mt-1 text-xs ${s.muted}`}>Returned by {t.payroll.by}: “{t.payroll.reason}”.</p>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={`font-semibold ${s.strong}`}>Queries{row.queries.length ? ` (${row.openQueries} open of ${row.queries.length})` : ""}</p>
          {!asking && <button type="button" className={s.btn} onClick={() => setAsking(true)}>Raise a query</button>}
        </div>
        {asking && <RaiseQuery sheet={t} onDone={() => setAsking(false)} />}
        {asking && <button type="button" className={`text-sm underline ${s.muted}`} onClick={() => setAsking(false)}>Cancel</button>}
        {row.queries.length === 0 && !asking && <p className={`text-sm ${s.muted}`}>No queries on this timesheet.</p>}
        {row.queries.map((q) => <QueryThread key={q.id} query={q} open={q.status !== QUERY_STATUS.resolved} />)}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <p className={`font-semibold ${s.strong}`}>History</p>
          {steps.length > 0 && <button type="button" className={s.btn} onClick={print}>Print the audit</button>}
          {canSend && t.state === STATE.approved && !returning && <button type="button" className={s.btn} onClick={() => setReturning(true)}>Return to the person…</button>}
          <button type="button" className={`ml-auto text-sm underline ${s.muted}`} onClick={onClose}>Close</button>
        </div>
        {returning && (
          <div className={`${s.note} mt-2 space-y-2`}>
            <label className={s.label}>Why is it being returned? (the person is told)<textarea className={s.field} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <div className="flex gap-2"><button type="button" className={s.primary} disabled={busy || reason.trim().length < 3} onClick={() => onReturn(t, reason).then(() => setReturning(false))}>Return it</button><button type="button" className={s.btn} onClick={() => setReturning(false)}>Cancel</button></div>
          </div>
        )}
        {history.list === null ? <p className={`mt-1 text-sm ${s.muted}`}>Opening…</p> : !steps.length ? <p className={`mt-1 text-sm ${s.muted}`}>{history.error || "Nothing is recorded yet."}</p> : (
          <ol className="mt-2 space-y-1.5 text-sm">
            {steps.map((h) => (
              <li key={h.id} className={s.body}>
                <b className={s.strong}>{h.action.charAt(0).toUpperCase() + h.action.slice(1)}</b>{h.who ? ` by ${h.who}` : ""} <span className={s.muted}>· {new Date(h.atMs).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                {h.query && h.query.text && <span className="block pl-3">“{h.query.text}”</span>}
                {h.reason && <span className="block pl-3">Reason: “{h.reason}”</span>}
                {h.reference && <span className="block pl-3">Reference: {h.reference}</span>}
                {h.changes.map((c, i) => <span key={i} className="block pl-3">{c.type === "added" ? "Added" : c.type === "removed" ? "Removed" : "Changed"}: {c.text}</span>)}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export default function PayrollDesk({ canSend }) {
  const { user, displayName } = useAuth();
  const actor = { displayName: displayName || user?.email || "" };
  const periods = usePeriods();
  const sheets = useSheets("payroll");
  const queries = useQueries("payroll", true);
  const claims = useClaims({ scope: "all" });
  const places = usePlaces(true);
  const [periodId, setPeriodId] = useState("");
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [manager, setManager] = useState("");
  const [status, setStatus] = useState("all");
  const [withQueries, setWithQueries] = useState(false);
  const [openId, setOpenId] = useState("");
  const [picked, setPicked] = useState({});
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const period = (periods.list || []).find((p) => p.id === periodId) || (periods.list || []).find((p) => (sheets.list || []).some((t) => t.periodId === p.id)) || (periods.list || [])[0] || null;
  const mileageByUid = useMemo(() => (period ? Object.fromEntries(periodTotals(claims.list || [], period.from, period.to, places.rates).map((r) => [r.uid, r.pence])) : {}), [claims.list, period, places.rates]);
  const everyone = useMemo(() => deskRows(sheets.list || [], { periodId: period?.id || "", queries: queries.list || [], mileageByUid }), [sheets.list, period?.id, queries.list, mileageByUid]);
  const options = useMemo(() => deskOptions(everyone), [everyone]);
  const rows = useMemo(() => filterDesk(everyone, { search, team, manager, status, withQueries }), [everyone, search, team, manager, status, withQueries]);
  const sum = useMemo(() => deskSummary(everyone), [everyone]);
  const chosen = rows.filter((r) => r.state === STATE.approved && picked[r.id]);

  async function run(id, work, done) { setBusy(id); setError(""); setMessage(""); try { await work(); setMessage(done); } catch (failure) { setError(failure?.message || "That didn't save. Check you have permission."); } finally { setBusy(""); } }
  const send = () => run("send", async () => { for (const r of chosen) await dispatchTimesheet(r.sheet, STATE.sent, { reference, actor, uid: user.uid }); setPicked({}); }, `${chosen.length} marked as sent to payroll.`);
  const giveBack = (t, reason) => run(t.id, () => dispatchTimesheet(t, STATE.returned, { reason, actor, uid: user.uid }), `${t.staffName}'s timesheet was returned, with your reason.`);
  function download() {
    const url = URL.createObjectURL(new Blob([deskCsv(rows, period?.name)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url; link.download = `primovex-payroll-${period.from}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  if (periods.list === null || sheets.list === null) return <p className={`text-sm ${s.muted}`}>Opening…</p>;
  if (!period) return <p className={`text-sm ${s.muted}`}>No pay period has been set up yet.</p>;
  const field = "rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100";
  const filtered = search || team || manager || status !== "all" || withQueries;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className={s.label}>Pay period<select className={`${field} mt-1 block`} value={period.id} onChange={(e) => { setPeriodId(e.target.value); setPicked({}); setOpenId(""); }}>{periods.list.map((p) => <option key={p.id} value={p.id}>{p.name || `${uk(p.from)} to ${uk(p.to)}`}</option>)}</select></label>
        <label className={`${s.label} min-w-[14rem] flex-1`}>Search<input className={`${field} mt-1 block w-full`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, payroll number, team, manager…" /></label>
        <label className={s.label}>Team<select className={`${field} mt-1 block`} value={team} onChange={(e) => setTeam(e.target.value)}><option value="">All teams</option>{options.teams.map((o) => <option key={o.value} value={o.value}>{o.value} ({o.n})</option>)}</select></label>
        <label className={s.label}>Line manager<select className={`${field} mt-1 block`} value={manager} onChange={(e) => setManager(e.target.value)}><option value="">All managers</option>{options.managers.map((o) => <option key={o.value} value={o.value}>{o.value} ({o.n})</option>)}</select></label>
        <label className={s.label}>Show<select className={`${field} mt-1 block`} value={status} onChange={(e) => setStatus(e.target.value)}>{DESK_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-200"><input type="checkbox" checked={withQueries} onChange={(e) => setWithQueries(e.target.checked)} /> Open queries only</label>
        {filtered && <button type="button" className={`${s.btn} mb-0.5`} onClick={() => { setSearch(""); setTeam(""); setManager(""); setStatus("all"); setWithQueries(false); }}>Clear</button>}
      </div>

      {message && <p className={s.ok} role="status">{message}</p>}
      {error && <p className={`text-sm font-semibold ${s.bad}`} role="alert">{error}</p>}
      {sheets.error && <p className={s.warn}>{sheets.error}</p>}
      {queries.error && <p className={s.warn}>{queries.error}</p>}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[["Signed off", sum.people], ["To send to payroll", sum.toSend], ["Sent to payroll", sum.sent], ["Returned", sum.returned], ["Open queries", sum.openQueries]].map(([label, value]) => (
          <div key={label} className={s.card}><p className={`text-xs font-bold uppercase tracking-wide ${s.muted}`}>{label}</p><p className={`text-2xl font-black ${s.strong}`}>{value}</p></div>
        ))}
      </div>
      <p className={`text-sm ${s.muted}`}>Showing {rows.length} of {everyone.length} for this pay period. Overtime {sum.overtime}h, leave and sickness {sum.leave}h in total.</p>

      {!rows.length ? <p className={`text-sm ${s.muted}`}>{everyone.length ? "Nothing matches the search and filters." : "No signed-off timesheets for this period yet."}</p> : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>{canSend && <th className="px-2 py-2" />}<th className="px-3 py-2">Person</th><th className="px-3 py-2">Signed off by</th><th className="px-3 py-2">Hours</th><th className="px-3 py-2">Mileage</th><th className="px-3 py-2">Queries</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <FragmentRow key={r.id} row={r} canSend={canSend} picked={picked} setPicked={setPicked} open={openId === r.id} setOpen={(v) => setOpenId(v ? r.id : "")} period={period} giveBack={giveBack} busy={busy === r.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        {canSend && (
          <>
            <label className={s.label}>Reference for payroll (optional)<input className={`${field} mt-1 block`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. the batch or email reference" /></label>
            <button type="button" className={s.primary} disabled={!chosen.length || Boolean(busy)} onClick={send}>{busy === "send" ? "Saving…" : `Mark ${chosen.length || ""} as sent to payroll`}</button>
            <button type="button" className={s.btn} onClick={() => setPicked(Object.fromEntries(rows.filter((r) => r.state === STATE.approved).map((r) => [r.id, true])))} disabled={!rows.some((r) => r.state === STATE.approved)}>Select all shown</button>
          </>
        )}
        <button type="button" className={`${s.btn} ml-auto`} onClick={download} disabled={!rows.length}>Download CSV of these {rows.length}</button>
      </div>
      <p className={`text-xs ${s.muted}`}>Mileage is the approved claims for journeys in this period. A query does not stop a timesheet being sent on; use Return to send it back to the person. Everything on this page is recorded: open a row and choose Print the audit.</p>
    </div>
  );
}

function FragmentRow({ row, canSend, picked, setPicked, open, setOpen, period, giveBack, busy }) {
  const t = row.sheet;
  return (
    <>
      <tr className="border-t border-white/5 align-top">
        {canSend && <td className="px-2 py-2">{t.state === STATE.approved && <input type="checkbox" checked={Boolean(picked[t.id])} onChange={(e) => setPicked({ ...picked, [t.id]: e.target.checked })} aria-label={`Select ${row.name}`} />}</td>}
        <td className="px-3 py-2"><p className="font-semibold text-slate-100">{row.name}</p><p className="text-xs text-slate-400">{row.payrollNo ? `payroll no ${row.payrollNo}` : <span className="text-amber-200">payroll no missing</span>}{row.teams.length ? ` · ${row.teams.join(", ")}` : ""}</p></td>
        <td className="px-3 py-2 text-slate-200"><p>{row.signedOffBy || "—"}</p><p className="text-xs text-slate-400">{row.signedOffAt ? stampText(row.signedOffAt) : ""}</p></td>
        <td className="px-3 py-2 text-slate-200">{row.kind === "no-change" ? "As normal" : <span>{CODES.filter((c) => row.totals[c.code]).map((c) => `${c.code} ${row.totals[c.code]}h`).join(" · ")}</span>}</td>
        <td className="whitespace-nowrap px-3 py-2 text-slate-200">{money(row.mileagePence)}</td>
        <td className="px-3 py-2">{row.queries.length === 0 ? <span className="text-slate-500">—</span> : <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.openQueries ? s.chip.submitted : s.chip.sent}`}>{row.openQueries ? `${row.openQueries} open` : "All resolved"}</span>}</td>
        <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.chip[t.state]}`}>{SHORT[t.state] || STATE_LABEL[t.state]}</span>{t.payroll?.reference && t.state === STATE.sent ? <span className="block text-xs text-slate-400">ref {t.payroll.reference}</span> : null}</td>
        <td className="px-3 py-2 text-right"><button type="button" className={s.btn} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Close" : "Open"}</button></td>
      </tr>
      {open && <tr><td colSpan={canSend ? 8 : 7} className="p-0"><Detail row={row} period={period} canSend={canSend} onClose={() => setOpen(false)} onReturn={giveBack} busy={busy} /></td></tr>}
    </>
  );
}
