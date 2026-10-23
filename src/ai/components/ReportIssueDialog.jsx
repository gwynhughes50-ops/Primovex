import { useState } from "react";
import { CheckCircle2, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { MAX_MESSAGE, REPORT_KINDS, kindLabel, privacyProblem, statusLabel } from "@/modules/feedback/issueReport";
import { sendIssueReport, useMyReports } from "@/modules/feedback/issueReportService";

// "Tell the developer something": opened from the Orb. Anyone signed in can send a problem or an idea; they pick what sort it is, say
// what happened, and Primovex adds where they were, the version and the device. They can see their own reports and any reply.

const FIELD = "mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm text-[var(--medtrak-text)] outline-none focus:border-[var(--medtrak-accent)]";
const LABEL = "block text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]";
const STATUS_TONE = { new: "bg-slate-500/15 text-[var(--medtrak-muted)]", seen: "bg-sky-500/15 text-sky-700", planned: "bg-amber-500/15 text-amber-800", fixed: "bg-emerald-500/15 text-emerald-700", wont: "bg-rose-500/10 text-rose-700" };
const when = (v) => { const ms = v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0; return ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; };

export default function ReportIssueDialog({ onClose, initialText = "" }) {
  const { user, displayName, role } = useAuth();
  const mine = useMyReports();
  const [tab, setTab] = useState("send");
  const [form, setForm] = useState({ kind: "", message: initialText, doing: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  const set = (patch) => { setError(""); setForm((f) => ({ ...f, ...patch })); };
  const warning = form.message.length > 3 || form.doing ? privacyProblem(form.message, form.doing) : "";

  async function send() {
    setBusy(true); setError("");
    try { setSent(await sendIssueReport(form, { user, displayName, role })); setForm({ kind: "", message: "", doing: "" }); } catch (failure) { setError(failure?.message || "That could not be sent. Try again."); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/50 p-3 sm:items-center" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Tell the developer something" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 text-[var(--medtrak-text)] shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Tell the developer something</h2>
            <p className="text-sm text-[var(--medtrak-muted)]">A problem you hit, or an idea to make Primovex better. It goes straight to the developer.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[var(--medtrak-muted)] hover:bg-black/5" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-3 flex gap-1" role="tablist">
          {[["send", "Send a report"], ["mine", `My reports${mine.rows?.length ? ` (${mine.rows.length})` : ""}`]].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-10 flex-1 rounded-xl border px-3 text-sm font-bold ${tab === key ? "border-[var(--medtrak-accent)] bg-black/5" : "border-[var(--medtrak-border)]"}`}>{label}</button>
          ))}
        </div>

        {tab === "send" && (sent ? (
          <div className="mt-4 space-y-3">
            <p className="flex items-start gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-800" role="status"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><span>Thank you. It has been sent as <b>{sent.ticket}</b> and the developer has been told. You can see how it gets on under My reports.</span></p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSent(null)} className="min-h-11 flex-1 rounded-2xl border border-[var(--medtrak-border)] px-4 font-bold">Send another</button>
              <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-2xl bg-[var(--medtrak-accent)] px-4 font-bold text-white">Done</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div role="radiogroup" aria-label="What sort of report" className="grid gap-2">
              {REPORT_KINDS.map((k) => (
                <button key={k.key} type="button" role="radio" aria-checked={form.kind === k.key} onClick={() => set({ kind: k.key })} className={`rounded-2xl border px-4 py-3 text-left ${form.kind === k.key ? "border-[var(--medtrak-accent)] bg-black/5" : "border-[var(--medtrak-border)]"}`}>
                  <span className="block text-sm font-bold">{k.label}</span><span className="block text-xs text-[var(--medtrak-muted)]">{k.hint}</span>
                </button>
              ))}
            </div>
            <label className={LABEL}>What happened, or what would help?
              <textarea rows={4} maxLength={MAX_MESSAGE} value={form.message} onChange={(e) => set({ message: e.target.value })} placeholder="e.g. When I press Save on the SAR form nothing happens" className={FIELD} />
              <span className="mt-0.5 block text-right text-[11px] font-normal normal-case text-[var(--medtrak-muted)]">{form.message.length} / {MAX_MESSAGE}</span>
            </label>
            <label className={LABEL}>What were you trying to do? (optional)
              <input maxLength={400} value={form.doing} onChange={(e) => set({ doing: e.target.value })} placeholder="e.g. Logging a new subject access request" className={FIELD} />
            </label>
            <p className="flex items-start gap-1.5 text-xs text-[var(--medtrak-muted)]"><ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span><strong>Please do not put patient names, numbers or dates of birth in.</strong> Primovex adds which page you were on, the version and your device for you.</span></p>
            {(warning || error) && <p className="rounded-xl bg-amber-400/20 p-3 text-sm font-semibold text-amber-900" role="alert">{error || warning}</p>}
            <button type="button" onClick={send} disabled={busy || !form.kind || form.message.trim().length < 10 || Boolean(warning)} className="min-h-12 w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 text-base font-bold text-white disabled:opacity-40">{busy ? "Sending…" : "Send to the developer"}</button>
          </div>
        ))}

        {tab === "mine" && (
          <div className="mt-4 space-y-2">
            {!mine.ready && <p className="text-sm text-[var(--medtrak-muted)]">Opening…</p>}
            {mine.error && <p className="text-sm text-rose-700">{mine.error}</p>}
            {mine.ready && !mine.rows.length && !mine.error && <p className="rounded-2xl border border-dashed border-[var(--medtrak-border)] p-4 text-sm text-[var(--medtrak-muted)]">You haven't sent anything yet.</p>}
            {(mine.rows || []).slice(0, 30).map((r) => (
              <article key={r.id} className="rounded-2xl border border-[var(--medtrak-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--medtrak-accent)]">{r.ticket} · {kindLabel(r.kind)}{when(r.createdAt) ? ` · ${when(r.createdAt)}` : ""}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONE[r.status] || STATUS_TONE.new}`}>{statusLabel(r.status)}{r.status === "fixed" && r.fixedIn ? ` in ${r.fixedIn}` : ""}</span>
                </div>
                <p className="mt-1 text-sm">{r.message}</p>
                {r.reply && <p className="mt-2 rounded-xl bg-black/5 p-2 text-sm"><b>The developer says:</b> {r.reply}</p>}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
