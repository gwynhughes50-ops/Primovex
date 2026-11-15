import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { readWorkbook } from "@/modules/training/readWorkbook";
import { SOFTWARE, parseComputersSheet } from "@/modules/computers/computers";
import { addComputers } from "@/modules/computers/computerService";

// "Add many at once": choose the practice's own spreadsheet (the PCs and printers sheet), look at what it will make, say which site each section is for, then create them. The file is read on this
// computer and is not uploaded anywhere. Nothing is made until the list has been looked at; a PC already in the register is skipped; each section is given a site from the practice's own list.
const FIELD = "rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--medtrak-text)] [&>option]:text-slate-900";

export default function ComputerImportPanel({ staff = [], sites = [], existing = [], actor, onClose, onCreated }) {
  const [sheets, setSheets] = useState(null); // [{ name, rows }]
  const [sheetName, setSheetName] = useState("");
  const [fileProblem, setFileProblem] = useState("");
  const [siteOf, setSiteOf] = useState({});    // section key -> site id
  const [left, setLeft] = useState({});        // PC number -> true when taken out of the import
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const existingNumbers = useMemo(() => existing.map((c) => c.assetNumber), [existing]);
  const parsed = useMemo(() => (sheets || []).map((sheet) => ({ sheet, plan: parseComputersSheet(sheet, { staff, existingNumbers }) })), [sheets, staff, existingNumbers]);
  const usable = parsed.filter((p) => !p.plan.problem);
  const chosen = usable.find((p) => p.sheet.name === sheetName) || usable[0] || null;
  const plan = chosen?.plan || null;
  const rows = plan ? plan.rows : [];
  const ready = rows.filter((r) => !r.errors.length && !left[r.assetNumber]);
  const groupsNeeded = plan ? plan.groups.filter((g) => ready.some((r) => r.groupKey === g.key)) : [];
  const allSited = groupsNeeded.every((g) => siteOf[g.key]);

  async function readFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setResult(null); setFileProblem(""); setSheets(null); setSiteOf({}); setLeft({});
    try {
      const read = readWorkbook(new Uint8Array(await file.arrayBuffer()));
      if (!read.length) throw new Error("empty");
      setSheets(read); setSheetName("");
    } catch { setFileProblem("That doesn't look like an Excel (.xlsx) file. Save the sheet as a .xlsx file and try again."); }
  }
  async function create() {
    setBusy(true); setResult(null);
    try {
      const inputs = ready.map((r) => {
        const site = sites.find((s) => s.id === siteOf[r.groupKey]);
        return { ...r.computer, site: site ? { id: site.id, name: site.name } : null };
      });
      const made = await addComputers(inputs, actor, { imported: true });
      setResult({ made }); setSheets(null); onCreated?.(made);
    } catch (error) { setResult({ error: error?.message || "That could not be saved. Try again." }); } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3 text-[var(--medtrak-text)]" aria-label="Add PCs from a spreadsheet">
      <div className="flex items-start justify-between gap-2"><p className="font-bold">Add PCs from a spreadsheet</p><button type="button" className="text-xs font-semibold underline" onClick={onClose}>Close</button></div>
      <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Choose your PCs and printers spreadsheet (an Excel .xlsx file). It is read on this computer and not uploaded. A tick under EMIS, Docman and the other programs means it is installed. You will see what it will do before anything is created.</p>
      <div className="mt-2"><button type="button" className="min-h-10 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold" onClick={() => fileRef.current?.click()}>Choose the spreadsheet</button><input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={readFile} aria-label="Spreadsheet file" /></div>
      {fileProblem && <p className="mt-2 text-sm font-semibold text-rose-600" role="alert">{fileProblem}</p>}

      {sheets && !usable.length && <p className="mt-2 text-sm font-semibold text-rose-600" role="alert">{parsed[0]?.plan.problem || "I couldn't find the PCs in that file."} Sheets in the file: {sheets.map((s) => s.name).join(", ")}.</p>}
      {chosen && (
        <div className="mt-3 space-y-3">
          {usable.length > 1 && <label className="block text-xs font-bold">Sheet<select className={`${FIELD} mt-1 w-full font-normal`} value={chosen.sheet.name} onChange={(e) => { setSheetName(e.target.value); setSiteOf({}); setLeft({}); }}>{usable.map((p) => <option key={p.sheet.name} value={p.sheet.name}>{p.sheet.name}</option>)}</select></label>}
          <div>
            <p className="text-xs font-bold">Which site is each part of the sheet for?</p>
            <ul className="mt-1 space-y-1.5">
              {plan.groups.map((g) => {
                const count = rows.filter((r) => r.groupKey === g.key && !r.errors.length).length;
                if (!count) return null;
                return (
                  <li key={g.key || "first"} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">{g.key ? `Section "${g.label}"` : "The first section"}: {count} PC{count === 1 ? "" : "s"}</span>
                    <select className={FIELD} value={siteOf[g.key] || ""} onChange={(e) => setSiteOf({ ...siteOf, [g.key]: e.target.value })} aria-label={`Site for ${g.label}`}><option value="">Choose the site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-xs text-[var(--medtrak-muted)]">Programs found: {plan.softwareFound.map((k) => SOFTWARE.find((s) => s.key === k)?.label || k).join(", ")}. A printer serial number on a row goes with that PC.</p>
          <ul className="max-h-72 divide-y divide-[var(--medtrak-border)] overflow-auto rounded-lg border border-[var(--medtrak-border)] text-sm">
            {rows.map((row, index) => (
              <li key={`${row.line}-${row.assetNumber}-${index}`} className="px-2 py-1.5">
                <div className="flex items-center gap-2">
                  {row.errors.length ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />}
                  <span className="font-semibold">PC {row.assetNumber || `row ${row.line}`}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--medtrak-muted)]">{row.errors.length ? "Skipped" : [row.computer.department, row.computer.label, row.computer.status === "spare" ? "Spare" : "", row.computer.holder ? `linked to ${row.computer.holder.name}` : ""].filter(Boolean).join(" · ")}</span>
                  {!row.errors.length && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!left[row.assetNumber]} onChange={(e) => setLeft({ ...left, [row.assetNumber]: !e.target.checked })} aria-label={`Add PC ${row.assetNumber}`} />Add</label>}
                </div>
                {[...row.errors, ...row.warnings].map((w) => <p key={w} className="ml-6 text-xs text-[var(--medtrak-muted)]">{w}</p>)}
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy || !ready.length || !allSited} onClick={create} className="min-h-10 rounded-xl bg-[var(--medtrak-accent)] px-4 text-sm font-bold text-white disabled:opacity-40">{busy ? "Adding…" : `Add ${ready.length} PC${ready.length === 1 ? "" : "s"}`}</button>
          {!allSited && ready.length > 0 && <p className="text-xs text-[var(--medtrak-muted)]">Choose a site for each part of the sheet first.</p>}
        </div>
      )}
      {result?.made ? <p className="mt-2 text-sm font-semibold text-emerald-600" role="status">{result.made} PC{result.made === 1 ? "" : "s"} added.</p> : null}
      {result?.error ? <p className="mt-2 text-sm font-semibold text-rose-600" role="alert">{result.error}</p> : null}
    </section>
  );
}
