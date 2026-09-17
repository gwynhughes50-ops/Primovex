import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeUsers } from '@/services/adminUserService';
import {
  CONCERN_PRIORITIES,
  CONCERN_SOURCES,
  CONCERN_CATEGORIES,
  CONCERN_STAGES,
  CONCERN_STATUSES,
  acknowledgeConcern,
  addConcernQuickNote,
  addInvolvedUser,
  addLearningAction,
  calculateCaseHealth,
  closeConcern,
  createConcern,
  createConcernReference,
  friendly,
  formatDateInput,
  getConcernMetrics,
  getDeadlineTone,
  recordListeningDiscussion,
  removeInvolvedUser,
  subscribeConcernTimeline,
  subscribeConcerns,
  subscribeLearningActions,
  toDate,
  updateConcern,
} from '@/modules/governance/services/concernService';

function actorFromUser(user, displayName) {
  return { uid: user?.uid || null, displayName: displayName || user?.email || 'Unknown', email: user?.email || null };
}

function getInitialForm() {
  const today = new Date();
  return {
    reference: createConcernReference(today),
    emisNumber: '',
    patientInitials: '',
    dateOfBirth: '',
    source: 'patient',
    receivedAt: formatDateInput(today),
    category: 'communication',
    priority: CONCERN_PRIORITIES.low,
    summary: '',
    desiredOutcome: '',
    ownerUid: '',
    ownerName: 'Unassigned',
    namedContactName: '',
  };
}

