import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { FolderOpen, Folder, FolderPlus, Pencil, Trash2, X } from "lucide-react";

import PageHeader from "@/components/common/PageHeader";
import SectionCard from "@/components/common/SectionCard";
import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Icons } from "@/config/medtrakIcons";
import {
  SAR_CHECKLIST,
  SAR_COLLECTION,
  SAR_REQUEST_TYPES,
  SAR_STATUSES,
  addSarNote,
  calculateDueDate,
  createSar,
  createSarReference,
  createSarYearFolder,
  deleteSar,
  deleteSarYearFolder,
  daysUntilDate,
  formatDateInput,
  getRequestTypeLabel,
  getSarActivity,
  getSarDeadlineTone,
  getSarStatusBadge,
  getStatusLabel,
  isValidSarYear,
  subscribeSarYearFolders,
  toDate,
  updateSarChecklist,
  updateSarDetails,
  updateSarStatus,
} from "@/modules/governance/services/sarService";

const requestedByOptions = ["patient", "parent", "solicitor", "executor", "court", "other"];
const receivedViaOptions = ["email", "letter", "in_person", "telephone", "solicitor", "other"];
const deliveryOptions = ["email", "collection", "other"];
const statusFilters = ["all", "open", "due_week", "overdue", "completed"];

function friendly(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function actorFromUser(user, displayName) {
  return {
    uid: user?.uid || null,
    displayName: displayName || user?.email || "Unknown",
    email: user?.email || null,
  };
}

function formatDisplayDate(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString() : "—";
}

// `year` is the folder the person is looking at: a SAR added from inside
// another year's folder starts on 1 January of that year (change it as needed)
// rather than silently landing in this year's folder.
function getInitialForm(year) {
  const today = new Date();
  const received = year && year !== today.getFullYear() ? new Date(Date.UTC(year, 0, 1)) : today;
  return {
    reference: createSarReference(today),
    emisNumber: "",
    receivedDate: formatDateInput(received),
    dueDate: formatDateInput(calculateDueDate(received)),
    requestedBy: "patient",
    requestedByOther: "",
    receivedVia: "email",
    solicitorReference: "",
    requestType: "summary",
    requestOptions: [],
    informationRequired: "",
    consentToEmail: false,
    urgent: false,
    deliveryMethod: "email",
    emailAddress: "",
    assignedToUid: "",
    assignedToName: "Unassigned",
    managerUid: "",
    managerName: "",
    notes: "",
  };
}

function getFormFromSar(sar) {
  return {
    ...getInitialForm(),
    reference: sar.reference || "",
    emisNumber: sar.emisNumber || "",
    receivedDate: formatDateInput(toDate(sar.receivedDate)),
    dueDate: formatDateInput(toDate(sar.dueDate)),
    requestedBy: sar.requestedBy || "patient",
    requestedByOther: sar.requestedByOther || "",
    receivedVia: sar.receivedVia || "email",
    solicitorReference: sar.solicitorReference || "",
    requestType: sar.requestType || "summary",
    requestOptions: sar.requestOptions || [],
    informationRequired: sar.informationRequired || "",
    consentToEmail: !!sar.consentToEmail,
    urgent: !!sar.urgent,
    deliveryMethod: sar.deliveryMethod || "email",
    emailAddress: sar.emailAddress || "",
    assignedToUid: sar.assignedToUid || "",
    assignedToName: sar.assignedToName || "Unassigned",
    managerUid: sar.managerUid || "",
    managerName: sar.managerName || "",
    notes: sar.notes || "",
  };
}

// The "folder" a SAR lives in: the year it was received (falling back to when
// it was entered, for the odd record with no received date).
function sarYear(sar) {
  const d = toDate(sar.receivedDate) || toDate(sar.createdAt);
  return d ? d.getFullYear() : null;
}

function countMetrics(rows) {
  const now = new Date();
  const openRows = rows.filter((r) => ![SAR_STATUSES.completed, SAR_STATUSES.archived].includes(r.status));
  const completed = rows.filter((r) => r.status === SAR_STATUSES.completed);
  const overdue = openRows.filter((r) => (daysUntilDate(r.dueDate, now) ?? 999) < 0);
  const dueWeek = openRows.filter((r) => {
    const days = daysUntilDate(r.dueDate, now);
    return days !== null && days >= 0 && days <= 7;
  });
  const urgent = openRows.filter((r) => !!r.urgent);

  const completedThisMonth = completed.filter((r) => {
    const d = toDate(r.completedAt);
    if (!d) return false;
    const n = new Date();
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  });

  return { open: openRows.length, overdue: overdue.length, dueWeek: dueWeek.length, urgent: urgent.length, completedThisMonth: completedThisMonth.length };
}

function SarMetric({ label, value, tone = "slate" }) {
  const tones = {
    emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    rose: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    sky: "border-sky-400/30 bg-sky-500/10 text-sky-100",
    slate: "border-slate-800 bg-slate-900/70 text-slate-100",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] || tones.slate}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </div>
  );
}

