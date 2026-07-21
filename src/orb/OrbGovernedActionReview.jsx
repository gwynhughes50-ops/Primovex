import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { listGovernedActionAudit } from './GovernedActionStore';

function displayTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-GB');
}

export default function OrbGovernedActionReview() {
  const { can } = useAuth();
  const [rows, setRows] = useState(() => listGovernedActionAudit());

  useEffect(() => {
    const refresh = () => setRows(listGovernedActionAudit());
    window.addEventListener('primovex:orb-governed-actions-changed', refresh);
    return () => window.removeEventListener('primovex:orb-governed-actions-changed', refresh);
  }, []);

  if (!can('audit.read') && !can('practiceAdmin.write')) return null;

  return (
    <section className="rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-surface)] p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="font-semibold">Governed Orb actions</h2>
          <p className="text-sm text-[color:var(--medtrak-muted)]">Management review foundation for proposals, confirmations, cancellations and completed checklist evidence on this device.</p>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-[color:var(--medtrak-muted)]"><tr><th className="pb-2">Status</th><th className="pb-2">Action</th><th className="pb-2">Asset</th><th className="pb-2">Created</th><th className="pb-2">Evidence</th></tr></thead>
          <tbody>
            {rows.slice(0, 50).map((row) => (
              <tr key={row.id} className="border-t border-[color:var(--medtrak-border)]">
                <td className="py-3 font-semibold capitalize">{row.status}</td>
                <td className="py-3">{row.kind === 'anaphylaxis' ? 'Anaphylaxis reconciliation' : 'Emergency-drug reconciliation'}</td>
                <td className="py-3">{row.entityName}</td>
                <td className="py-3">{displayTime(row.createdAt)}</td>
                <td className="py-3">{row.checkId ? `Checklist ${row.checkId}` : 'No checklist write'}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="5" className="py-6 text-center text-[color:var(--medtrak-muted)]">No governed Orb actions have been recorded on this device.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
