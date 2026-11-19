import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { ChevronLeft, FileText, Plus, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { identityLabel, identityProblems } from '@/modules/governance/patientIdentity';
import { DEFAULT_SORT, SORT_KEYS, completionProblem, duplicateWords, findLikelyDuplicates, localDay, sortSars } from '@/modules/governance/sarRegister';
import { useAuth } from '@/contexts/AuthContext';
import SarBell from '@/components/governance/SarBell';
import { useSarsToChase } from '@/modules/governance/useSarsToChase';
import { listStaffDirectory } from '@/services/staffDirectoryService';
import {
  SAR_CHECKLIST,
  SAR_COLLECTION,
  SAR_REQUESTED_BY_OPTIONS,
  SAR_REQUEST_TYPES,
  SAR_STATUSES,
  SAR_STATUS_LABELS,
  addSarNote,
  calculateDueDate,
  createSar,
  createSarReference,
  daysUntilDate,
  formatDateInput,
  getRequestedByDisplay,
  getSarActivity,
  getSarDeadlineTone,
  normaliseRequestedBy,
  toDate,
  updateSarChecklist,
  updateSarDetails,
  updateSarStatus,
} from '@/modules/governance/services/sarService';

// The Subject Access Requests register on the phone: the same records, checks and deadline
// colours as the desktop page, laid out like the phone Concerns page. People on the SAR team
// see and change every request; oversight (partners) can read them all; anyone else sees only
// requests assigned to them.

const RECEIVED_VIA = ['email', 'letter', 'in_person', 'telephone', 'solicitor', 'other'];
const FIELD = 'mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case';
const LABEL = 'block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]';

const friendly = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const actorFromUser = (user, displayName) => ({ uid: user?.uid || null, displayName: displayName || user?.email || 'Unknown', email: user?.email || null });
const dateLabel = (value) => { const d = toDate(value); return d ? d.toLocaleDateString('en-GB') : '—'; };
// getRequestedByDisplay gives { label, tag, isCompany }, not text: showing the object itself made React throw and the whole page go white. This is the words, e.g. "Acme Solicitors (company)".
export const requestedByText = (sar) => { const r = getRequestedByDisplay(sar); return r.tag ? `${r.label} (${r.tag.toLowerCase()})` : r.label; };
const isOpen = (sar) => ![SAR_STATUSES.completed, SAR_STATUSES.archived].includes(sar.status);

function metricsOf(rows) {
  const open = rows.filter(isOpen);
  return {
    open: open.length,
    overdue: open.filter((r) => (daysUntilDate(r.dueDate) ?? 999) < 0).length,
    dueWeek: open.filter((r) => { const d = daysUntilDate(r.dueDate); return d !== null && d >= 0 && d <= 7; }).length,
  };
}

function getInitialForm() {
  const today = new Date();
  return {
    reference: createSarReference(today), emisNumber: '', patientInitials: '', dateOfBirth: '', receivedDate: formatDateInput(today), dueDate: formatDateInput(calculateDueDate(today)), completedDate: '',
    requestedBy: 'patient', requestedByOther: '', receivedVia: 'email', solicitorReference: '', requestType: 'summary', requestOptions: [],
    informationRequired: '', consentToEmail: false, urgent: false, deliveryMethod: 'email', emailAddress: '',
    assignedToUid: '', assignedToName: 'Unassigned', managerUid: '', managerName: '', notes: '',
  };
}

function formFromSar(sar) {
  return {
    ...getInitialForm(),
    reference: sar.reference || '', emisNumber: sar.emisNumber || '', patientInitials: sar.patientInitials || '', dateOfBirth: sar.dateOfBirth || '',
    receivedDate: formatDateInput(toDate(sar.receivedDate)), dueDate: formatDateInput(toDate(sar.dueDate)), completedDate: localDay(sar.completedAt),
    ...normaliseRequestedBy(sar), receivedVia: sar.receivedVia || 'email', solicitorReference: sar.solicitorReference || '',
    requestType: sar.requestType || 'summary', requestOptions: sar.requestOptions || [], informationRequired: sar.informationRequired || '',
    consentToEmail: !!sar.consentToEmail, urgent: !!sar.urgent, deliveryMethod: sar.deliveryMethod || 'email', emailAddress: sar.emailAddress || '',
    assignedToUid: sar.assignedToUid || '', assignedToName: sar.assignedToName || 'Unassigned', managerUid: sar.managerUid || '', managerName: sar.managerName || '',
    notes: sar.notes || '',
  };
}

// `embedded`: the form is shown inside the SAR's own sheet (open a SAR and it is all there to read and change in one place) instead of in a sheet of its own.
function SarFormSheet({ sar, actor, staff, onClose, rows = [], embedded = false }) {
  const isEdit = Boolean(sar);
  const [form, setForm] = useState(() => (isEdit ? formFromSar(sar) : getInitialForm()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [differentRequest, setDifferentRequest] = useState(false); // ticked when a matching request today really is a different one
  const [savedNote, setSavedNote] = useState('');
  const resync = useRef(false); // after a save in the SAR's own sheet, take the values back from the saved record so "unsaved changes" is honest
  // another SAR for the same EMIS number entered today, or received the same day: probably the same request entered twice (only asked for a new SAR)
  const duplicates = useMemo(() => (isEdit ? [] : findLikelyDuplicates(rows, { emisNumber: form.emisNumber, receivedDate: form.receivedDate })), [isEdit, rows, form.emisNumber, form.receivedDate]);
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const staffName = (id) => staff.find((s) => s.id === id)?.label || 'Unassigned';

  // In the SAR's own sheet the status buttons (and the completion date they set) sit beside the form: keep the form's completion date in step with the record, so reopening a SAR there cannot quietly
  // complete it again the next time the form is saved. And after a save, show the record as it was saved.
  const recordCompleted = isEdit ? localDay(sar.completedAt) : '';
  useEffect(() => {
    if (!embedded || !isEdit) return;
    setForm((current) => (current.completedDate === recordCompleted ? current : { ...current, completedDate: recordCompleted }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordCompleted, sar?.status]);
  useEffect(() => {
    if (embedded && isEdit && resync.current) { resync.current = false; setForm(formFromSar(sar)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sar]);
  const dirty = embedded && isEdit && JSON.stringify(form) !== JSON.stringify(formFromSar(sar));

  const setReceived = (value) => {
    const received = value ? new Date(value) : new Date();
    const wasDefault = form.dueDate === formatDateInput(calculateDueDate(form.receivedDate ? new Date(form.receivedDate) : new Date()));
    update({ receivedDate: value, ...(wasDefault || !isEdit ? { dueDate: formatDateInput(calculateDueDate(received)) } : {}) });
  };

  async function submit() {
    // initials and date of birth are asked for on every new SAR; an older SAR that never had them can still be edited without
    const problems = identityProblems(form, { emisRequired: true, needed: !isEdit || Boolean(sar.patientInitials || sar.dateOfBirth) });
    if (problems.length) { setError(`${problems[0]} The patient's name is deliberately not stored.`); return; }
    if (form.requestedBy === 'company' && !form.requestedByOther.trim()) { setError('Enter the company name.'); return; }
    if (duplicates.length && !differentRequest) { setError('There is already a SAR for this EMIS number today. If this really is a different request, tick the box under the EMIS number.'); return; }
    const dateProblem = completionProblem({ completedDate: form.completedDate, receivedDate: form.receivedDate, today: localDay(new Date()) });
    if (dateProblem) { setError(dateProblem); return; }
    try {
      setBusy(true);
      setError('');
      if (isEdit) await updateSarDetails(sar.id, form, actor, sar);
      else await createSar(form, actor);
      if (embedded) { resync.current = true; setSavedNote('Saved.'); window.setTimeout(() => setSavedNote(''), 4000); } else onClose();
    } catch (err) {
      setError(err?.message || `Could not ${isEdit ? 'save' : 'create'} the SAR.`);
    } finally {
      setBusy(false);
    }
  }

  const inner = (
    <>
        {!embedded && <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />}
        {!embedded && <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Subject access request</p>
            <h2 className="mt-1 text-xl font-bold">{isEdit ? `Edit ${sar.reference}` : 'New SAR'}</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">EMIS number only, no patient names.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>}

        <div className={embedded ? 'space-y-3' : 'mt-4 space-y-3 pb-4'}>
          <label className={LABEL}>EMIS number
            <input value={form.emisNumber} onChange={(e) => { update({ emisNumber: e.target.value }); setDifferentRequest(false); }} inputMode="numeric" className={FIELD} />
          </label>
          {duplicates.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm" role="alert">
              <p className="font-bold">This looks like a request that has already been entered.</p>
              {duplicates.map((match) => <p key={match.id}>{duplicateWords(match)}</p>)}
              <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={differentRequest} onChange={(e) => setDifferentRequest(e.target.checked)} className="h-4 w-4" /> This is a different request, add it anyway</label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className={LABEL}>Patient initials
              <input value={form.patientInitials} onChange={(e) => update({ patientInitials: e.target.value.toUpperCase() })} placeholder="e.g. AB" maxLength={8} autoComplete="off" className={FIELD} />
            </label>
            <label className={LABEL}>Date of birth
              <input type="date" value={form.dateOfBirth} onChange={(e) => update({ dateOfBirth: e.target.value })} max={new Date().toISOString().slice(0, 10)} className={FIELD} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className={LABEL}>Received
              <input type="date" value={form.receivedDate} onChange={(e) => setReceived(e.target.value)} className={FIELD} />
            </label>
            <label className={LABEL}>Due
              <input type="date" value={form.dueDate} onChange={(e) => update({ dueDate: e.target.value })} className={FIELD} />
            </label>
          </div>
          <label className={LABEL}>Date completed
            <input type="date" value={form.completedDate} onChange={(e) => update({ completedDate: e.target.value })} min={form.receivedDate || undefined} max={localDay(new Date())} className={FIELD} />
            <span className="block text-[11px] font-normal normal-case">Leave blank until the response has gone. Filling it in marks the SAR as completed on that day.</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={LABEL}>Requested by
              <select value={form.requestedBy} onChange={(e) => update({ requestedBy: e.target.value })} className={FIELD}>
                {SAR_REQUESTED_BY_OPTIONS.map((o) => <option key={o} value={o}>{friendly(o)}</option>)}
              </select>
            </label>
            <label className={LABEL}>Received via
              <select value={form.receivedVia} onChange={(e) => update({ receivedVia: e.target.value })} className={FIELD}>
                {RECEIVED_VIA.map((o) => <option key={o} value={o}>{friendly(o)}</option>)}
              </select>
            </label>
          </div>
          {form.requestedBy === 'company' && (
            <label className={LABEL}>Company name
              <input value={form.requestedByOther} onChange={(e) => update({ requestedByOther: e.target.value })} maxLength={120} className={FIELD} />
            </label>
          )}
          <label className={LABEL}>What is requested
            <select value={form.requestType} onChange={(e) => update({ requestType: e.target.value, requestOptions: [] })} className={FIELD}>
              {SAR_REQUEST_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <label className={LABEL}>Information required
            <textarea value={form.informationRequired} onChange={(e) => update({ informationRequired: e.target.value })} rows={2} className={FIELD} />
          </label>
          <label className={LABEL}>Assigned to
            <select value={form.assignedToUid} onChange={(e) => update({ assignedToUid: e.target.value, assignedToName: e.target.value ? staffName(e.target.value) : 'Unassigned' })} className={FIELD}>
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-3 text-sm font-semibold">
            <input type="checkbox" checked={form.urgent} onChange={(e) => update({ urgent: e.target.checked })} className="h-4 w-4" /> Urgent
          </label>
          <label className={LABEL}>Notes
            <textarea value={form.notes} onChange={(e) => update({ notes: e.target.value })} rows={2} placeholder="Nothing that names the patient" className={FIELD} />
          </label>

          {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-600">{error}</p>}
          <button type="button" onClick={submit} disabled={busy || (embedded ? !dirty : (duplicates.length > 0 && !differentRequest))} className="w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3.5 font-bold text-white disabled:opacity-60">
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create SAR'}
          </button>
          {embedded && (
            <div className="flex items-center gap-3">
              {dirty && <button type="button" onClick={() => setForm(formFromSar(sar))} disabled={busy} className="rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold">Undo my changes</button>}
              <span className="text-sm text-[var(--medtrak-muted)]" role="status">{savedNote || (dirty ? 'You have changes that are not saved yet.' : 'Everything here is saved.')}</span>
            </div>
          )}
        </div>
    </>
  );

  if (embedded) return <div>{inner}</div>;
  return (
    <div className="pvx-mobile-sheet-backdrop backdrop-blur-sm" style={{ zIndex: 130 }} role="dialog" aria-modal="true">
      <section className="pvx-mobile-sheet px-5 pt-4 text-[var(--medtrak-text)]">
        {inner}
      </section>
    </div>
  );
}

function SarDetailSheet({ sar, actor, isTeam, chase, onChased, onClose, staff = [], rows = [] }) {
  const [activity, setActivity] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checklist, setChecklist] = useState(sar.checklist || {});

  const refresh = useCallback(() => getSarActivity(sar.id).then(setActivity).catch(console.error), [sar.id]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setChecklist(sar.checklist || {}); }, [sar.checklist]);

  const tone = getSarDeadlineTone(sar);
  const run = async (fn) => {
    try { setBusy(true); setError(''); await fn(); await refresh(); } catch (err) { setError(err?.message || 'That did not work.'); } finally { setBusy(false); }
  };
  const toggle = (key) => {
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    run(() => updateSarChecklist(sar.id, next, actor));
  };

  return (
    <div className="pvx-mobile-sheet-backdrop backdrop-blur-sm" style={{ zIndex: 120 }} role="dialog" aria-modal="true">
      <section className="pvx-mobile-sheet px-5 pt-4 text-[var(--medtrak-text)]">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Subject access request</p>
            <h2 className="mt-1 text-xl font-bold">{sar.reference}</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{identityLabel(sar, { withDob: true })} · {SAR_REQUEST_TYPES.find((t) => t.key === sar.requestType)?.label || sar.requestTypeLabel || 'Request'}</p>
          </div>
          <div className="flex items-center gap-2">
            <SarBell row={chase} onSent={onChased} compact />
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--medtrak-bg)] px-2 py-0.5 text-[10px] font-bold">{SAR_STATUS_LABELS[sar.status] || friendly(sar.status)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.status === 'critical' || tone.status === 'high' ? 'bg-rose-500/10 text-rose-600' : tone.status === 'warning' ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>{tone.label}</span>
          {sar.urgent && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600">Urgent</span>}
        </div>

        {isTeam ? (
          <div className="mt-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Details: change anything here and save</p><SarFormSheet embedded sar={sar} actor={actor} staff={staff} rows={rows} onClose={onClose} /></div>
        ) : (<>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">Received</dt><dd>{dateLabel(sar.receivedDate)}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">Due</dt><dd>{dateLabel(sar.dueDate)}</dd></div>
          {sar.completedAt && <div><dt className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">Completed</dt><dd>{dateLabel(sar.completedAt)}</dd></div>}
          <div><dt className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">Requested by</dt><dd>{requestedByText(sar)}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">Assigned to</dt><dd>{sar.assignedToName || 'Unassigned'}</dd></div>
        </dl>
        <div className="mt-3 space-y-2 text-sm">
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">Information requested</p>
            <p>{SAR_REQUEST_TYPES.find((t) => t.key === sar.requestType)?.label || sar.requestTypeLabel || 'Request'}</p>
            {(sar.requestOptions || []).length > 0 && <div className="mt-1 flex flex-wrap gap-1.5">{(sar.requestOptions || []).map((option) => <span key={option} className="rounded-full border border-[var(--medtrak-border)] px-2.5 py-0.5 text-xs">{option}</span>)}</div>}
          </div>
          {sar.informationRequired && <div><p className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">Additional details</p><p className="whitespace-pre-wrap">{sar.informationRequired}</p></div>}
          {sar.notes && <div><p className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">Internal notes</p><p className="whitespace-pre-wrap">{sar.notes}</p></div>}
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">Delivery</p>
            <p>{friendly(sar.deliveryMethod || 'email')}{sar.consentToEmail ? ' · consent to email recorded' : ''}{sar.emailAddress ? ` · ${sar.emailAddress}` : ''}</p>
          </div>
          {sar.solicitorReference && <div><p className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">Solicitor reference</p><p>{sar.solicitorReference}</p></div>}
        </div>
        </>)}

        {isTeam && (
          <div className="mt-4 space-y-3 pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Status</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Object.values(SAR_STATUSES).map((status) => (
                  <button key={status} type="button" disabled={busy || sar.status === status} onClick={() => run(() => updateSarStatus(sar.id, status, actor))}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold ${sar.status === status ? 'border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white' : 'border-[var(--medtrak-border)]'}`}>{SAR_STATUS_LABELS[status]}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Checks</p>
              <div className="mt-1 space-y-1.5">
                {SAR_CHECKLIST.map((item) => (
                  <label key={item.key} className="flex items-center gap-3 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-semibold">
                    <input type="checkbox" checked={Boolean(checklist[item.key])} disabled={busy} onChange={() => toggle(item.key)} className="h-4 w-4" /> {item.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Add a note</p>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Nothing that names the patient" className={FIELD} />
              <button type="button" disabled={busy || !note.trim()} onClick={() => run(async () => { await addSarNote(sar.id, note, actor); setNote(''); })} className="mt-2 rounded-xl bg-[var(--medtrak-accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Add note</button>
            </div>
            {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-600">{error}</p>}
          </div>
        )}

        <div className="pb-6">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Activity</p>
          <div className="mt-1 space-y-1.5">
            {activity.length === 0 ? <p className="text-sm text-[var(--medtrak-muted)]">Nothing recorded yet.</p> : activity.slice(0, 30).map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2">
                <p className="text-sm font-semibold">{item.title || friendly(item.type)}</p>
                {item.message && <p className="text-xs text-[var(--medtrak-muted)]">{item.message}</p>}
                <p className="mt-0.5 text-[10px] text-[var(--medtrak-muted)]">{item.actorName || item.actor?.displayName || ''} · {dateLabel(item.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function MobileGovernanceSARs() {
  const navigate = useNavigate();
  const { user, displayName, can } = useAuth();
  const actor = useMemo(() => actorFromUser(user, displayName), [user, displayName]);
  const isTeam = can('governance.manageSars');
  const chase = useSarsToChase();
  const isPartner = !isTeam && can('governance.partnerAccess');
  const seesAll = isTeam || isPartner;
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, sar = edit
  const [error, setError] = useState('');
  const [sort, setSort] = useState(DEFAULT_SORT); // { key, dir }: the register has always shown the newest entry first

  useEffect(() => {
    if (!user?.uid) return undefined;
    // People outside the SAR team and oversight can only list requests assigned to them (the rules say so too).
    const q = seesAll
      ? query(collection(db, SAR_COLLECTION), orderBy('createdAt', 'desc'), limit(500))
      : query(collection(db, SAR_COLLECTION), where('assignedToUid', '==', user.uid));
    return onSnapshot(q, (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (err) => { console.error(err); setError(err?.message || 'Could not load SARs.'); });
  }, [seesAll, user?.uid]);

  useEffect(() => {
    if (!isTeam) return;
    listStaffDirectory().then(setStaff).catch((err) => console.error('Could not load the staff list', err));
  }, [isTeam]);

  const metrics = useMemo(() => metricsOf(rows), [rows]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sortSars(rows, sort).filter((r) => {
      if (term && ![r.reference, r.emisNumber, r.patientInitials, r.assignedToName, requestedByText(r)].some((v) => String(v || '').toLowerCase().includes(term))) return false;
      if (filter === 'all') return true;
      if (filter === 'completed') return !isOpen(r);
      if (!isOpen(r)) return false;
      if (filter === 'overdue') return (daysUntilDate(r.dueDate) ?? 999) < 0;
      if (filter === 'week') { const d = daysUntilDate(r.dueDate); return d !== null && d >= 0 && d <= 7; }
      return true;
    });
  }, [rows, filter, search, sort]);
  const selected = rows.find((r) => r.id === selectedId) || null;

  if (!seesAll && rows.length === 0) {
    return (
      <main className="pvx-mobile-page pvx-mobile-stack">
        <section className="pvx-mobile-card text-center">
          <FileText className="mx-auto h-8 w-8 text-[var(--medtrak-muted)]" />
          <p className="mt-2 font-bold">No SARs assigned to you</p>
          <p className="mt-1 text-sm text-[var(--medtrak-muted)]">The SAR team can assign a request to you to work on.</p>
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
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Governance</p>
            <h1 className="pvx-mobile-title">SARs</h1>
          </div>
          {isTeam && <button type="button" onClick={() => setEditing({})} className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--medtrak-accent)] text-white" aria-label="New SAR"><Plus className="h-5 w-5" /></button>}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[['Open', metrics.open], ['Overdue', metrics.overdue], ['Due this week', metrics.dueWeek]].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2"><p className="text-lg font-black">{value}</p><p className="text-[10px] uppercase text-[var(--medtrak-muted)]">{label}</p></div>
          ))}
        </div>

        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reference, EMIS, who" className="mt-3 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-semibold">
          <option value="open">Open</option>
          <option value="overdue">Overdue</option>
          <option value="week">Due this week</option>
          <option value="completed">Completed</option>
          <option value="all">All</option>
        </select>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <select value={sort.key} onChange={(e) => setSort({ key: e.target.value, dir: e.target.value === 'entered' || e.target.value === 'completed' ? 'desc' : 'asc' })} aria-label="Sort by" className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-semibold">
            {Object.entries(SORT_KEYS).map(([key, value]) => <option key={key} value={key}>Sort: {value.label}</option>)}
          </select>
          <button type="button" onClick={() => setSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })} aria-label="Reverse the order" className="rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold">{sort.dir === 'asc' ? '↑' : '↓'}</button>
        </div>
        <p className="mt-1 text-[11px] text-[var(--medtrak-muted)]">{SORT_KEYS[sort.key][sort.dir]}</p>
      </section>

      {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-600">{error}</p>}

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--medtrak-border)] p-6 text-center text-sm text-[var(--medtrak-muted)]">No matching SARs.</p>
        ) : filtered.map((sar) => {
          const tone = getSarDeadlineTone(sar);
          // an urgent request still being dealt with stands out: a red edge and tint
          const urgent = sar.urgent === true && ![SAR_STATUSES.completed, SAR_STATUSES.archived].includes(sar.status);
          return (
            <button key={sar.id} type="button" onClick={() => setSelectedId(sar.id)} className={`w-full rounded-2xl border p-3.5 text-left ${urgent ? "border-rose-500 border-l-8 bg-rose-500/10" : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{sar.reference}</p>
                  <p className="mt-0.5 text-xs text-[var(--medtrak-muted)]">{identityLabel(sar)} · {requestedByText(sar)}</p>
                </div>
                {urgent && <span className="shrink-0 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white">Urgent</span>}
              </div>
              <p className="mt-1.5 text-sm text-[var(--medtrak-muted)]">{sar.assignedToName || 'Unassigned'}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-[var(--medtrak-bg)] px-2 py-0.5 text-[10px] font-bold">{SAR_STATUS_LABELS[sar.status] || friendly(sar.status)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.status === 'critical' || tone.status === 'high' ? 'bg-rose-500/10 text-rose-600' : tone.status === 'warning' ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>{tone.label}</span>
                {sar.completedAt && !isOpen(sar) && <span className="rounded-full bg-[var(--medtrak-bg)] px-2 py-0.5 text-[10px] font-bold">Completed {dateLabel(sar.completedAt)}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {selected && !editing && <SarDetailSheet sar={selected} actor={actor} isTeam={isTeam} chase={chase.byId.get(selected.id)} onChased={() => chase.reload()} onClose={() => setSelectedId('')} staff={staff} rows={rows} />}
      {editing && isTeam && <SarFormSheet sar={editing.id ? editing : null} actor={actor} staff={staff} rows={rows} onClose={() => setEditing(null)} />}
    </main>
  );
}
