import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createComplianceAsset } from "@/services/compliance/complianceQrService";
import { getAssetTypeConfig } from "@/services/compliance/complianceRules";
import { TEMPLATE_TEXT, buildImportPlan } from "@/services/compliance/assetImport";

// "Add many at once": paste a list from a spreadsheet (or choose a CSV), look at what it will make, then create it. Nothing is
// made until the plan has been looked at; a row that cannot be made says why, and a room that is not recognised is picked from
// the site's own rooms. Codes are assigned here, never typed.

const FIELD = "w-full rounded-lg border border-white/10 bg-slate-950/50 px-2 py-1.5 text-sm text-slate-100 [&>option]:bg-slate-900";
const STATUS = {
  ok: { Icon: CheckCircle2, tone: "text-emerald-300", label: "Will be created" },
  exists: { Icon: CheckCircle2, tone: "text-slate-400", label: "Already there, skipped" },
  problem: { Icon: AlertTriangle, tone: "text-amber-300", label: "Needs attention" },
};

export default function AssetImportPanel({ assets = [], rooms = [], siteId, siteName = "", onClose, onCreated }) {
  const [text, setText] = useState("");
  const [overrides, setOverrides] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const plan = useMemo(() => (text.trim() ? buildImportPlan({ text, existing: assets, rooms, overrides }) : null), [text, assets, rooms, overrides]);
  const ready = plan ? plan.rows.filter((r) => r.status === "ok") : [];

  function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result || "")); setOverrides({}); setResult(null); };
    reader.readAsText(file);
    event.target.value = "";
  }

  async function create() {
    setBusy(true);
    setResult(null);
    let made = 0;
    const failed = [];
    for (const row of ready) {
      const config = getAssetTypeConfig(row.assetType);
      try {
        await createComplianceAsset({
          assetType: row.assetType, assetCode: row.code, label: row.label, location: row.location, checkMode: config.checkMode,
          frequency: row.frequency, minTempC: row.minTempC ?? "", maxTempC: row.maxTempC ?? "", countdownSeconds: "", siteId,
        });
        made += 1;
      } catch (error) {
        failed.push(`${row.code} (${row.label}): ${error?.message || "could not be created"}`);
      }
    }
    setBusy(false);
    setResult({ made, failed });
    if (made) onCreated?.(made);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-8" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="asset-import-title" className="w-full max-w-5xl rounded-3xl border border-white/10 bg-slate-900 p-5 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="asset-import-title" className="flex items-center gap-2 text-xl font-semibold"><FileSpreadsheet className="h-5 w-5 text-teal-300" aria-hidden="true" /> Add many at once</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Paste a list from a spreadsheet (copy the cells, including the heading row), or choose a CSV file. The headings are <b>Type</b>, <b>Name</b> and <b>Location</b>; <b>Frequency</b>, <b>Lowest °C</b> and <b>Highest °C</b> are optional and fill in from the type if left out. These go into <b>{siteName || "the site shown on this page"}</b>.
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-slate-300 hover:bg-white/5" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setText(TEMPLATE_TEXT); setOverrides({}); setResult(null); }} className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200">Show an example list</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200">Choose a CSV file</Button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={readFile} className="hidden" aria-label="Choose a CSV file" />
          {text && <Button variant="outline" onClick={() => { setText(""); setOverrides({}); setResult(null); }} className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200">Clear</Button>}
        </div>

        <textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} rows={7} spellCheck={false} aria-label="The list" placeholder={"Type\tName\tLocation\nFire point\tFire point 2\tEntrance"} className={`${FIELD} mt-3 font-mono text-xs`} />

        {plan?.problems.length > 0 && <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100" role="alert">{plan.problems[0]}</p>}

        {plan && plan.rows.length > 0 && (
          <>
            <p className="mt-4 text-sm text-slate-300" role="status">
              <b className="text-emerald-300">{plan.counts.ok}</b> will be created
              {plan.counts.exists ? <>, <b>{plan.counts.exists}</b> already there</> : null}
              {plan.counts.problem ? <>, <b className="text-amber-300">{plan.counts.problem}</b> need attention (they will be left out until fixed)</> : null}.
            </p>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Line</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">How often</th><th className="px-3 py-2">Code</th><th className="px-3 py-2">What happens</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((row) => {
                    const { Icon, tone, label } = STATUS[row.status];
                    const needsRoom = row.status === "problem" && rooms.length > 0 && row.problems.some((p) => /room/i.test(p));
                    return (
                      <tr key={row.line} className="border-b border-white/5 align-top">
                        <td className="px-3 py-2 text-slate-500">{row.line}</td>
                        <td className="px-3 py-2">{row.typeLabel || "—"}</td>
                        <td className="px-3 py-2">{row.label || "—"}</td>
                        <td className="px-3 py-2">
                          {needsRoom ? (
                            <select value={overrides[row.line] ?? ""} onChange={(e) => setOverrides((old) => ({ ...old, [row.line]: e.target.value }))} className={FIELD} aria-label={`Room for line ${row.line}`}>
                              <option value="">Choose the room…</option>
                              {rooms.map((room) => <option key={room} value={room}>{room}</option>)}
                            </select>
                          ) : (row.location || "—")}
                        </td>
                        <td className="px-3 py-2">{row.frequency || "—"}{row.minTempC !== null && row.maxTempC !== null && row.status !== "problem" ? <div className="text-xs text-slate-500">{row.minTempC}°C to {row.maxTempC}°C</div> : null}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold">{row.code || "—"}</td>
                        <td className={`px-3 py-2 ${tone}`}>
                          <span className="inline-flex items-center gap-1"><Icon className="h-4 w-4" aria-hidden="true" /> {label}</span>
                          {row.problems.filter((p) => !needsRoom || !/room/i.test(p)).map((p) => <div key={p} className="mt-1 text-xs text-amber-200">{p}</div>)}
                          {needsRoom && !overrides[row.line] && <div className="mt-1 text-xs text-amber-200">{row.problems[0]}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {result && (
          <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${result.failed.length ? "border-amber-400/30 bg-amber-500/10 text-amber-100" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"}`} role="status">
            {result.made ? `Created ${result.made} ${result.made === 1 ? "asset" : "assets"}. Print their labels from the register below, or copy a tag link to write an NFC tag.` : "Nothing was created."}
            {result.failed.map((f) => <div key={f} className="mt-1 text-xs">{f}</div>)}
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-full border-white/10 bg-slate-900/40 text-sm text-slate-200">{result?.made ? "Done" : "Cancel"}</Button>
          <Button onClick={create} disabled={busy || ready.length === 0} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-sm font-semibold text-slate-950 disabled:opacity-50">
            {busy ? "Creating…" : ready.length ? `Create ${ready.length} ${ready.length === 1 ? "asset" : "assets"}` : "Nothing to create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
