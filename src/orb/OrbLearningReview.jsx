import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { hasCapability } from '@/core/identity/capabilities';
import { getClinicalIntent } from './clinicalIntentCatalog';
import { orbIntentLearningStore } from './IntentLearningStore';

export default function OrbLearningReview() {
  const { capabilities, user } = useAuth();
  const canReview = hasCapability(capabilities, 'orb.learning.review') || hasCapability(capabilities, 'admin.manageSettings');
  const [records, setRecords] = useState(() => orbIntentLearningStore.list());
  useEffect(() => { const refresh = () => setRecords(orbIntentLearningStore.list()); window.addEventListener('primovex:orb-learning-changed', refresh); return () => window.removeEventListener('primovex:orb-learning-changed', refresh); }, []);
  const pending = useMemo(() => records.filter((record) => record.status === 'pending'), [records]);
  const review = (id, status) => { orbIntentLearningStore.review(id, { status, reviewerId: user?.uid || null }); setRecords(orbIntentLearningStore.list()); };
  return <section className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-[var(--medtrak-accent)]"/><div><h2 className="font-bold">Orb learning review</h2><p className="text-sm text-[var(--medtrak-muted)]">Governed practice-language suggestions. Orb never adopts a phrase silently.</p></div></div><span className="rounded-full border border-[var(--medtrak-border)] px-2 py-1 text-xs font-bold">{pending.length} pending</span></div>
    <div className="mt-4 space-y-3">{records.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--medtrak-border)] p-6 text-center text-sm text-[var(--medtrak-muted)]">No learning suggestions yet.</p> : records.slice(0, 30).map((record) => { const intent = getClinicalIntent(record.selectedIntent); return <article key={record.id} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-accent)]">{record.status}</p><p className="mt-1 font-semibold">“{record.phrase}”</p><p className="mt-1 text-sm text-[var(--medtrak-muted)]">Expected: {intent?.label || record.selectedIntent}</p><p className="mt-1 text-xs text-[var(--medtrak-muted)]">Suggested by {record.suggestedBy?.role || 'unknown role'} · {new Date(record.createdAt).toLocaleString()}</p></div>{record.status === 'pending' && canReview && <div className="flex gap-2"><button type="button" onClick={() => review(record.id, 'approved')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-500"><CheckCircle2 className="h-4 w-4"/>Approve</button><button type="button" onClick={() => review(record.id, 'rejected')} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-500"><XCircle className="h-4 w-4"/>Reject</button></div>}</div></article>; })}</div>
  </section>;
}
