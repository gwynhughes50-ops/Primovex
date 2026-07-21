import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";

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
  daysUntilDate,
  formatDateInput,
  getRequestTypeLabel,
  getSarActivity,
  getSarDeadlineTone,
  getSarStatusBadge,
  getStatusLabel,
  toDate,
  updateSarChecklist,
  updateSarStatus,
} from "@/modules/governance/services/sarService";

const requestedByOptions = ["patient", "parent", "solicitor", "executor", "court", "other"];
const receivedViaOptions = ["email", "letter", "in_person", "telephone", "solicitor", "other"];
const deliveryOptions = ["email", "collection", "recorded_post", "other"];
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

function getInitialForm() {
  const today = new Date();
  return {
    reference: createSarReference(today),
    emisNumber: "",
    receivedDate: formatDateInput(today),
    dueDate: formatDateInput(calculateDueDate(today)),
    requestedBy: "patient",
    receivedVia: "email",
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

function NewSarPanel({ open, onClose, users, actor, onCreated }) {
  const [form, setForm] = useState(getInitialForm);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(getInitialForm());
  }, [open]);

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

  const changeReceivedDate = (value) => {
    const received = value ? new Date(value) : new Date();
    update({ receivedDate: value, dueDate: formatDateInput(calculateDueDate(received)) });
  };

  const submit = async () => {
    if (!form.emisNumber.trim()) {
      alert("EMIS number is required. We are deliberately not storing patient names or DOBs.");
      return;
    }

    try {
      setBusy(true);
      await createSar(form, actor);
      onCreated?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      alert(err?.message || "Failed to create SAR");
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
            <h2 className="mt-3 text-2xl font-black text-white">New Subject Access Request</h2>
            <p className="mt-1 text-sm text-slate-400">Only operational information is stored. Patient name and DOB stay out of MedTrak+.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
            Close
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Reference</label>
            <Input value={form.reference} onChange={(e) => update({ reference: e.target.value })} />
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

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Received Via</label>
            <select value={form.receivedVia} onChange={(e) => update({ receivedVia: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
              {receivedViaOptions.map((option) => <option key={option} value={option}>{friendly(option)}</option>)}
            </select>
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
            {busy ? "Creating..." : "Create SAR"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SarDetailPanel({ sar, actor, onClose }) {
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
          <button type="button" onClick={onClose} className="rounded-full bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Close</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Request Summary" className="lg:col-span-2">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-slate-500">Received</span><div className="font-semibold text-white">{formatDisplayDate(sar.receivedDate)}</div></div>
              <div><span className="text-slate-500">Due</span><div className="font-semibold text-white">{formatDisplayDate(sar.dueDate)}</div></div>
              <div><span className="text-slate-500">Requested by</span><div className="font-semibold text-white">{friendly(sar.requestedBy)}</div></div>
              <div><span className="text-slate-500">Received via</span><div className="font-semibold text-white">{friendly(sar.receivedVia)}</div></div>
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
                <Button key={status} type="button" variant="outline" disabled={busy} onClick={() => setStatus(status)} className="w-full justify-start rounded-xl border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-800">
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
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add internal note" />
                <Button type="button" onClick={addNote} disabled={busy || !note.trim()} className="rounded-xl bg-teal-400 font-bold text-slate-950 hover:bg-teal-300">Add</Button>
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
  const { user, displayName } = useAuth();
  const actor = useMemo(() => actorFromUser(user, displayName), [user, displayName]);
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const qSars = query(collection(db, SAR_COLLECTION), orderBy("createdAt", "desc"), limit(250));
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

  const metrics = useMemo(() => countMetrics(rows), [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((sar) => {
      const status = sar.status || SAR_STATUSES.new;
      const days = daysUntilDate(sar.dueDate);
      const completed = status === SAR_STATUSES.completed || status === SAR_STATUSES.archived;
      if (filter === "open" && completed) return false;
      if (filter === "completed" && !completed) return false;
      if (filter === "overdue" && !(days !== null && days < 0 && !completed)) return false;
      if (filter === "due_week" && !(days !== null && days >= 0 && days <= 7 && !completed)) return false;
      if (!term) return true;
      return [sar.reference, sar.emisNumber, sar.requestTypeLabel, sar.assignedToName, sar.informationRequired]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [rows, filter, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Icons.sar}
        eyebrow="Governance Suite"
        title="Subject Access Requests"
        description="Track SARs without storing patient names or dates of birth. EMIS number only, clear ownership, countdowns, audit trail and Inbox reminders."
        actions={<Button type="button" onClick={() => setShowNew(true)} className="rounded-full bg-teal-400 px-4 font-bold text-slate-950 hover:bg-teal-300"><Icons.add className="mr-2 h-4 w-4" />New SAR</Button>}
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
                      <td className="py-3 pr-3"><Button type="button" size="sm" variant="outline" onClick={() => setSelected(sar)} className="rounded-full border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-800">Open</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <NewSarPanel open={showNew} onClose={() => setShowNew(false)} users={users} actor={actor} onCreated={() => setFilter("open")} />
      <SarDetailPanel sar={selected} actor={actor} onClose={() => setSelected(null)} />
    </div>
  );
}
