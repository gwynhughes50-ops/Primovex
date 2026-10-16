import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, FileText, TriangleAlert, X } from "lucide-react";
import { openDocument } from "@/lib/openDocument";
import { compareReturn } from "./waste";
import { quarterLabel, returnId } from "./returnParse";
import { addReturn, returnProblem, siteKey } from "./wasteService";

// Stericycle's quarterly producer return, kept in its own place, and the check that every consignment on it is saved on the Collections
// tab. Whoever keeps the notes drops the return in; it is checked at once and rechecked as notes are added, so it turns green when
// nothing is missing.

const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-400";
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40";
const PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";
const uk = (key) => (key ? key.split("-").reverse().join("/") : "");

// the result of a check, in words
function Verdict({ check }) {
  if (check.complete) return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-bold text-emerald-100"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> All {check.total} consignments are saved</span>;
  const parts = [check.missing.length ? `${check.missing.length} not saved` : "", check.problems ? `${check.problems} to check` : ""].filter(Boolean).join(", ");
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/25 px-3 py-1 text-sm font-bold text-amber-100"><TriangleAlert className="h-4 w-4" aria-hidden="true" /> {check.matched.length} of {check.total} saved: {parts}</span>;
}

// the details of a check: what is missing, what differs, what is saved but not on the return
function CheckDetails({ check }) {
  return (
    <div className="mt-3 space-y-3 text-sm">
      {check.missing.length > 0 && (
        <div><p className="font-semibold text-amber-100">On Stericycle's return but not saved here (ask for the consignment note and add it)</p>
          <ul className="mt-1 list-disc pl-5 text-slate-200">{check.missing.map((m) => <li key={m.code}>{m.code} · collected {uk(m.date)} · {m.kg} kg</li>)}</ul></div>
      )}
      {check.matched.filter((m) => !m.dateOk || !m.weightOk).length > 0 && (
        <div><p className="font-semibold text-amber-100">Saved, but the return says something different</p>
          <ul className="mt-1 list-disc pl-5 text-slate-200">{check.matched.filter((m) => !m.dateOk || !m.weightOk).map((m) => <li key={m.code}>{m.code}{!m.dateOk ? `: collected ${uk(m.note.collectionDate)} here, ${uk(m.returnDate)} on the return` : ""}{!m.weightOk ? `${!m.dateOk ? "; " : ": "}${m.noteKg} kg here, ${m.returnKg} kg on the return` : ""}</li>)}</ul></div>
      )}
      {check.extra.length > 0 && (
        <div><p className="font-semibold text-slate-100">Saved for this site in the quarter but not on the return</p>
          <ul className="mt-1 list-disc pl-5 text-slate-300">{check.extra.map((e) => <li key={e.note.id}>{e.note.consignmentCode} · collected {uk(e.note.collectionDate)}{e.nearEdge ? " (so near the end of the quarter that it is probably on the next return)" : ""}</li>)}</ul></div>
      )}
      <p className="text-xs text-slate-500">{check.matched.length} matched: {check.matched.filter((m) => m.dateOk && m.weightOk).length} agree on date and weight.</p>
    </div>
  );
}

