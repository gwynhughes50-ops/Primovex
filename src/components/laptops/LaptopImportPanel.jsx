import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { STATUS, dayKey, parseLaptopImport } from "@/modules/laptops/laptops";
import { addLaptops } from "@/modules/laptops/laptopService";

// "Add many at once": paste the laptop list from a spreadsheet (or choose a CSV), look at what it will make, then create it. Nothing is made until the list has been looked at. People are matched from
// the staff list, a date that has not happened yet is left blank and said so, and a BitLocker recovery key is never kept: that column is dropped and the panel says so.
const FIELD = "w-full rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--medtrak-text)]";

export default function LaptopImportPanel({ staff = [], existing = [], actor, onClose, onCreated }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const plan = useMemo(() => (text.trim() ? parseLaptopImport(text, { today: dayKey(), staff, existingCodes: existing.map((l) => l.assetCode) }) : null), [text, staff, existing]);
  const ready = plan ? plan.rows.filter((r) => !r.errors.length) : [];

  function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result || "")); setResult(null); };
    reader.readAsText(file);
    event.target.value = "";
  }
  async function create() {
    setBusy(true); setResult(null);
    try { const made = await addLaptops(ready.map((r) => r.laptop), actor); setResult({ made }); setText(""); onCreated?.(made); } catch (error) { setResult({ error: error?.message || "That could not be saved. Try again." }); } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3 text-[var(--medtrak-text)]" aria-label="Add laptops from a list">
      <div className="flex items-start justify-between gap-2"><p className="font-bold">Add laptops from a list</p><button type="button" className="text-xs font-semibold underline" onClick={onClose}>Close</button></div>
      <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Copy the rows from your spreadsheet, including the heading row, and paste them here, or choose a CSV file. You will see what it will do before anything is created.</p>
      <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><b>BitLocker codes are never kept in Primovex.</b> If your list has that column it is ignored.</span></p>
      <textarea className={`${FIELD} mt-2 h-28 font-mono text-xs`} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder="Laptop Name	CURRENT USER	UPDATED	CONDITION	..." aria-label="The laptop list" />
      <div className="mt-1"><button type="button" className="text-xs font-semibold underline" onClick={() => fileRef.current?.click()}>Or choose a CSV file</button><input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={readFile} className="hidden" aria-label="Choose a CSV file" /></div>

      {plan?.problem && <p className="mt-2 text-sm font-semibold text-rose-600">{plan.problem}</p>}
      {plan && !plan.problem && (
        <div className="mt-3">
          {plan.ignored.length > 0 && <p className="text-xs text-[var(--medtrak-muted)]">Columns not imported: {plan.ignored.map((c) => `${c.column} (${c.why})`).join("; ")}.</p>}
          <ul className="mt-2 max-h-72 divide-y divide-[var(--medtrak-border)] overflow-auto rounded-lg border border-[var(--medtrak-border)] text-sm">
            {plan.rows.map((row) => (
              <li key={row.line} className="px-2 py-1.5">
                <div className="flex items-center gap-2">
                  {row.errors.length ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />}
                  <span className="font-semibold">{row.assetCode || `Row ${row.line}`}</span>
                  <span className="text-xs text-[var(--medtrak-muted)]">{row.errors.length ? "Skipped" : `${STATUS[row.laptop.status]}${row.laptop.currentUser ? ` · ${row.laptop.currentUser.name}` : ""}`}</span>
                </div>
                {[...row.errors, ...row.warnings].map((w) => <p key={w} className="ml-6 text-xs text-[var(--medtrak-muted)]">{w}</p>)}
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy || !ready.length} onClick={create} className="mt-3 min-h-10 rounded-xl bg-[var(--medtrak-accent)] px-4 text-sm font-bold text-white disabled:opacity-40">{busy ? "Adding…" : `Add ${ready.length} laptop${ready.length === 1 ? "" : "s"}`}</button>
        </div>
      )}
      {result?.made ? <p className="mt-2 text-sm font-semibold text-emerald-600" role="status">{result.made} laptop{result.made === 1 ? "" : "s"} added.</p> : null}
      {result?.error ? <p className="mt-2 text-sm font-semibold text-rose-600" role="alert">{result.error}</p> : null}
    </section>
  );
}
