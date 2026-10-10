import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CircleSlash, ClipboardCheck, EyeOff, Printer, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { printHtmlDocument } from "@/lib/printHtmlDocument";
import { writeAuditEvent } from "@/core/identity/auditService";
import { VISITS, buildReport, visitById } from "@/modules/inspection/inspectionReports";
import { STATUS_LABEL, inspectionHtml } from "@/modules/inspection/inspectionHtml";
import { loadInspectionData } from "@/modules/inspection/inspectionLoader";

// Inspection pack (Reports > Inspection pack): one summary sheet of the evidence Primovex holds for a visit (a HEIW
// inspection, a Health and Safety visit), with the gaps to put right at the top, ready to print or save as a PDF.
// The Practice Manager and anyone given "Prepare inspection evidence reports" can open it; it only reads what they
// can already read, and says "Not shown" for anything their role can't open.

const STATUS_STYLE = {
  ok: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  attention: "border-rose-400/40 bg-rose-500/10 text-rose-200",
  none: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  unavailable: "border-white/15 bg-white/5 text-slate-300",
};
const STATUS_ICON = { ok: CheckCircle2, attention: AlertTriangle, none: CircleSlash, unavailable: EyeOff };

export default function InspectionPack() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const visitId = visitById(params.get("visit") || "heiw").id;
  const [data, setData] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const preparedBy = user?.displayName || user?.email || "";

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const now = new Date();
      setData(await loadInspectionData(now));
      setLoadedAt(now);
    } catch (problem) {
      console.error(problem);
      setError("Could not read the records. Check your connection and try again.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const report = useMemo(() => (data ? buildReport({ visitId, data, preparedBy, now: loadedAt || new Date() }) : null), [data, visitId, preparedBy, loadedAt]);

  function print() {
    if (!report) return;
    printHtmlDocument(inspectionHtml(report));
    writeAuditEvent({
      action: "inspection.pack.printed",
      module: "reports",
      targetType: "inspection_pack",
      targetId: report.visit.id,
      summary: `${report.visit.label} evidence summary printed`,
      classification: "governance",
      metadata: { sections: report.sections.length, gaps: report.gaps.length },
    }).catch(() => {});
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-100"><ClipboardCheck className="h-6 w-6 text-teal-300" aria-hidden="true" /> Inspection pack</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">One summary sheet of the evidence Primovex holds for a visit: what is in place, and what to put right first. Print it, or choose Save as PDF in the print window. Concerns, SARs and significant events are counts only.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={load} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" /> {busy ? "Reading records…" : "Refresh"}</button>
          <button type="button" onClick={print} disabled={!report || busy} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"><Printer className="h-4 w-4" aria-hidden="true" /> Print or save as PDF</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which visit">
        {VISITS.map((visit) => (
          <button key={visit.id} type="button" role="radio" aria-checked={visit.id === visitId} onClick={() => setParams({ visit: visit.id }, { replace: true })}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold ${visit.id === visitId ? "border-teal-300/60 bg-teal-500/15 text-teal-100" : "border-white/10 bg-slate-900/60 text-slate-300 hover:bg-white/5"}`}>
            {visit.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
      {!report && !error && <p className="text-sm text-slate-400">Reading the records…</p>}

      {report && (
        <>
          <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <h2 className="text-lg font-semibold text-slate-100">To put right before the visit</h2>
            {report.gaps.length === 0 ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Nothing is flagged. Every area with records is in date.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
                {report.gaps.map((gap) => <li key={`${gap.section}-${gap.text}`} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" /><span><strong>{gap.section}:</strong> {gap.text}</span></li>)}
              </ul>
            )}
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            {report.sections.map((section) => {
              const Icon = STATUS_ICON[section.status];
              return (
                <section key={section.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-100">{section.title}</h3>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[section.status]}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /> {STATUS_LABEL[section.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-300">{section.headline}</p>
                  {section.rows.length > 0 && (
                    <dl className="mt-2 divide-y divide-white/5 text-sm">
                      {section.rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-1"><dt className="text-slate-400">{label}</dt><dd className="font-semibold text-slate-100">{value}</dd></div>)}
                    </dl>
                  )}
                </section>
              );
            })}
          </div>

          <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <h3 className="font-semibold text-slate-100">Held outside Primovex (bring separately)</h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-300">{report.visit.outside.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <p className="text-xs text-slate-500">Read {loadedAt?.toLocaleString("en-GB")}. "Evidence in place" means records exist and are in date against the usual frequency; it is not a statement of compliance.</p>
        </>
      )}
    </div>
  );
}
