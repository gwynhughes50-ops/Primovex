import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  AUDIT_RANGE_PRESETS,
  auditTimestamp,
  downloadAuditEvidence,
  flushAuditOutbox,
  resolveAuditRange,
  subscribeAuditEvents,
  writeAuditEvent,
} from "@/core/identity/auditService";

function displayTime(value) {
  const date = auditTimestamp(value);
  return date ? date.toLocaleString() : "Pending server time";
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

export default function AuditLedgerPanel({ onClose }) {
  const { profile, isAdmin, can } = useAuth();
  const [events, setEvents] = useState([]);
  const [queryText, setQueryText] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [rangePreset, setRangePreset] = useState("7d");
  const [customFrom, setCustomFrom] = useState(toDateInputValue(new Date(Date.now() - 7 * 86400000)));
  const [customTo, setCustomTo] = useState(toDateInputValue(new Date()));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const practiceId = profile?.practiceId || profile?.organisationId || profile?.organizationId || "primary";
  const permitted = isAdmin || can?.("audit.read");
  const { since, until } = useMemo(() => resolveAuditRange(rangePreset, customFrom, customTo), [rangePreset, customFrom, customTo]);

  useEffect(() => {
    if (!permitted) return undefined;
    flushAuditOutbox().catch(() => {});
    writeAuditEvent({
      action: "audit.ledger.view",
      module: "security",
      targetType: "audit_ledger",
      targetId: practiceId,
      summary: "Governed audit ledger viewed",
      classification: "security",
      disclosureLevel: "restricted",
      metadata: { range: rangePreset },
    }).catch(() => {});
    setLoading(true);
    return subscribeAuditEvents({ practiceId, since, until, max: since || until ? 2000 : 500 }, (rows) => {
      setEvents(rows);
      setLoading(false);
      setError("");
    }, (reason) => {
      setLoading(false);
      setError(reason?.message || "Audit evidence could not be loaded.");
    });
  }, [permitted, practiceId, since, until]);

  const modules = useMemo(() => [...new Set(events.map((event) => event.module).filter(Boolean))].sort(), [events]);
  const visible = useMemo(() => {
    const term = queryText.trim().toLowerCase();
    return events.filter((event) => {
      if (moduleFilter !== "all" && event.module !== moduleFilter) return false;
      if (!term) return true;
      return [event.action, event.summary, event.actorUid, event.actorRole, event.targetType, event.targetId, event.correlationId]
        .some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [events, moduleFilter, queryText]);

  const actorSummary = useMemo(() => {
    const byActor = new Map();
    visible.forEach((event) => {
      const key = event.actorUid || "unknown";
      const row = byActor.get(key) || { actorUid: key, actorRole: event.actorRole || "Unknown role", count: 0, lastAt: null };
      row.count += 1;
      const at = auditTimestamp(event.occurredAt);
      if (at && (!row.lastAt || at > row.lastAt)) row.lastAt = at;
      byActor.set(key, row);
    });
    return [...byActor.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  }, [visible]);

  const rangeLabel = AUDIT_RANGE_PRESETS.find((row) => row.id === rangePreset)?.label || "All time";

  function exportEvidence(format) {
    writeAuditEvent({
      action: "audit.evidence.export",
      module: "security",
      targetType: "audit_evidence",
      targetId: practiceId,
      summary: `Governed audit evidence exported as ${format.toUpperCase()}`,
      classification: "security",
      disclosureLevel: "restricted",
      metadata: { format, eventCount: visible.length, range: rangePreset },
    }).catch(() => {});
    downloadAuditEvidence(visible, format);
  }

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="mx-auto max-w-5xl rounded-3xl border border-sky-400/20 bg-slate-950 p-5 text-slate-100 shadow-2xl" aria-label="Governed audit ledger">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500/15 text-sky-200"><ShieldCheck className="h-5 w-5" /></span>
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Governed audit ledger</p><h2 className="mt-1 text-xl font-semibold">Forensic activity evidence</h2><p className="mt-1 text-sm text-slate-400">Server-verified identity · append-only · practice {practiceId}</p></div>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 p-2 text-slate-300" aria-label="Close audit ledger"><X className="h-5 w-5" /></button>
      </header>

      {!permitted ? <p className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-amber-100">Audit-read permission is required.</p> : (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            {AUDIT_RANGE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setRangePreset(preset.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${rangePreset === preset.id ? "bg-sky-500 text-slate-950" : "border border-slate-700 text-slate-300"}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {rangePreset === "custom" && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2 text-slate-400">From
                <input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100" />
              </label>
              <label className="flex items-center gap-2 text-slate-400">To
                <input type="date" value={customTo} min={customFrom} max={toDateInputValue(new Date())} onChange={(event) => setCustomTo(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100" />
              </label>
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_12rem_auto_auto]">
            <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3"><Search className="h-4 w-4 text-slate-500" /><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search action, user or record…" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></label>
            <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm"><option value="all">All modules</option>{modules.map((module) => <option key={module} value={module}>{module}</option>)}</select>
            <button type="button" onClick={() => exportEvidence("csv")} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold"><Download className="h-4 w-4" /> CSV</button>
            <button type="button" onClick={() => exportEvidence("json")} className="flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950"><Download className="h-4 w-4" /> Evidence JSON</button>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-400"><span>{visible.length} of {events.length} events · {rangeLabel}</span><span>{since || until ? "Up to 2,000 events in range" : "Latest 500 retained in this view"}</span></div>
          {error && <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>}

          {!loading && actorSummary.length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Who's done what · {rangeLabel}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {actorSummary.map((row) => (
                  <div key={row.actorUid} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="truncate text-sm font-semibold text-slate-100">{row.actorRole}</p>
                    <code className="block truncate text-xs text-slate-500">{row.actorUid}</code>
                    <p className="mt-1 text-xs text-slate-400">{row.count} event{row.count === 1 ? "" : "s"} · last {row.lastAt ? row.lastAt.toLocaleString() : "unknown"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {loading ? <p className="mt-5 flex items-center gap-2 text-sm text-slate-400"><RefreshCw className="h-4 w-4 animate-spin" /> Loading governed evidence…</p> : (
            <div className="mt-4 max-h-[32rem] overflow-auto rounded-2xl border border-slate-800">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-3">Sequence / time</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Record</th><th className="p-3">Outcome</th><th className="p-3">Evidence</th></tr></thead>
                <tbody className="divide-y divide-slate-800">{visible.map((event) => <tr key={event.id} className="align-top"><td className="p-3"><b className="text-sky-300">#{event.sequence || "—"}</b><small className="mt-1 block text-slate-500">{displayTime(event.occurredAt)}</small></td><td className="p-3"><span className="block font-medium">{event.actorRole || "Unknown role"}</span><code className="text-xs text-slate-500">{event.actorUid || "unknown"}</code></td><td className="p-3"><code className="text-xs text-sky-200">{event.action}</code><span className="mt-1 block text-slate-300">{event.summary}</span></td><td className="p-3"><span>{event.targetType}</span><code className="mt-1 block text-xs text-slate-500">{event.targetId || "—"}</code></td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${event.outcome === "success" ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-100"}`}>{event.outcome}</span><small className="mt-2 block text-slate-500">{event.permissionDecision}</small></td><td className="p-3"><code className="block max-w-[12rem] truncate text-xs text-slate-500" title={event.integrityHash}>{event.integrityHash || "legacy event"}</code><small className="mt-1 block text-slate-500">{event.source?.client || "legacy"} · {event.source?.version || "unknown"}</small></td></tr>)}</tbody>
              </table>
              {!visible.length && <p className="p-6 text-center text-sm text-slate-500">No audit events match this view.</p>}
            </div>
          )}
        </>
      )}
    </section>
    </div>
  );
}
