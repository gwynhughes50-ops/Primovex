import { useMemo, useRef, useState } from "react";
import { ExternalLink, FileText, Trash2, Upload, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { openDocument } from "@/lib/openDocument";
import { parseConsignment } from "@/modules/waste/consignmentParse";
import { readPdfText } from "@/modules/waste/pdfText";
import { LONG_GAP_DAYS, duplicateOf, monthly, newestFirst, stats, summaryOf } from "@/modules/waste/waste";
import { addConsignment, formProblem, pdfProblem, setVoided, updateConsignment, useWasteNotes } from "@/modules/waste/wasteService";

// Clinical waste (Operations > Clinical waste): the Stericycle consignment notes the practice is emailed after each collection.
// Drop the PDF in; Primovex reads it on this computer (the PDF is not sent anywhere to be read), shows what it found for checking,
// and keeps the note and its PDF on record for audit and for inspection visits.

const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-400";
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40";
const PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";
const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const monthName = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const emptyLine = () => ({ wasteCode: "", ewc: "", description: "", kg: "", component: "", concentration: "", form: "", hazard: "", bags: 0, sharpsBoxes: 0, sealedUnits: 0, wheeledCarts: 0 });
const formOf = (source) => ({
  consignmentCode: source.consignmentCode || "", documentRef: source.documentRef || "", customerSite: source.customerSite || "", premisesCode: source.premisesCode || "",
  collectionDate: source.collectionDate || "", collectionTime: source.collectionTime || "", producer: source.producer || "", carrier: source.carrier || "", destination: source.destination || "",
  lines: (source.lines || []).map((l) => ({ ...l, kg: l.kg ?? "" })), notes: source.notes || "",
});

function Tile({ label, value, sub, tone }) {
  return <div className={`rounded-xl border border-white/10 p-3 ${tone || "bg-slate-900/60"}`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-50">{value}</p>{sub && <p className="text-xs text-slate-400">{sub}</p>}</div>;
}

// Check (and correct) what was read from a note, then keep it. `existing` = the notes already on record, to catch a note added twice.
function ReviewCard({ title, initial, fileName, warnings = [], existing = [], editingId = "", onSave, onCancel }) {
  const [form, setForm] = useState(() => formOf(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const setLine = (index, patch) => setForm((current) => ({ ...current, lines: current.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)) }));
  const duplicate = !editingId ? duplicateOf(existing, form.consignmentCode) : null;
  const total = form.lines.reduce((sum, l) => sum + (Number(l.kg) || 0), 0);
  const problem = formProblem(form);
  async function save() {
    setBusy(true); setError("");
    try { await onSave(form); } catch (failure) { setError(failure?.message || "That didn't save. Check you have permission."); setBusy(false); }
  }
  return (
    <section className="rounded-2xl border border-teal-300/30 bg-slate-900/80 p-4 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="flex items-center gap-2 text-base font-semibold text-slate-100"><FileText className="h-4 w-4 text-teal-300" aria-hidden="true" /> {title}</h3>{fileName && <p className="text-xs text-slate-400">{fileName}</p>}</div>
        <button type="button" onClick={onCancel} className="rounded-full p-2 text-slate-400 hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      {warnings.length > 0 && <ul className="mt-2 list-disc space-y-0.5 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 pl-7 text-sm text-amber-100">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {duplicate && <p className="mt-2 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-100" role="alert">This note is already on record (collected {uk(duplicate.collectionDate)}). It has not been added again.</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className={LABEL}>Consignment note code<input className={FIELD} value={form.consignmentCode} disabled={Boolean(editingId)} onChange={(e) => set({ consignmentCode: e.target.value })} /></label>
        <label className={LABEL}>Collected on<input type="date" className={FIELD} value={form.collectionDate} onChange={(e) => set({ collectionDate: e.target.value })} /></label>
        <label className={LABEL}>Time<input type="time" className={FIELD} value={form.collectionTime} onChange={(e) => set({ collectionTime: e.target.value })} /></label>
        <label className={LABEL}>Document reference<input className={FIELD} value={form.documentRef} onChange={(e) => set({ documentRef: e.target.value })} /></label>
        <label className={LABEL}>Customer site number<input className={FIELD} value={form.customerSite} onChange={(e) => set({ customerSite: e.target.value })} /></label>
        <label className={LABEL}>Premises code<input className={FIELD} value={form.premisesCode} onChange={(e) => set({ premisesCode: e.target.value })} /></label>
      </div>
      <p className="mt-2 text-sm text-slate-300">{[form.producer && `From ${form.producer}`, form.carrier && `collected by ${form.carrier}`].filter(Boolean).join(", ")}</p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-2 py-2">Waste</th><th className="px-2 py-2">Code</th><th className="px-2 py-2">kg</th><th className="px-2 py-2">Bags</th><th className="px-2 py-2">Sharps boxes</th><th className="px-2 py-2">Sealed units</th><th className="px-2 py-2">Carts</th><th className="px-2 py-2" /></tr></thead>
          <tbody>
            {form.lines.map((l, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="px-2 py-1"><input className="w-56 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-100" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label="Description of the waste" /></td>
                <td className="px-2 py-1"><input className="w-28 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-100" value={l.ewc} onChange={(e) => setLine(i, { ewc: e.target.value })} aria-label="EWC code" /></td>
                <td className="px-2 py-1"><input type="number" step="0.001" min="0" className="w-24 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-100" value={l.kg} onChange={(e) => setLine(i, { kg: e.target.value })} aria-label="Weight in kg" /></td>
                {["bags", "sharpsBoxes", "sealedUnits", "wheeledCarts"].map((k) => <td key={k} className="px-2 py-1"><input type="number" min="0" className="w-16 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-100" value={l[k]} onChange={(e) => setLine(i, { [k]: e.target.value })} aria-label={k} /></td>)}
                <td className="px-2 py-1"><button type="button" className="text-xs text-slate-400 underline hover:text-rose-300" onClick={() => set({ lines: form.lines.filter((_, j) => j !== i) })}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
        <button type="button" className={BTN} onClick={() => set({ lines: [...form.lines, emptyLine()] })}>Add a waste line</button>
        <span>Total <b className="text-slate-100">{Math.round(total * 1000) / 1000} kg</b></span>
      </div>
      <label className={`${LABEL} mt-3`}>Notes (optional)<input className={FIELD} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything worth knowing about this collection" /></label>
      {error && <p className="mt-2 text-sm text-rose-300" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {problem && !duplicate && <span className="mr-auto text-sm text-amber-200">{problem}</span>}
        <button type="button" className={BTN} onClick={onCancel}>Cancel</button>
        <button type="button" className={PRIMARY} disabled={busy || Boolean(problem) || Boolean(duplicate)} onClick={save}>{busy ? "Saving…" : editingId ? "Save changes" : "Keep this note"}</button>
      </div>
    </section>
  );
}

export default function WasteNotes() {
  const { user, displayName, can } = useAuth();
  const actor = { displayName: displayName || user?.email || "", email: user?.email || "" };
  const canManage = can("waste.manage");
  const { list, error } = useWasteNotes(true);
  const [queue, setQueue] = useState([]); // [{ key, fileName, file, state: "reading" | "ready" | "failed", parsed, problem }]
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const picker = useRef(null);
  const now = useMemo(() => new Date(), []);
  const all = useMemo(() => list || [], [list]);
  const shown = useMemo(() => newestFirst(all), [all]);
  const figures = useMemo(() => stats(all, now), [all, now]);
  const months = useMemo(() => monthly(all), [all]);

  function addFiles(files) {
    setMessage(""); setProblem("");
    for (const file of Array.from(files || [])) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`;
      const bad = pdfProblem(file);
      if (bad) { setQueue((q) => [...q, { key, fileName: file.name, state: "failed", problem: bad }]); continue; }
      setQueue((q) => [...q, { key, fileName: file.name, file, state: "reading" }]);
      readPdfText(file)
        .then((pages) => setQueue((q) => q.map((item) => (item.key === key ? { ...item, state: "ready", parsed: parseConsignment(pages, { fileName: file.name }) } : item))))
        .catch(() => setQueue((q) => q.map((item) => (item.key === key ? { ...item, state: "ready", parsed: parseConsignment([[]], { fileName: file.name }) } : item))));
    }
  }
  const drop = (event) => { event.preventDefault(); setDragging(false); if (canManage) addFiles(event.dataTransfer?.files); };
  const dropQueue = (key) => setQueue((q) => q.filter((item) => item.key !== key));

  async function keep(item, form) {
    await addConsignment(form, item.file, actor);
    dropQueue(item.key);
    setMessage(`Kept: the note collected on ${uk(form.collectionDate)} (${form.consignmentCode.toUpperCase()}).`);
  }
  async function open(note) {
    const failed = await openDocument({ url: note.fileUrl, path: note.filePath, fileName: note.fileName || "consignment-note.pdf" });
    if (failed) setProblem(failed);
  }
  async function mistake(note, voided) {
    setProblem(""); setConfirmId("");
    try { await setVoided(note.id, voided, "Entered in error", actor); } catch (failure) { setProblem(failure?.message || "That didn't save."); }
  }

  if (list === null) return <p className="text-sm text-slate-400">Opening the clinical waste records…</p>;

  const last = figures.last;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><Trash2 className="h-6 w-6 text-teal-300" aria-hidden="true" /> Clinical waste</h1>
        <p className="max-w-3xl text-sm text-slate-400">The consignment note Stericycle emails after each collection, kept on record: when waste was collected, what and how much, with the note itself to show an inspector.{canManage ? " Drop the PDF below." : ""}</p>
      </div>
      {error && <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100" role="alert">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-4">
        <Tile label="Last collection" value={last ? uk(last.collectionDate) : "None yet"} sub={last ? `${figures.daysSinceLast} day${figures.daysSinceLast === 1 ? "" : "s"} ago` : ""} tone={figures.daysSinceLast > LONG_GAP_DAYS ? "bg-amber-400/10" : "bg-emerald-500/10"} />
        <Tile label="Collections, last 12 months" value={figures.collectionsLastYear} />
        <Tile label="Waste, last 12 months" value={`${figures.kgLastYear} kg`} />
        <Tile label="Longest gap, last 12 months" value={figures.collectionsLastYear > 1 ? `${figures.longestGap} days` : "n/a"} />
      </div>

      {canManage && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}
          className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center ${dragging ? "border-teal-300 bg-teal-500/10" : "border-white/15 bg-slate-900/40"}`}
        >
          <Upload className="h-6 w-6 text-teal-300" aria-hidden="true" />
          <p className="font-semibold text-slate-100">Drop the Stericycle consignment note (PDF) here</p>
          <p className="text-sm text-slate-400">It is read on this computer. You check what it found before it is kept. More than one at a time is fine.</p>
          <button type="button" className={BTN} onClick={() => picker.current?.click()}>Or choose PDF files</button>
          <input ref={picker} type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
      )}
      {message && <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100" role="status">{message}</p>}
      {problem && <p className="text-sm text-rose-300" role="alert">{problem}</p>}

      {queue.map((item) => item.state === "reading" ? <p key={item.key} className="text-sm text-slate-300">Reading {item.fileName}…</p>
        : item.state === "failed" ? <p key={item.key} className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100" role="alert">{item.fileName}: {item.problem} <button type="button" className="ml-2 underline" onClick={() => dropQueue(item.key)}>Dismiss</button></p>
          : <ReviewCard key={item.key} title="Check this note" initial={item.parsed} fileName={item.fileName} warnings={item.parsed.warnings} existing={all} onSave={(form) => keep(item, form)} onCancel={() => dropQueue(item.key)} />)}
      {editing && <ReviewCard title="Correct this note" initial={editing} fileName={editing.fileName} editingId={editing.id} onSave={async (form) => { await updateConsignment(editing.id, form, actor); setEditing(null); setMessage("Changes saved."); }} onCancel={() => setEditing(null)} />}

      {!shown.length ? <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">No consignment notes are on record yet.{canManage ? " Drop the first one above." : ""}</p> : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Collected</th><th className="px-3 py-2">Consignment note</th><th className="px-3 py-2">Waste</th><th className="px-3 py-2">Total</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className={`border-t border-white/5 ${c.voided ? "opacity-50" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-100">{uk(c.collectionDate)}{c.collectionTime ? <span className="ml-1 font-normal text-slate-400">{c.collectionTime}</span> : null}</td>
                  <td className="px-3 py-2 text-slate-200">{c.consignmentCode}{c.voided && <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-200">Entered in error</span>}</td>
                  <td className="px-3 py-2 text-slate-300">{summaryOf(c)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-100">{c.totalKg} kg</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {c.fileUrl && <button type="button" className={BTN} onClick={() => open(c)}><ExternalLink className="h-4 w-4" aria-hidden="true" /> Open PDF</button>}
                    {canManage && !c.voided && <button type="button" className={`${BTN} ml-1`} onClick={() => { setEditing(c); setMessage(""); }}>Correct</button>}
                    {canManage && (confirmId === c.id
                      ? <><span className="ml-2 text-xs text-slate-300">Mark as entered in error?</span> <button type="button" className={`${BTN} ml-1`} onClick={() => mistake(c, !c.voided)}>Yes</button> <button type="button" className={BTN} onClick={() => setConfirmId("")}>No</button></>
                      : <button type="button" className="ml-2 text-xs font-semibold text-slate-400 underline hover:text-rose-300" onClick={() => (c.voided ? mistake(c, false) : setConfirmId(c.id))}>{c.voided ? "Restore" : "Entered in error"}</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {months.length > 0 && (
        <details className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-sm text-slate-200">
          <summary className="cursor-pointer font-semibold">Month by month</summary>
          <table className="mt-2 min-w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-2 py-1">Month</th><th className="px-2 py-1">Collections</th><th className="px-2 py-1">kg</th><th className="px-2 py-1">Bags</th><th className="px-2 py-1">Sharps boxes</th></tr></thead>
            <tbody>{months.map((m) => <tr key={m.month} className="border-t border-white/5"><td className="px-2 py-1">{monthName(m.month)}</td><td className="px-2 py-1">{m.collections}</td><td className="px-2 py-1">{m.kg}</td><td className="px-2 py-1">{m.bags}</td><td className="px-2 py-1">{m.sharpsBoxes}</td></tr>)}</tbody>
          </table>
        </details>
      )}
    </div>
  );
}
