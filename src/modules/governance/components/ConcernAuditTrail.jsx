import { useEffect, useMemo, useState } from "react";
import { auditPeople, auditRowsForScreen } from "@/modules/governance/concernAudit";
import { subscribeConcernTimeline } from "@/modules/governance/services/concernService";

// The audit trail of a concern, for the concerns team only (the caller decides): everything done to the case, newest first, with when, who and what.
// The same lines as the printed summary: every entry in the case timeline, and every change to the case record with what it was before and after.
// Summaries, patient details and contact details show as changed without repeating the words. Styled with the app's theme variables so it suits the desktop and the phone.
const FIRST = 25;

export default function ConcernAuditTrail({ concernId }) {
  const [events, setEvents] = useState(null); // null: still loading
  const [failed, setFailed] = useState(false);
  const [who, setWho] = useState("");
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (!concernId) return undefined;
    setEvents(null); setFailed(false); setWho(""); setAll(false);
    return subscribeConcernTimeline(concernId, setEvents, () => { setFailed(true); setEvents([]); }, { includeAudit: true });
  }, [concernId]);

  const people = useMemo(() => auditPeople(events || []), [events]);
  const rows = useMemo(() => auditRowsForScreen(events || [], who), [events, who]);
  const shown = all ? rows : rows.slice(0, FIRST);

  return (
    <section aria-label="Audit trail" className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3 text-[var(--medtrak-text)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Audit trail{events ? ` (${rows.length})` : ""}</p>
        {people.length > 1 && (
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-[var(--medtrak-muted)]">Show</span>
            <select value={who} onChange={(event) => { setWho(event.target.value); setAll(false); }} className="rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2 py-1 text-xs">
              <option value="">Everyone</option>
              {people.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Everything done to this case, newest first: who did it, when, and what changed. Summaries, patient details and contact details show as changed without the words. Changes made before 0.15.105 have no field detail.</p>
      {events === null && <p className="mt-2 text-sm text-[var(--medtrak-muted)]">Loading…</p>}
      {failed && <p className="mt-2 text-sm font-semibold text-rose-600">The audit trail could not be loaded.</p>}
      {events !== null && !failed && rows.length === 0 && <p className="mt-2 text-sm text-[var(--medtrak-muted)]">Nothing recorded{who ? ` for ${who}` : ""} yet.</p>}
      {shown.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--medtrak-border)] rounded-xl border border-[var(--medtrak-border)] text-sm">
          {shown.map((row, index) => (
            <li key={`${row.when}-${index}`} className="px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold">{row.what}</span>
                <span className="text-xs text-[var(--medtrak-muted)]">{row.when}</span>
              </div>
              {row.detail && <span className="block text-xs text-[var(--medtrak-muted)]">{row.detail}</span>}
              <span className="block text-xs font-semibold">{row.who}</span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > FIRST && (
        <button type="button" onClick={() => setAll((value) => !value)} className="mt-2 text-xs font-semibold text-[var(--medtrak-accent)] underline">{all ? "Show fewer" : `Show all ${rows.length}`}</button>
      )}
    </section>
  );
}