function SarFormPanel({ open, onClose, users, actor, onSaved, sar, defaultYear = null }) {
  const isEdit = !!sar;
  const [form, setForm] = useState(getInitialForm);
  const [busy, setBusy] = useState(false);

  // Keyed on the SAR's id, not the object: live snapshots hand back a new
  // object whenever anything on the register changes, which must not wipe
  // what someone is halfway through typing.
  useEffect(() => {
    if (open) setForm(isEdit ? getFormFromSar(sar) : getInitialForm(defaultYear));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sar?.id]);

  if (!open) return null;

  const selectedType = SAR_REQUEST_TYPES.find((type) => type.key === form.requestType) || SAR_REQUEST_TYPES[0];

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  const toggleOption = (option) => {
    setForm((current) => {
      const currentOptions = current.requestOptions || [];
      const next = currentOptions.includes(option)
        ? currentOptions.filter((item) => item !== option)
        : [...currentOptions, option];
      return { ...current, requestOptions: next };
    });
  };

  const chooseAssignedUser = (uid) => {
    const selected = users.find((u) => u.id === uid);
    update({ assignedToUid: uid, assignedToName: selected?.displayName || selected?.email || "Unassigned" });
  };

  const chooseManager = (uid) => {
    const selected = users.find((u) => u.id === uid);
    update({ managerUid: uid, managerName: selected?.displayName || selected?.email || "" });
  };

  // Changing the received date moves the due date with it — unless this is an
  // edit and the due date has been set by hand (e.g. an agreed extension), in
  // which case it's left alone.
  const changeReceivedDate = (value) => {
    const received = value ? new Date(value) : new Date();
    const currentDefaultDue = formatDateInput(calculateDueDate(form.receivedDate ? new Date(form.receivedDate) : new Date()));
    if (isEdit && form.dueDate !== currentDefaultDue) {
      update({ receivedDate: value });
      return;
    }
    update({ receivedDate: value, dueDate: formatDateInput(calculateDueDate(received)) });
  };

  const submit = async () => {
    if (!form.emisNumber.trim()) {
      alert("EMIS number is required. We are deliberately not storing patient names or DOBs.");
      return;
    }

    if (form.requestedBy === "other" && !form.requestedByOther.trim()) {
      alert("Enter who the request is from (a company, solicitor firm or organisation).");
      return;
    }

    try {
      setBusy(true);
      if (isEdit) await updateSarDetails(sar.id, form, actor, sar);
      else await createSar(form, actor);
      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      alert(err?.message || `Failed to ${isEdit ? "save" : "create"} SAR`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-0 sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl sm:max-w-4xl sm:rounded-3xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-200">
              <Icons.governance className="h-3.5 w-3.5" /> Governance
            </div>
            <h2 className="mt-3 text-2xl font-black text-white">{isEdit ? `Edit ${sar.reference}` : "New Subject Access Request"}</h2>
            <p className="mt-1 text-sm text-slate-400">Only operational information is stored. Patient name and DOB stay out of Primovex.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
            Close
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Reference</label>
            <Input value={form.reference} onChange={(e) => update({ reference: e.target.value })} disabled={isEdit} />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">EMIS Number</label>
            <Input value={form.emisNumber} onChange={(e) => update({ emisNumber: e.target.value })} placeholder="EMIS number only" />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Date Received</label>
            <Input type="date" value={form.receivedDate} onChange={(e) => changeReceivedDate(e.target.value)} />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Due Date</label>
            <Input type="date" value={form.dueDate} onChange={(e) => update({ dueDate: e.target.value })} />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Requested By</label>
            <select value={form.requestedBy} onChange={(e) => update({ requestedBy: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
              {requestedByOptions.map((option) => <option key={option} value={option}>{friendly(option)}</option>)}
            </select>
          </div>

          {form.requestedBy === "other" && (
            <div className="space-y-3 lg:col-span-2">
              <label className="block text-sm font-semibold text-slate-200">Who is the request from?</label>
              <Input
                value={form.requestedByOther}
                onChange={(e) => update({ requestedByOther: e.target.value })}
                maxLength={120}
                placeholder="e.g. company, solicitor firm or organisation name"
              />
              <p className="text-xs text-slate-500">Use an organisation or firm name. Keep patient names out of Primovex.</p>
            </div>
          )}

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Received Via</label>
            <select value={form.receivedVia} onChange={(e) => update({ receivedVia: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
              {receivedViaOptions.map((option) => <option key={option} value={option}>{friendly(option)}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Solicitor Reference</label>
            <Input value={form.solicitorReference} onChange={(e) => update({ solicitorReference: e.target.value })} placeholder="Their file/case reference, if requested via a solicitor" />
          </div>

          <div className="space-y-3 lg:col-span-2">
            <label className="block text-sm font-semibold text-slate-200">Information Requested</label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SAR_REQUEST_TYPES.map((type) => (
                <button
                  key={type.key}
                  type="button"
                  onClick={() => update({ requestType: type.key, requestOptions: [] })}
                  className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${
                    form.requestType === type.key ? "border-teal-400 bg-teal-400/10 text-teal-100" : "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <label className="block text-sm font-semibold text-slate-200">Common options for {selectedType.label}</label>
            <div className="flex flex-wrap gap-2">
              {selectedType.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleOption(option)}
                  className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                    form.requestOptions.includes(option) ? "border-teal-400 bg-teal-400/10 text-teal-100" : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <label className="block text-sm font-semibold text-slate-200">Additional Details</label>
            <textarea
              value={form.informationRequired}
              onChange={(e) => update({ informationRequired: e.target.value })}
              placeholder="Optional free-text detail, e.g. include ADHD referral and recent mental health letters."
              rows={3}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white placeholder:text-slate-500"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Assigned To</label>
            <select value={form.assignedToUid} onChange={(e) => chooseAssignedUser(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.email || u.id}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Manager for Escalation</label>
            <select value={form.managerUid} onChange={(e) => chooseManager(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
              <option value="">None selected yet</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.email || u.id}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Delivery Method</label>
            <select value={form.deliveryMethod} onChange={(e) => update({ deliveryMethod: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
              {deliveryOptions.map((option) => <option key={option} value={option}>{friendly(option)}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Email Address</label>
            <Input value={form.emailAddress} onChange={(e) => update({ emailAddress: e.target.value })} placeholder="Only if consent to email is recorded" />
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-200">
            <input type="checkbox" checked={form.consentToEmail} onChange={(e) => update({ consentToEmail: e.target.checked })} />
            Consent to email recorded
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-200">
            <input type="checkbox" checked={form.urgent} onChange={(e) => update({ urgent: e.target.checked })} />
            Mark as urgent
          </label>

          <div className="space-y-3 lg:col-span-2">
            <label className="block text-sm font-semibold text-slate-200">Internal Notes</label>
            <textarea value={form.notes} onChange={(e) => update({ notes: e.target.value })} rows={3} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white" />
          </div>
        </div>

        <div className="sticky bottom-0 -mx-5 mt-5 flex flex-col gap-2 border-t border-slate-800 bg-slate-950/95 p-5 backdrop-blur sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="rounded-full border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" className="rounded-full bg-teal-400 px-5 font-bold text-slate-950 hover:bg-teal-300" onClick={submit} disabled={busy}>
            {busy ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save changes" : "Create SAR")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SarDetailPanel({ sar, actor, isTeam, canDelete, onEdit, onDelete, onClose }) {
  const [activity, setActivity] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [checklist, setChecklist] = useState(sar?.checklist || {});

  useEffect(() => {
    setChecklist(sar?.checklist || {});
    if (!sar?.id) return;
    getSarActivity(sar.id).then(setActivity).catch((err) => console.error(err));
  }, [sar]);

  if (!sar) return null;

  const refreshActivity = async () => {
    const rows = await getSarActivity(sar.id);
    setActivity(rows);
  };

  const saveChecklist = async (nextChecklist) => {
    setChecklist(nextChecklist);
    await updateSarChecklist(sar.id, nextChecklist, actor);
    await refreshActivity();
  };

  const setStatus = async (status) => {
    try {
      setBusy(true);
      await updateSarStatus(sar.id, status, actor);
      await refreshActivity();
    } catch (err) {
      console.error(err);
      alert("Failed to update SAR");
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    try {
      setBusy(true);
      await addSarNote(sar.id, note, actor);
      setNote("");
      await refreshActivity();
    } catch (err) {
      console.error(err);
      alert("Failed to add note");
    } finally {
      setBusy(false);
    }
  };

  const tone = getSarDeadlineTone(sar);
  const completedChecks = SAR_CHECKLIST.filter((item) => checklist?.[item.key]).length;

  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-0 sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl sm:max-w-5xl sm:rounded-3xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={getSarStatusBadge(sar.status)}>{getStatusLabel(sar.status)}</StatusBadge>
              <StatusBadge status={tone.status}>{tone.label}</StatusBadge>
              {sar.urgent && <StatusBadge status="critical">Urgent</StatusBadge>}
            </div>
            <h2 className="mt-3 text-2xl font-black text-white">{sar.reference}</h2>
            <p className="mt-1 text-sm text-slate-400">EMIS: {sar.emisNumber} · {sar.requestTypeLabel || getRequestTypeLabel(sar.requestType)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isTeam && (
              <button type="button" onClick={() => onEdit?.(sar)} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={() => onDelete?.(sar)} title="Delete SAR" aria-label="Delete SAR" className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-200 hover:bg-rose-500/20">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-full bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Close</button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Request Summary" className="lg:col-span-2">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-slate-500">Received</span><div className="font-semibold text-white">{formatDisplayDate(sar.receivedDate)}</div></div>
              <div><span className="text-slate-500">Due</span><div className="font-semibold text-white">{formatDisplayDate(sar.dueDate)}</div></div>
              <div><span className="text-slate-500">Requested by</span><div className="font-semibold text-white">{sar.requestedBy === "other" && sar.requestedByOther ? `${sar.requestedByOther} (other)` : friendly(sar.requestedBy)}</div></div>
              <div><span className="text-slate-500">Received via</span><div className="font-semibold text-white">{friendly(sar.receivedVia)}</div></div>
              <div><span className="text-slate-500">Solicitor ref</span><div className="font-semibold text-white">{sar.solicitorReference || "—"}</div></div>
              <div><span className="text-slate-500">Assigned to</span><div className="font-semibold text-white">{sar.assignedToName || "Unassigned"}</div></div>
              <div><span className="text-slate-500">Manager</span><div className="font-semibold text-white">{sar.managerName || "Not set"}</div></div>
            </div>

            {(sar.requestOptions || []).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {(sar.requestOptions || []).map((option) => <span key={option} className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-200">{option}</span>)}
              </div>
            )}

            {sar.informationRequired && <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">{sar.informationRequired}</p>}
            {sar.notes && <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-400">Notes: {sar.notes}</p>}
          </SectionCard>

          <SectionCard title="Workflow">
            <div className="space-y-2">
              {[SAR_STATUSES.assigned, SAR_STATUSES.in_progress, SAR_STATUSES.quality_check, SAR_STATUSES.completed].map((status) => (
                <Button key={status} type="button" variant="outline" disabled={busy || !isTeam} onClick={() => setStatus(status)} className="w-full justify-start rounded-xl border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-800">
                  {getStatusLabel(status)}
                </Button>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SectionCard title={`Completion Checklist (${completedChecks}/${SAR_CHECKLIST.length})`}>
            <div className="space-y-2">
              {SAR_CHECKLIST.map((item) => (
                <label key={item.key} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={!!checklist?.[item.key]}
                    disabled={!isTeam}
                    onChange={(e) => saveChecklist({ ...checklist, [item.key]: e.target.checked })}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Timeline">
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add internal note" disabled={!isTeam} />
                <Button type="button" onClick={addNote} disabled={busy || !note.trim() || !isTeam} className="rounded-xl bg-teal-400 font-bold text-slate-950 hover:bg-teal-300">Add</Button>
              </div>
              {activity.length === 0 ? <p className="text-sm text-slate-400">No activity yet.</p> : activity.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-white">{row.title}</div>
                    <div className="text-xs text-slate-500">{formatDisplayDate(row.createdAt)}</div>
                  </div>
                  <p className="mt-1 text-slate-400">{row.message}</p>
                  <p className="mt-1 text-xs text-slate-500">{row.actorName}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default function GovernanceSARs() {
  const { user, displayName, can } = useAuth();
  const isTeam = can("governance.manageSars");
  const actor = useMemo(() => actorFromUser(user, displayName), [user, displayName]);
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Defaults to every year: an overdue SAR from last year must never be
  // hidden inside another year's folder by default.
  const [yearFilter, setYearFilter] = useState("all");
  const [folderYears, setFolderYears] = useState([]);
  const [addingYear, setAddingYear] = useState(false);
  const [newYear, setNewYear] = useState("");
  const [yearError, setYearError] = useState("");
  const canDelete = isTeam;

  useEffect(() => {
    const qSars = query(collection(db, SAR_COLLECTION), orderBy("createdAt", "desc"), limit(2000));
    const unsub = onSnapshot(
      qSars,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(err?.message || String(err));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const qUsers = query(collection(db, "users"));
    const unsub = onSnapshot(qUsers, (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, []);

  useEffect(() => subscribeSarYearFolders(setFolderYears, (err) => console.error("SAR year folders", err)), []);

  const metrics = useMemo(() => countMetrics(rows), [rows]);
  const selected = useMemo(() => rows.find((row) => row.id === selectedId) || null, [rows, selectedId]);

  const yearOptions = useMemo(() => {
    const counts = new Map();
    rows.forEach((row) => {
      const year = sarYear(row);
      if (year) counts.set(year, (counts.get(year) || 0) + 1);
    });
    const thisYear = new Date().getFullYear();
    if (!counts.has(thisYear)) counts.set(thisYear, 0);
    folderYears.forEach((year) => { if (!counts.has(year)) counts.set(year, 0); });
    return [...counts.entries()].sort((a, b) => b[0] - a[0]);
  }, [rows, folderYears]);

  const addYearFolder = async () => {
    const year = Number(String(newYear).trim());
    if (!isValidSarYear(year)) {
      setYearError(`Enter a four-digit year between 2000 and ${new Date().getFullYear() + 10}.`);
      return;
    }
    try {
      await createSarYearFolder(year, actor);
      setYearFilter(String(year));
      setAddingYear(false);
      setNewYear("");
      setYearError("");
    } catch (err) {
      console.error(err);
      setYearError(err?.message || "Couldn't add that year.");
    }
  };

  const removeYearFolder = async (year) => {
    try {
      await deleteSarYearFolder(year);
      if (yearFilter === String(year)) setYearFilter("all");
    } catch (err) {
      console.error(err);
      alert(err?.message || "Couldn't remove that year.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteBusy(true);
      await deleteSar(deleteTarget, actor);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      alert(err?.message || "Failed to delete SAR");
    } finally {
      setDeleteBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((sar) => {
      const status = sar.status || SAR_STATUSES.new;
      const days = daysUntilDate(sar.dueDate);
      const completed = status === SAR_STATUSES.completed || status === SAR_STATUSES.archived;
      if (yearFilter !== "all" && String(sarYear(sar)) !== yearFilter) return false;
      if (filter === "open" && completed) return false;
      if (filter === "completed" && !completed) return false;
      if (filter === "overdue" && !(days !== null && days < 0 && !completed)) return false;
      if (filter === "due_week" && !(days !== null && days >= 0 && days <= 7 && !completed)) return false;
      if (!term) return true;
      return [sar.reference, sar.emisNumber, sar.requestTypeLabel, sar.assignedToName, sar.informationRequired, sar.solicitorReference]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [rows, filter, search, yearFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Icons.sar}
        eyebrow="Governance Suite"
        title="Subject Access Requests"
        description="Track SARs without storing patient names or dates of birth. EMIS number only, clear ownership, countdowns, audit trail and Inbox reminders."
        actions={isTeam && <Button type="button" onClick={() => setShowNew(true)} className="rounded-full bg-teal-400 px-4 font-bold text-slate-950 hover:bg-teal-300"><Icons.add className="mr-2 h-4 w-4" />New SAR</Button>}
      />

      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SarMetric label="Open" value={metrics.open} tone="sky" />
        <SarMetric label="Due This Week" value={metrics.dueWeek} tone="amber" />
        <SarMetric label="Overdue" value={metrics.overdue} tone="rose" />
        <SarMetric label="Urgent" value={metrics.urgent} tone="amber" />
        <SarMetric label="Completed This Month" value={metrics.completedThisMonth} tone="emerald" />
      </section>

      <SectionCard
        title="SAR Register"
        description="Use structured request types for reporting, but keep a free-text detail field for unusual requests."
        actions={<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reference, EMIS, assigned user..." className="w-full sm:w-80" />}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Year</span>
          <button
            type="button"
            onClick={() => setYearFilter("all")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${yearFilter === "all" ? "bg-teal-400 text-slate-950" : "bg-slate-900 text-slate-300 hover:bg-slate-800"}`}
          >
            <FolderOpen className="h-4 w-4" /> All years <span className="opacity-70">{rows.length}</span>
          </button>
          {yearOptions.map(([year, count]) => {
            const active = yearFilter === String(year);
            const removable = isTeam && count === 0 && folderYears.includes(year) && year !== new Date().getFullYear();
            return (
              <span key={year} className={`inline-flex items-center rounded-full text-sm font-semibold transition ${active ? "bg-teal-400 text-slate-950" : "bg-slate-900 text-slate-300 hover:bg-slate-800"}`}>
                <button type="button" onClick={() => setYearFilter(String(year))} className={`inline-flex items-center gap-2 py-2 pl-4 ${removable ? "pr-2" : "pr-4"}`}>
                  <Folder className="h-4 w-4" /> {year} <span className="opacity-70">{count}</span>
                </button>
                {removable && (
                  <button type="button" onClick={() => removeYearFolder(year)} title={`Remove the empty ${year} folder`} aria-label={`Remove the empty ${year} folder`} className="mr-2 rounded-full p-1 hover:bg-black/10">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            );
          })}
          {isTeam && !addingYear && (
            <button type="button" onClick={() => { setAddingYear(true); setYearError(""); }} className="inline-flex items-center gap-2 rounded-full border border-dashed border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">
              <FolderPlus className="h-4 w-4" /> Add year
            </button>
          )}
          {isTeam && addingYear && (
            <span className="inline-flex items-center gap-2">
              <Input
                autoFocus
                inputMode="numeric"
                maxLength={4}
                value={newYear}
                onChange={(e) => { setNewYear(e.target.value.replace(/\D/g, "")); setYearError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") addYearFolder(); if (e.key === "Escape") { setAddingYear(false); setNewYear(""); } }}
                placeholder={`e.g. ${new Date().getFullYear() + 1}`}
                aria-label="Year for the new folder"
                className="h-9 w-28"
              />
              <Button type="button" size="sm" onClick={addYearFolder} className="rounded-full bg-teal-400 font-bold text-slate-950 hover:bg-teal-300">Add</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingYear(false); setNewYear(""); setYearError(""); }} className="rounded-full">Cancel</Button>
            </span>
          )}
          {yearError && <span className="text-xs text-rose-300">{yearError}</span>}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {statusFilters.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === key ? "bg-teal-400 text-slate-950" : "bg-slate-900 text-slate-300 hover:bg-slate-800"}`}
            >
              {key === "due_week" ? "Due This Week" : friendly(key)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-400">Loading SARs...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950 p-6 text-sm text-slate-400">No SARs match this view.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="py-3 pr-3">Reference</th>
                  <th className="py-3 pr-3">EMIS</th>
                  <th className="py-3 pr-3">Type</th>
                  <th className="py-3 pr-3">Assigned</th>
                  <th className="py-3 pr-3">Due</th>
                  <th className="py-3 pr-3">Countdown</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 pr-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sar) => {
                  const tone = getSarDeadlineTone(sar);
                  return (
                    <tr key={sar.id} className="border-b border-slate-900 text-slate-200 hover:bg-slate-900/60">
                      <td className="py-3 pr-3 font-bold text-white">{sar.reference}</td>
                      <td className="py-3 pr-3">{sar.emisNumber}</td>
                      <td className="py-3 pr-3">{sar.requestTypeLabel || getRequestTypeLabel(sar.requestType)}</td>
                      <td className="py-3 pr-3">{sar.assignedToName || "Unassigned"}</td>
                      <td className="py-3 pr-3">{formatDisplayDate(sar.dueDate)}</td>
                      <td className={`py-3 pr-3 font-semibold ${tone.className}`}>{tone.label}</td>
                      <td className="py-3 pr-3"><StatusBadge status={getSarStatusBadge(sar.status)}>{getStatusLabel(sar.status)}</StatusBadge></td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setSelectedId(sar.id)} className="rounded-full border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-800">Open</Button>
                          {isTeam && (
                            <button type="button" onClick={() => setEditing(sar)} title="Edit SAR" aria-label={`Edit ${sar.reference}`} className="rounded-full border border-slate-700 bg-slate-950 p-2 text-slate-200 hover:bg-slate-800">
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button type="button" onClick={() => setDeleteTarget(sar)} title="Delete SAR" aria-label={`Delete ${sar.reference}`} className="rounded-full border border-rose-500/40 bg-rose-500/10 p-2 text-rose-200 hover:bg-rose-500/20">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SarFormPanel open={showNew} onClose={() => setShowNew(false)} users={users} actor={actor} defaultYear={yearFilter === "all" ? null : Number(yearFilter)} onSaved={() => { setFilter("open"); setYearFilter("all"); }} />
      <SarFormPanel open={!!editing} sar={editing} onClose={() => setEditing(null)} users={users} actor={actor} />
      <SarDetailPanel sar={selected} actor={actor} isTeam={isTeam} canDelete={canDelete} onEdit={setEditing} onDelete={setDeleteTarget} onClose={() => setSelectedId(null)} />

      {deleteTarget && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4">
          <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-slate-950 p-5 shadow-2xl">
            <h3 className="text-lg font-black text-rose-200">Delete {deleteTarget.reference}?</h3>
            <p className="mt-2 text-sm text-slate-300">Are you sure you want to delete this SAR? It will be removed from the register and can't be brought back. A record that it was deleted, and by whom, is kept in the audit log.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" className="rounded-full" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button disabled={deleteBusy} onClick={confirmDelete} className="rounded-full bg-rose-500 text-white hover:bg-rose-600">
                {deleteBusy ? "Deleting..." : "Yes, delete it"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
