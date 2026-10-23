import { useMemo, useState } from "react";
import { Lightbulb, MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NEXT_STATUSES, REPORT_STATUS, kindLabel, statusLabel } from "@/modules/feedback/issueReport";
import { answerIssueReport, useAllReports } from "@/modules/feedback/issueReportService";

// Reports from staff (Developer Centre, System Admin only): problems and ideas sent through the Orb, newest first. Each can be marked
// seen, planned, done (with the version) or not doing, with a short reply the person sees under "My reports".

const TONE = { new: "bg-amber-400/20 text-amber-900", seen: "bg-sky-500/15 text-sky-800", planned: "bg-violet-500/15 text-violet-800", fixed: "bg-emerald-500/15 text-emerald-800", wont: "bg-slate-500/15 text-slate-700" };
const when = (v) => { const ms = v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0; return ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; };
const PLATFORM = { windows: "Windows app", android: "Android app", ios: "iPhone", web: "Website" };

function Report({ report, actor }) {
  const [reply, setReply] = useState(report.reply || "");
  const [fixedIn, setFixedIn] = useState(report.fixedIn || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function move(status) {
    setBusy(true); setError("");
    try { await answerIssueReport(report.id, { status, reply, fixedIn }, actor); } catch (failure) { setError(failure?.message || "That didn't save."); } finally { setBusy(false); }
  }
  const Icon = report.kind === "idea" ? Lightbulb : MessageSquare;
  return (
    <article className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--medtrak-accent)]" aria-hidden="true" />
        <span className="text-xs font-bold text-[var(--medtrak-accent)]">{report.ticket}</span>
        <span className="rounded-full border border-[var(--medtrak-border)] px-2 py-0.5 text-[11px]">{kindLabel(report.kind)}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONE[report.status] || TONE.new}`}>{statusLabel(report.status)}{report.status === "fixed" && report.fixedIn ? ` in ${report.fixedIn}` : ""}</span>
        <span className="ml-auto text-xs text-[var(--medtrak-muted)]">{when(report.createdAt)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold">{report.message}</p>
      {report.doing && <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Trying to: {report.doing}</p>}
      <p className="mt-2 text-xs text-[var(--medtrak-muted)]">{report.reporterName}{report.role ? ` (${report.role})` : ""} · {report.route || "no page"} · {PLATFORM[report.platform] || report.platform}{report.appVersion ? ` ${report.appVersion}` : ""}</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_9rem]">
        <input value={reply} maxLength={300} onChange={(e) => setReply(e.target.value)} placeholder="A short reply for them (they see it)" aria-label="Reply" className="rounded-lg border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm" />
        <input value={fixedIn} onChange={(e) => setFixedIn(e.target.value)} placeholder="Version, e.g. 0.15.65" aria-label="Version it was done in" className="rounded-lg border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {(NEXT_STATUSES[report.status] || []).map((s) => <button key={s} type="button" disabled={busy} onClick={() => move(s)} className="rounded-lg border border-[var(--medtrak-border)] px-3 py-1.5 text-xs font-semibold hover:bg-black/5 disabled:opacity-40">{REPORT_STATUS.find((x) => x.key === s)?.label}</button>)}
        {(report.reply || "") !== reply.trim() && report.status !== "new" && <button type="button" disabled={busy} onClick={() => move(report.status)} className="rounded-lg bg-[var(--medtrak-accent)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Save reply</button>}
        {error && <span className="text-xs text-rose-700" role="alert">{error}</span>}
      </div>
    </article>
  );
}

export default function StaffReportsPanel() {
  const { user, displayName } = useAuth();
  const { rows, error, ready } = useAllReports(true);
  const [showClosed, setShowClosed] = useState(false);
  const actor = { displayName: displayName || user?.email || "", email: user?.email || "" };
  const open = useMemo(() => (rows || []).filter((r) => r.status === "new" || r.status === "seen" || r.status === "planned"), [rows]);
  const shown = showClosed ? rows || [] : open;
  const unread = (rows || []).filter((r) => r.status === "new").length;
  return (
    <section className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 shadow-sm" aria-label="Reports from staff">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Reports from staff{unread ? <span className="ml-2 rounded-full bg-amber-400/30 px-2.5 py-0.5 text-sm font-bold text-amber-900">{unread} new</span> : null}</h2>
          <p className="text-sm text-[var(--medtrak-muted)]">Problems and ideas sent through the Orb, with the page, version and device added. Reply and mark them off: staff see your answer.</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show done and not-doing</label>
      </div>
      {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
      {!ready && <p className="mt-3 text-sm text-[var(--medtrak-muted)]">Opening…</p>}
      {ready && !shown.length && !error && <p className="mt-3 rounded-xl border border-dashed border-[var(--medtrak-border)] p-6 text-center text-sm text-[var(--medtrak-muted)]">{rows?.length ? "Nothing waiting. Everything has been dealt with." : "Nothing yet. When staff tell the Orb about a problem or an idea, it appears here."}</p>}
      <div className="mt-3 space-y-3">{shown.slice(0, 100).map((r) => <Report key={r.id} report={r} actor={actor} />)}</div>
    </section>
  );
}