function StageProgress({ status }) {
  const currentIndex = Math.max(0, CONCERN_STAGES.findIndex((stage) => stage.key === status));
  return (
    <div className="space-y-1.5">
      {CONCERN_STAGES.map((stage, index) => {
        const active = index <= currentIndex;
        return (
          <div key={stage.key} className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold ${active ? 'border-teal-400/30 bg-teal-500/10 text-teal-700' : 'border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] text-[var(--medtrak-muted)]'}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-teal-500' : 'bg-[var(--medtrak-border)]'}`} />
            <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Step {index + 1}</span>
            <span>{stage.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function NewConcernSheet({ actor, onClose, onCreated, users }) {
  const [form, setForm] = useState(getInitialForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  const chooseOwner = (uid) => {
    const selected = users.find((u) => u.id === uid);
    update({ ownerUid: uid, ownerName: selected?.displayName || selected?.email || 'Unassigned' });
  };

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await createConcern(form, actor);
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to create concern.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pvx-mobile-sheet-backdrop backdrop-blur-sm" style={{ zIndex: 130 }} role="dialog" aria-modal="true">
      <section className="pvx-mobile-sheet px-5 pt-4 text-[var(--medtrak-text)]">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Listening to People</p>
            <h2 className="mt-1 text-xl font-bold">New concern</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Anonymised identifiers only — no patient names.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--medtrak-border)]"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 space-y-3 pb-4">
          <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">EMIS number
            <input value={form.emisNumber} onChange={(e) => update({ emisNumber: e.target.value })} placeholder="Preferred identifier" className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Initials if no EMIS
              <input value={form.patientInitials} onChange={(e) => update({ patientInitials: e.target.value.toUpperCase() })} placeholder="A.B." className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case" />
            </label>
            <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">DOB if no EMIS
              <input type="date" value={form.dateOfBirth} onChange={(e) => update({ dateOfBirth: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case" />
            </label>
          </div>
          <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Source
            <select value={form.source} onChange={(e) => update({ source: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case">
              {CONCERN_SOURCES.map((option) => <option key={option} value={option}>{friendly(option)}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Category
            <select value={form.category} onChange={(e) => update({ category: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case">
              {CONCERN_CATEGORIES.map((option) => <option key={option} value={option}>{friendly(option)}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Traffic light priority
            <select value={form.priority} onChange={(e) => update({ priority: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case">
              <option value="low">LOW — early resolution likely</option>
              <option value="medium">MED — investigation likely</option>
              <option value="high">HIGH — patient safety / external / serious harm</option>
            </select>
          </label>
          <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Owner
            <select value={form.ownerUid} onChange={(e) => chooseOwner(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case">
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.email || u.id}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Named contact for complainant
            <input value={form.namedContactName} onChange={(e) => update({ namedContactName: e.target.value })} placeholder="Who the person raising this can ask for" className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case" />
          </label>
          <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Anonymised summary
            <textarea value={form.summary} onChange={(e) => update({ summary: e.target.value })} rows={3} placeholder="Brief factual summary. Do not include patient name." className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case" />
          </label>
          <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Desired outcome
            <textarea value={form.desiredOutcome} onChange={(e) => update({ desiredOutcome: e.target.value })} rows={2} placeholder="What would help, where known" className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case" />
          </label>

          {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-600">{error}</p>}

          <button type="button" onClick={submit} disabled={busy} className="w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3.5 font-bold text-white disabled:opacity-60">{busy ? 'Creating…' : 'Create concern'}</button>
        </div>
      </section>
    </div>
  );
}

function ConcernDetailSheet({ concern, actor, onClose, isTeam, isPartner, users }) {
  const [timeline, setTimeline] = useState([]);
  const [learning, setLearning] = useState([]);
  const [learningTitle, setLearningTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [addUserId, setAddUserId] = useState('');

  useEffect(() => {
    if (!concern?.id) return undefined;
    const unsubTimeline = subscribeConcernTimeline(concern.id, setTimeline, console.error);
    const unsubLearning = subscribeLearningActions(concern.id, setLearning, console.error);
    return () => { unsubTimeline?.(); unsubLearning?.(); };
  }, [concern?.id]);

  if (!concern) return null;
  const health = calculateCaseHealth(concern);
  const deadline = getDeadlineTone(concern);
  const involvedIds = concern.involvedUserIds || [];
  const involvedUsers = involvedIds.map((uid) => users.find((u) => u.id === uid) || { id: uid, displayName: uid });
  const addableUsers = users.filter((u) => !involvedIds.includes(u.id));

  async function addLearning() {
    if (!learningTitle.trim()) return;
    await addLearningAction(concern.id, { title: learningTitle.trim() }, actor);
    setLearningTitle('');
  }

  async function submitNote() {
    if (!noteText.trim()) return;
    await addConcernQuickNote(concern.id, noteText.trim(), actor);
    setNoteText('');
  }

  async function shareWithUser() {
    if (!addUserId) return;
    await addInvolvedUser(concern.id, addUserId, actor);
    setAddUserId('');
  }

  async function reassignOwner(uid) {
    const selected = users.find((u) => u.id === uid);
    await updateConcern(concern.id, { ownerUid: uid, ownerName: selected?.displayName || selected?.email || 'Unassigned' }, actor);
  }

  return (
    <div className="pvx-mobile-sheet-backdrop backdrop-blur-sm" style={{ zIndex: 125 }} role="dialog" aria-modal="true">
      <section className="pvx-mobile-sheet max-h-[90vh] overflow-y-auto px-5 pt-4 text-[var(--medtrak-text)]">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">{concern.reference}</p>
            <h2 className="mt-1 text-xl font-bold">{friendly(concern.status)}</h2>
            <p className="mt-1 text-xs text-[var(--medtrak-muted)]">{concern.emisNumber ? `EMIS ${concern.emisNumber}` : `${concern.patientInitials || 'Initials?'} · DOB ${concern.dateOfBirth || '?'}`}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--medtrak-border)]"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--medtrak-border)] px-3 py-1 text-xs font-bold uppercase">{String(concern.priority || 'low')}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${deadline.status === 'critical' ? 'bg-rose-500/10 text-rose-600' : deadline.status === 'warning' ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>{deadline.label}</span>
          <span className="rounded-full bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-700">Case health {health}%</span>
        </div>

        {concern.summary && <p className="mt-3 text-sm text-[var(--medtrak-muted)]">{concern.summary}</p>}

        {isTeam ? (
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Owner</label>
            <select value={concern.ownerUid || ''} onChange={(e) => reassignOwner(e.target.value)} className="flex-1 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-2 py-1.5 text-sm">
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.email || u.id}</option>)}
            </select>
          </div>
        ) : (
          <p className="mt-3 text-xs text-[var(--medtrak-muted)]">Owner: {concern.ownerName || 'Unassigned'}</p>
        )}

        <div className="mt-4"><StageProgress status={concern.status} /></div>

        {isTeam && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => acknowledgeConcern(concern, actor)} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-2.5 text-sm font-semibold">Mark acknowledged</button>
            <button type="button" onClick={() => recordListeningDiscussion(concern, actor, false)} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-2.5 text-sm font-semibold">Listening offered</button>
            <button type="button" onClick={() => recordListeningDiscussion(concern, actor, true)} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-2.5 text-sm font-semibold">Listening completed</button>
            <button type="button" onClick={() => updateConcern(concern.id, { status: CONCERN_STATUSES.early_resolution }, actor)} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-2.5 text-sm font-semibold">Move to early resolution</button>
            <button type="button" onClick={() => updateConcern(concern.id, { status: CONCERN_STATUSES.investigation }, actor)} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-2.5 text-sm font-semibold">Move to investigation</button>
            <button type="button" onClick={() => updateConcern(concern.id, { status: CONCERN_STATUSES.response }, actor)} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-2.5 text-sm font-semibold">Move to response</button>
            <button type="button" onClick={() => updateConcern(concern.id, { status: CONCERN_STATUSES.learning }, actor)} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-2.5 text-sm font-semibold">Move to learning</button>
            <button type="button" onClick={() => closeConcern(concern, actor)} className="rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-white">Close case</button>
          </div>
        )}

        {isTeam && (
          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Shared with</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {involvedUsers.length === 0 ? <p className="text-xs text-[var(--medtrak-muted)]">Not shared with anyone yet.</p> : involvedUsers.map((u) => (
                <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-2.5 py-1 text-xs font-semibold">
                  {u.displayName || u.email || u.id}
                  <button type="button" onClick={() => removeInvolvedUser(concern.id, u.id, actor)} aria-label={`Remove ${u.displayName || u.id}`}>×</button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="flex-1 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm">
                <option value="">Add a staff member…</option>
                {addableUsers.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.email || u.id}</option>)}
              </select>
              <button type="button" onClick={shareWithUser} disabled={!addUserId} className="rounded-xl bg-[var(--medtrak-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Share</button>
            </div>
          </div>
        )}

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Learning actions</p>
          {isTeam && (
            <div className="mt-2 flex gap-2">
              <input value={learningTitle} onChange={(e) => setLearningTitle(e.target.value)} placeholder="Add learning action" className="flex-1 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm" />
              <button type="button" onClick={addLearning} className="rounded-xl bg-[var(--medtrak-accent)] px-3 py-2 text-sm font-semibold text-white">Add</button>
            </div>
          )}
          <div className="mt-2 space-y-1.5">
            {learning.length === 0 ? <p className="text-xs text-[var(--medtrak-muted)]">No learning actions recorded yet.</p> : learning.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2.5 text-sm">{item.title}</div>
            ))}
          </div>
        </div>

        <div className="mt-5 pb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Case timeline</p>
          {!isPartner && (
            <div className="mt-2 flex gap-2">
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a quick note" className="flex-1 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm" />
              <button type="button" onClick={submitNote} className="rounded-xl bg-[var(--medtrak-accent)] px-3 py-2 text-sm font-semibold text-white">Add</button>
            </div>
          )}
          <div className="mt-2 space-y-1.5">
            {timeline.length === 0 ? <p className="text-xs text-[var(--medtrak-muted)]">No timeline events yet.</p> : timeline.map((event) => {
              const date = toDate(event.createdAt);
              return (
                <div key={event.id} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{event.title}</span><span className="text-xs text-[var(--medtrak-muted)]">{date ? date.toLocaleDateString('en-GB') : ''}</span></div>
                  {event.message && <p className="mt-1 text-xs text-[var(--medtrak-muted)]">{event.message}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function MobileGovernanceConcerns() {
  const navigate = useNavigate();
  const { user, displayName, can } = useAuth();
  const actor = useMemo(() => actorFromUser(user, displayName), [user, displayName]);
  const isTeam = can('governance.concernsTeam');
  const isPartner = !isTeam && can('governance.partnerAccess');
  const involvedOnly = !isTeam && !isPartner;
  const [concerns, setConcerns] = useState([]);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('open');
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => subscribeConcerns(setConcerns, console.error, involvedOnly ? { involvedUid: user?.uid } : {}), [involvedOnly, user?.uid]);

  useEffect(() => {
    if (!isTeam) return undefined;
    return subscribeUsers(setUsers, console.error);
  }, [isTeam]);

  const metrics = useMemo(() => getConcernMetrics(concerns), [concerns]);
  const filtered = useMemo(() => {
    if (filter === 'all') return concerns;
    if (filter === 'closed') return concerns.filter((c) => c.status === CONCERN_STATUSES.closed);
    if (filter === 'high') return concerns.filter((c) => c.priority === CONCERN_PRIORITIES.high);
    if (filter === 'overdue') return concerns.filter((c) => getDeadlineTone(c).status === 'critical');
    return concerns.filter((c) => ![CONCERN_STATUSES.closed, CONCERN_STATUSES.archived].includes(c.status));
  }, [concerns, filter]);

  const selected = concerns.find((c) => c.id === selectedId) || null;

  if (involvedOnly && concerns.length === 0) {
    return (
      <main className="pvx-mobile-page pvx-mobile-stack">
        <section className="pvx-mobile-card text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-[var(--medtrak-muted)]" />
          <p className="mt-2 font-bold">Nothing shared with you yet</p>
          <p className="mt-1 text-sm text-[var(--medtrak-muted)]">The Concerns team can share a case with you to follow its progress and add notes.</p>
          <button type="button" onClick={() => navigate('/dashboard')} className="mt-4 rounded-xl border border-[var(--medtrak-border)] px-4 py-2.5 text-sm font-semibold">Back home</button>
        </section>
      </main>
    );
  }

  return (
    <main className="pvx-mobile-page pvx-mobile-stack">
      <section className="pvx-mobile-card">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/dashboard')} className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Listening to People</p>
            <h1 className="pvx-mobile-title">Concerns</h1>
          </div>
          {isTeam && <button type="button" onClick={() => setCreating(true)} className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--medtrak-accent)] text-white" aria-label="New concern"><Plus className="h-5 w-5" /></button>}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2"><p className="text-lg font-black">{metrics.open}</p><p className="text-[10px] uppercase text-[var(--medtrak-muted)]">Open</p></div>
          <div className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2"><p className="text-lg font-black">{metrics.high}</p><p className="text-[10px] uppercase text-[var(--medtrak-muted)]">High</p></div>
          <div className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2"><p className="text-lg font-black">{metrics.dueWeek}</p><p className="text-[10px] uppercase text-[var(--medtrak-muted)]">Due this week</p></div>
        </div>

        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-3 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-semibold">
          <option value="open">Open</option>
          <option value="overdue">Due / overdue</option>
          <option value="high">High</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </select>
      </section>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--medtrak-border)] p-6 text-center text-sm text-[var(--medtrak-muted)]">No matching concerns.</p>
        ) : filtered.map((concern) => {
          const deadline = getDeadlineTone(concern);
          return (
            <button key={concern.id} type="button" onClick={() => setSelectedId(concern.id)} className="w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3.5 text-left">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{concern.reference}</p>
                  <p className="mt-0.5 text-xs text-[var(--medtrak-muted)]">{concern.emisNumber ? `EMIS ${concern.emisNumber}` : `${concern.patientInitials || 'Initials?'} · DOB ${concern.dateOfBirth || '?'}`}</p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--medtrak-border)] px-2 py-0.5 text-[10px] font-bold uppercase">{String(concern.priority || 'low')}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm text-[var(--medtrak-muted)]">{concern.summary || 'No summary'}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-[var(--medtrak-bg)] px-2 py-0.5 text-[10px] font-bold">{friendly(concern.status)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${deadline.status === 'critical' ? 'bg-rose-500/10 text-rose-600' : deadline.status === 'warning' ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>{deadline.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {selected && <ConcernDetailSheet concern={selected} actor={actor} onClose={() => setSelectedId('')} isTeam={isTeam} isPartner={isPartner} users={users} />}
      {creating && isTeam && <NewConcernSheet actor={actor} onClose={() => setCreating(false)} onCreated={() => {}} users={users} />}
    </main>
  );
}
