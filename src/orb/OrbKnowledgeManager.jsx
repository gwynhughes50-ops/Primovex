import { useEffect, useState } from 'react';
import { BookOpen, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { hasCapability } from '@/core/identity/capabilities';
import { orbKnowledgeStore } from './OrbKnowledgeStore';

function EntryForm({ initial, onSave, onCancel, busy }) {
  const [question, setQuestion] = useState(initial?.question || '');
  const [answer, setAnswer] = useState(initial?.answer || '');
  const [keywords, setKeywords] = useState((initial?.keywords || []).join(', '));
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!question.trim() || !answer.trim()) { setError('Both a question and an answer are required.'); return; }
    setError('');
    try {
      await onSave({ question: question.trim(), answer: answer.trim(), keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean) });
    } catch (err) {
      setError(err?.message || 'Could not save this entry.');
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-4">
      <label className="block space-y-1 text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]">
        Question Orb should recognise
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Who do I call for an IT problem?" className="mt-1 w-full rounded-lg border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm font-normal normal-case" />
      </label>
      <label className="block space-y-1 text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]">
        Answer
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="What Orb should say back" className="mt-1 w-full rounded-lg border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm font-normal normal-case" />
      </label>
      <label className="block space-y-1 text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]">
        Extra phrasings (comma-separated, optional)
        <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="e.g. IT support, computer broken, laptop issue" className="mt-1 w-full rounded-lg border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm font-normal normal-case" />
      </label>
      {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--medtrak-border)] px-3 py-2 text-xs font-semibold">Cancel</button>
        <button type="submit" disabled={busy} className="rounded-lg bg-[var(--medtrak-accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

export default function OrbKnowledgeManager() {
  const { capabilities, user, displayName } = useAuth();
  const canManage = hasCapability(capabilities, 'orb.learning.review') || hasCapability(capabilities, 'admin.manageSettings');
  const [entries, setEntries] = useState(() => orbKnowledgeStore.list());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);

  useEffect(() => {
    const refresh = () => setEntries(orbKnowledgeStore.list());
    window.addEventListener('primovex:orb-knowledge-changed', refresh);
    return () => window.removeEventListener('primovex:orb-knowledge-changed', refresh);
  }, []);

  const actor = displayName || user?.email || null;

  async function handleCreate(payload) {
    setBusy(true);
    try { await orbKnowledgeStore.create(payload, actor); setAdding(false); }
    finally { setBusy(false); }
  }

  async function handleUpdate(id, payload) {
    setBusy(true);
    try { await orbKnowledgeStore.update(id, payload, actor); setEditingId(null); }
    finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this taught entry? Orb will no longer answer with it.')) return;
    await orbKnowledgeStore.remove(id);
  }

  async function handleSync() {
    setSyncing(true);
    try { await orbKnowledgeStore.refresh(); setSyncedAt(new Date()); }
    finally { setSyncing(false); }
  }

  return (
    <section className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-[var(--medtrak-accent)]" />
          <div>
            <h2 className="font-bold">Teach Orb</h2>
            <p className="text-sm text-[var(--medtrak-muted)]">Practice-specific facts and FAQs Orb answers directly when no data lookup applies.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={handleSync} disabled={syncing} className="inline-flex items-center gap-1 rounded-lg border border-[var(--medtrak-border)] px-3 py-2 text-xs font-semibold disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          {canManage && !adding && (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-lg bg-[var(--medtrak-accent)] px-3 py-2 text-xs font-semibold text-white">
              <Plus className="h-4 w-4" /> Add
            </button>
          )}
        </div>
      </div>

      {syncedAt && <p className="mt-2 text-xs text-[var(--medtrak-muted)]">Synced {syncedAt.toLocaleTimeString('en-GB')} · {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} loaded</p>}

      {adding && <EntryForm busy={busy} onCancel={() => setAdding(false)} onSave={handleCreate} />}

      <div className="mt-4 space-y-3">
        {entries.length === 0 && !adding && (
          <p className="rounded-xl border border-dashed border-[var(--medtrak-border)] p-6 text-center text-sm text-[var(--medtrak-muted)]">Nothing taught yet — add a fact above.</p>
        )}
        {entries.map((entry) => (
          <article key={entry.id} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-4">
            {editingId === entry.id ? (
              <EntryForm initial={entry} busy={busy} onCancel={() => setEditingId(null)} onSave={(payload) => handleUpdate(entry.id, payload)} />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{entry.question}</p>
                  <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{entry.answer}</p>
                  {entry.keywords?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {entry.keywords.map((keyword) => <span key={keyword} className="rounded-full bg-[var(--medtrak-accent)]/10 px-2 py-0.5 text-[11px] text-[var(--medtrak-accent)]">{keyword}</span>)}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-[var(--medtrak-muted)]">Taught by {entry.createdBy || 'unknown'} · {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('en-GB') : ''}</p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => setEditingId(entry.id)} aria-label="Edit" className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--medtrak-border)]"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => handleDelete(entry.id)} aria-label="Delete" className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/40 text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