// a return that has just been dropped in: check it, choose the site, keep it
function ReviewReturn({ item, notes, sites, bySiteNumber, existing, actor, onDone, onCancel }) {
  const { parsed, file } = item;
  const mapped = bySiteNumber[siteKey(parsed.customerSite)] || (sites.length === 1 ? sites[0].id : "");
  const [siteId, setSiteId] = useState(mapped);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const siteName = sites.find((x) => x.id === siteId)?.name || "";
  const check = useMemo(() => compareReturn({ rows: parsed.rows, notes, customerSite: parsed.customerSite, siteId, year: parsed.year, quarter: parsed.quarter }), [parsed, notes, siteId]);
  const problem = returnProblem(parsed, siteId);
  const replaces = existing.find((r) => r.id === returnId(parsed.customerSite, parsed.year, parsed.quarter));
  async function save() {
    setBusy(true); setError("");
    try { await addReturn(parsed, { siteId, siteName }, file, actor); onDone(`Kept: the ${quarterLabel(parsed.year, parsed.quarter)} return for ${siteName}.`); } catch (failure) { setError(failure?.message || "That didn't save. Check you have permission."); setBusy(false); }
  }
  return (
    <section className="rounded-2xl border border-teal-300/30 bg-slate-900/80 p-4 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="flex items-center gap-2 text-base font-semibold text-slate-100"><FileText className="h-4 w-4 text-teal-300" aria-hidden="true" /> Quarterly return: {parsed.year && parsed.quarter ? quarterLabel(parsed.year, parsed.quarter) : "quarter not read"}</h3><p className="text-xs text-slate-400">{item.fileName}</p></div>
        <button type="button" onClick={onCancel} className="rounded-full p-2 text-slate-400 hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      {parsed.warnings.length > 0 && <ul className="mt-2 list-disc space-y-0.5 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 pl-7 text-sm text-amber-100">{parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      <p className="mt-2 text-sm text-slate-300">{[parsed.producer, parsed.address, parsed.customerSite && `customer site number ${parsed.customerSite}`, parsed.premisesCode && `premises ${parsed.premisesCode}`].filter(Boolean).join(" · ")}</p>
      <p className="text-sm text-slate-300">{parsed.rows.length} consignments, {parsed.totalKg} kg{parsed.reportDate ? `, report dated ${uk(parsed.reportDate)}` : ""}.</p>
      <label className={`${LABEL} mt-3 max-w-sm`}>Which site is this return for?
        <select className={FIELD} value={siteId} onChange={(e) => setSiteId(e.target.value)}><option value="">Choose a site</option>{sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      </label>
      {replaces && <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-sm text-amber-100">A return for this site and quarter is already saved. Keeping this one replaces it.</p>}
      <div className="mt-3"><Verdict check={check} /><CheckDetails check={check} /></div>
      {error && <p className="mt-2 text-sm text-rose-300" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {problem && <span className="mr-auto text-sm text-amber-200">{problem}</span>}
        <button type="button" className={BTN} onClick={onCancel}>Cancel</button>
        <button type="button" className={PRIMARY} disabled={busy || Boolean(problem)} onClick={save}>{busy ? "Saving…" : "Keep this return"}</button>
      </div>
    </section>
  );
}

export default function WasteReturns({ returns, notes, sites, bySiteNumber, queue, canManage, actor, onQueueDone, onQueueCancel, onMessage }) {
  const [openId, setOpenId] = useState("");
  const [openError, setOpenError] = useState({ id: "", text: "" });
  async function open(r) {
    setOpenError({ id: "", text: "" });
    const failed = await openDocument({ url: r.fileUrl, path: r.filePath, fileName: r.fileName || "producer-return.pdf" });
    if (failed) setOpenError({ id: r.id, text: failed });
  }
  const list = returns.list || [];
  const checks = useMemo(() => new Map(list.map((r) => [r.id, compareReturn({ rows: r.rows || [], notes, customerSite: r.customerSite, siteId: r.siteId, year: r.year, quarter: r.quarter })])), [list, notes]);
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-slate-400">Stericycle sends a return each quarter for each site, listing every consignment they received. Keep it here and Primovex checks that you have saved a note for each one. {canManage ? "Drop the return PDF anywhere on this page." : ""}</p>
      {returns.error && <p className="text-sm text-amber-200">{returns.error}</p>}
      {queue.map((item) => item.state === "reading" ? <p key={item.key} className="text-sm text-slate-300">Reading {item.fileName}…</p>
        : <ReviewReturn key={item.key} item={item} notes={notes} sites={sites} bySiteNumber={bySiteNumber} existing={list} actor={actor} onDone={(m) => { onQueueDone(item.key); onMessage(m); }} onCancel={() => onQueueCancel(item.key)} />)}
      {!list.length && !queue.length && <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">No quarterly returns are saved yet.{canManage ? " Drop the first one on this page." : ""}</p>}
      {list.map((r) => {
        const check = checks.get(r.id);
        return (
          <section key={r.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-semibold text-slate-100">{quarterLabel(r.year, r.quarter)} · {r.siteName || r.producer}</p><p className="text-xs text-slate-400">{r.producer}{r.customerSite ? ` · customer site number ${r.customerSite}` : ""} · {r.rows?.length || 0} consignments, {r.totalKg} kg{r.reportDate ? ` · report dated ${uk(r.reportDate)}` : ""}</p></div>
              <div className="flex flex-wrap items-center gap-2"><Verdict check={check} />
                {r.fileUrl && <button type="button" className={BTN} onClick={() => open(r)}><ExternalLink className="h-4 w-4" aria-hidden="true" /> Open PDF</button>}
                <button type="button" className={BTN} onClick={() => setOpenId(openId === r.id ? "" : r.id)}>{openId === r.id ? "Hide the check" : "Show the check"}</button></div>
            </div>
            {openError.id === r.id && <p className="mt-1 text-xs text-rose-300" role="alert">{openError.text}</p>}
            {openId === r.id && <CheckDetails check={check} />}
          </section>
        );
      })}
    </div>
  );
}
