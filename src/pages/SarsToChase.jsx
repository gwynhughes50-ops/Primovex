import { Link } from "react-router-dom";
import SarBell from "@/components/governance/SarBell";
import { useSarsToChase } from "@/modules/governance/useSarsToChase";
import { bellTone, dueWords, lastReminderText } from "@/modules/governance/sarReminderModel";

// For the Practice Manager and for line managers: the live SARs assigned to your team, most urgent first, each with the reminder bell.
// What is shown is made on the server and holds no patient details (reference, kind of request, due date, status, who has it), so a
// line manager who is not on the SAR team can use it without seeing the SAR records.
const STATUS = { new: "New", assigned: "Assigned", in_progress: "In progress", quality_check: "Quality check" };
const TONE_TEXT = { late: "text-rose-500", soon: "text-amber-600", plain: "" };

export default function SarsToChase() {
  const { canChase, rows, loading, error, reload } = useSarsToChase();
  return (
    <div className="mt-theme-page mx-auto max-w-5xl space-y-4 pb-10">
      <header>
        <h1 className="mt-text-primary text-2xl font-black">SARs to chase</h1>
        <p className="mt-text-secondary mt-1 text-sm">
          Open SARs assigned to the people you manage, most urgent first. Press the bell to remind someone that a SAR needs prioritising.
        </p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-600">{error} <button type="button" className="underline" onClick={() => reload()}>Try again</button></p>}
      {loading ? <p className="mt-text-secondary text-sm">Opening…</p> : !canChase ? (
        <p className="mt-card rounded-2xl border p-4 text-sm">Nobody reports to you on the organisation chart, so there is nothing to chase here.</p>
      ) : rows.length === 0 ? (
        <p className="mt-card rounded-2xl border p-4 text-sm">There are no open SARs assigned to your team.</p>
      ) : (
        <div className="mt-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-left text-sm">
            <thead className="mt-text-secondary text-xs uppercase tracking-wide">
              <tr className="border-b border-[var(--medtrak-border)]">
                <th className="p-3">Reference</th><th className="p-3">Type</th><th className="p-3">Assigned to</th><th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3">Reminders</th><th className="p-3"><span className="sr-only">Remind</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--medtrak-border)] last:border-0">
                  <td className="p-3 font-bold">{row.reference}</td>
                  <td className="p-3">{row.requestTypeLabel}</td>
                  <td className="p-3">{row.assignedToName || "—"}</td>
                  <td className={`p-3 font-semibold ${TONE_TEXT[bellTone(row.daysLeft)]}`}>{row.dueLabel || "—"}<span className="block text-xs font-normal">{dueWords(row.daysLeft)}</span></td>
                  <td className="p-3">{STATUS[row.status] || row.status}</td>
                  <td className="mt-text-secondary p-3 text-xs">{lastReminderText(row).replace("Last reminder: ", "") || "None sent"}</td>
                  <td className="p-3 text-right"><SarBell row={row} onSent={() => reload()} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-text-secondary text-xs">Someone on the SAR team can open a SAR in full from <Link to="/governance/sars" className="underline">SARs</Link>.</p>
    </div>
  );
}
