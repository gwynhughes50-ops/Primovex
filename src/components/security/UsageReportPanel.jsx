import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, Download, RefreshCw, Search, Users, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AUDIT_RANGE_PRESETS, resolveAuditRange, writeAuditEvent } from "@/core/identity/auditService";
import { subscribeUsageSessions } from "@/services/usageService";
import { areaLabel, endText, formatDuration, overview, sessionsToCsv, summariseUsers } from "@/lib/usageReport";

const dateTime = (date) => (date ? date.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const toDateInputValue = (date) => date.toISOString().slice(0, 10);

const STATUS_STYLE = {
  active: "bg-emerald-500/10 text-emerald-200",
  ended: "bg-slate-500/10 text-slate-300",
  lapsed: "bg-amber-500/10 text-amber-100",
};

function Stat({ icon: Icon, label, value, note, tone = "text-sky-200" }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${tone}`}><Icon className="h-4 w-4" />{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export default function UsageReportPanel({ onClose }) {
  const { profile, isAdmin, can } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [rangePreset, setRangePreset] = useState("7d");
  const [customFrom, setCustomFrom] = useState(toDateInputValue(new Date(Date.now() - 7 * 86400000)));
  const [customTo, setCustomTo] = useState(toDateInputValue(new Date()));
  const [queryText, setQueryText] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [open, setOpen] = useState(() => new Set());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const practiceId = profile?.practiceId || profile?.organisationId || profile?.organizationId || "primary";
  const permitted = isAdmin || can?.("audit.read");
  const { since, until } = useMemo(() => resolveAuditRange(rangePreset, customFrom, customTo), [rangePreset, customFrom, customTo]);

  useEffect(() => {
    if (!permitted) return undefined;
    writeAuditEvent({
      action: "audit.usage.view",
      module: "security",
      targetType: "usage_report",
      targetId: practiceId,
      summary: "Sign-in and activity report viewed",
      classification: "security",
      disclosureLevel: "restricted",
      metadata: { range: rangePreset },
    }).catch(() => {});
    setLoading(true);
    setError("");
    return subscribeUsageSessions(
      { practiceId, since, until, max: 2000 },
      (rows) => { setSessions(rows); setLoading(false); },
      (err) => { setError(err?.code === "permission-denied" ? "You don't have permission to read the activity report." : err?.message || "Could not load the report."); setLoading(false); }
    );
  }, [permitted, practiceId, rangePreset, since?.getTime(), until?.getTime()]);

  const users = useMemo(() => summariseUsers(sessions), [sessions]);
  const shown = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    return users.filter((u) => (!needle || `${u.name} ${u.role}`.toLowerCase().includes(needle)) && (!flaggedOnly || u.flags.length));
  }, [users, queryText, flaggedOnly]);
  const totals = useMemo(() => overview(users), [users]);
  const rangeLabel = AUDIT_RANGE_PRESETS.find((row) => row.id === rangePreset)?.label || "All time";

  function toggle(uid) {
    setOpen((current) => { const next = new Set(current); if (next.has(uid)) next.delete(uid); else next.add(uid); return next; });
  }

  function exportCsv() {
    writeAuditEvent({
      action: "audit.usage.export",
      module: "security",
      targetType: "usage_report",
      targetId: practiceId,
      summary: "Sign-in and activity report exported as CSV",
      classification: "security",
      disclosureLevel: "restricted",
      metadata: { people: shown.length, range: rangePreset },
    }).catch(() => {});
    const url = URL.createObjectURL(new Blob([sessionsToCsv(shown)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `primovex-sign-in-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="mx-auto max-w-6xl rounded-3xl border border-sky-400/20 bg-slate-950 p-5 text-slate-100 shadow-2xl" aria-label="Sign-in and activity report">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500/15 text-sky-200"><Users className="h-5 w-5" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Sign-in &amp; activity report</p>
              <h2 className="mt-1 text-xl font-semibold">Who was in, what they used, and for how long</h2>
              <p className="mt-1 text-sm text-slate-400">Times come from the server. Only areas of the app are recorded, never patient records, searches or anything typed.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 p-2 text-slate-300" aria-label="Close report"><X className="h-5 w-5" /></button>
        </header>

        {!permitted ? <p className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-amber-100">Audit-read permission is required.</p> : (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              {AUDIT_RANGE_PRESETS.map((preset) => (
                <button key={preset.id} type="button" onClick={() => setRangePreset(preset.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${rangePreset === preset.id ? "bg-sky-500 text-slate-950" : "border border-slate-700 text-slate-300"}`}>{preset.label}</button>
              ))}
            </div>
            {rangePreset === "custom" && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2 text-slate-400">From <input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100" /></label>
                <label className="flex items-center gap-2 text-slate-400">To <input type="date" value={customTo} min={customFrom} max={toDateInputValue(new Date())} onChange={(event) => setCustomTo(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100" /></label>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat icon={Users} label="People signed in" value={totals.people} note={rangeLabel} />
              <Stat icon={Clock} label="Sign-ins" value={totals.sessions} note="Each time someone started a session" />
              <Stat icon={Clock} label="Time in the app" value={formatDuration(totals.activeSeconds)} note="Active time only; idle time isn't counted" />
              <Stat icon={AlertTriangle} label="Worth a look" value={totals.flagged} note="People with a flag below" tone={totals.flagged ? "text-amber-200" : "text-emerald-200"} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3"><Search className="h-4 w-4 text-slate-500" /><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Find a person or role…" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300"><input type="checkbox" checked={flaggedOnly} onChange={(event) => setFlaggedOnly(event.target.checked)} /> Only people with a flag</label>
              <button type="button" onClick={exportCsv} disabled={!shown.length} className="flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"><Download className="h-4 w-4" /> Export CSV</button>
            </div>

            {error && <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>}
            {loading ? <p className="mt-5 flex items-center gap-2 text-sm text-slate-400"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</p> : (
              <div className="mt-4 overflow-auto rounded-2xl border border-slate-800">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
                    <tr><th className="w-8 p-3" /><th className="p-3">Person</th><th className="p-3">Last signed in</th><th className="p-3">Sign-ins</th><th className="p-3">Days</th><th className="p-3">Time in app</th><th className="p-3">Mostly used</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {shown.map((user) => {
                      const isOpen = open.has(user.uid);
                      return (
                        <Fragment key={user.uid}>
                          <tr className="cursor-pointer align-top hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_14%,transparent)]" onClick={() => toggle(user.uid)}>
                            <td className="p-3 text-slate-500">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                            <td className="p-3">
                              <span className="block font-medium">{user.name}</span>
                              <span className="block text-xs text-slate-500">{user.role}</span>
                              {user.flags.map((flag) => <span key={flag} className="mt-1 flex items-center gap-1 text-xs text-amber-200"><AlertTriangle className="h-3 w-3" />{flag}</span>)}
                            </td>
                            <td className="p-3 text-slate-300">{dateTime(user.lastSignIn)}</td>
                            <td className="p-3">{user.sessionCount}</td>
                            <td className="p-3">{user.daysActive}</td>
                            <td className="p-3">{formatDuration(user.activeSeconds)}</td>
                            <td className="p-3 text-slate-300">{user.topAreas.length ? user.topAreas.map((a) => `${a.label} (${formatDuration(a.seconds)})`).join(", ") : "—"}</td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td />
                              <td colSpan={6} className="bg-slate-900/40 p-3">
                                <table className="w-full text-left text-xs">
                                  <thead className="text-slate-500"><tr><th className="py-1.5 pr-3">Signed in</th><th className="pr-3">Ended</th><th className="pr-3">In session</th><th className="pr-3">Active</th><th className="pr-3">Device</th><th>Areas used</th></tr></thead>
                                  <tbody className="divide-y divide-slate-800/70">
                                    {user.sessions.map((s) => (
                                      <tr key={s.id} className="align-top">
                                        <td className="py-2 pr-3 text-slate-200">{dateTime(s.startedAt)}{s.flags.map((flag) => <span key={flag} className="block text-amber-200">{flag}</span>)}</td>
                                        <td className="pr-3"><span className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[s.status]}`}>{endText(s)}</span>{s.status !== "active" && <span className="mt-1 block text-slate-500">{dateTime(s.endedAt || s.lastSeenAt)}</span>}</td>
                                        <td className="pr-3">{formatDuration(s.spanSeconds)}</td>
                                        <td className="pr-3">{formatDuration(s.activeSeconds)}</td>
                                        <td className="pr-3 text-slate-400">{[s.client, s.platform].filter(Boolean).join(" · ") || "—"}</td>
                                        <td className="text-slate-300">{s.pages.length ? s.pages.map((p) => `${areaLabel(p.path)} (${formatDuration(p.seconds)})`).join(", ") : "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {!shown.length && !error && <p className="p-6 text-center text-sm text-slate-500">{sessions.length ? "Nobody matches this view." : "No sign-ins recorded in this period yet. Activity is recorded from the version that added this report onwards."}</p>}
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">Failed sign-in attempts happen before anyone is identified, so they are held by Firebase Authentication rather than here. Activity is reported by the app roughly every four minutes, so the end of a session left open can be a few minutes out.</p>
          </>
        )}
      </section>
    </div>
  );
}
