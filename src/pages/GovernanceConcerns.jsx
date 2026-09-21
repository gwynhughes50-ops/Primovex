import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";

import PageHeader from "@/components/common/PageHeader";
import SectionCard from "@/components/common/SectionCard";
import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icons } from "@/config/medtrakIcons";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeUsers } from "@/services/adminUserService";
import ConcernMeetings from "@/modules/governance/components/ConcernMeetings";
import { printConcernSummary } from "@/modules/governance/services/concernPrint";
import {
  CONCERN_CATEGORIES,
  CONCERN_OUTCOME_LABELS,
  CONCERN_OUTCOMES,
  CONCERN_PRIORITIES,
  CONCERN_RAISED_BY_CONTACT_METHODS,
  CONCERN_SOURCES,
  CONCERN_STAGES,
  CONCERN_STATUSES,
  CORRESPONDENCE_TYPES,
  acknowledgeConcern,
  addConcernCorrespondence,
  addConcernQuickNote,
  addInvolvedUser,
  LFE_REPORT_STATUSES,
  addLearningAction,
  buildGovernancePrompts,
  calculateCaseHealth,
  closeConcern,
  createConcern,
  createConcernReference,
  deleteConcern,
  extendConcernDeadline,
  friendly,
  formatDateInput,
  getConcernMetrics,
  getDeadlineTone,
  getPriorityBadge,
  getStatusBadge,
  recordListeningDiscussion,
  removeInvolvedUser,
  subscribeConcernCorrespondence,
  subscribeConcernTimeline,
  subscribeConcerns,
  subscribeLearningActions,
  toDate,
  updateConcern,
  updateConcernDetails,
  updateConcernOutcome,
  updateLfeReportStatus,
} from "@/modules/governance/services/concernService";

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
    reference: createConcernReference(today),
    emisNumber: "",
    patientInitials: "",
    dateOfBirth: "",
    source: "patient",
    raisedByInitials: "",
    raisedByContactMethod: "none",
    raisedByContactValue: "",
    externalReference: "",
    receivedAt: formatDateInput(today),
    acknowledgementDueAt: "",
    earlyResolutionDueAt: "",
    finalResponseDueAt: "",
    category: "communication",
    priority: CONCERN_PRIORITIES.low,
    summary: "",
    desiredOutcome: "",
    ownerUid: "",
    ownerName: "Unassigned",
    namedContactName: "",
    earlyResolutionSuitable: true,
    dutyOfCandourConsidered: false,
    dutyOfCandourTriggered: false,
    clinicalReviewRequired: false,
    mddusRequired: false,
    gmpiReference: "",
    learningRequired: true,
  };
}

function MetricCard({ label, value, tone = "slate", helper }) {
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
      {helper && <p className="mt-1 text-xs opacity-75">{helper}</p>}
    </div>
  );
}

function StageProgress({ status }) {
  const currentIndex = Math.max(0, CONCERN_STAGES.findIndex((stage) => stage.key === status));
  return (
    <div className="space-y-1.5">
      {CONCERN_STAGES.map((stage, index) => {
        const active = index <= currentIndex;
        return (
          <div key={stage.key} className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold ${active ? "border-teal-400/30 bg-teal-500/10 text-teal-100" : "border-slate-800 bg-slate-950/60 text-slate-400"}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-teal-300" : "bg-slate-600"}`} />
            <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-500">Step {index + 1}</span>
            <span>{stage.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function getFormFromConcern(concern) {
  return {
    ...getInitialForm(),
    reference: concern.reference || "",
    emisNumber: concern.emisNumber || "",
    patientInitials: concern.patientInitials || "",
    dateOfBirth: concern.dateOfBirth || "",
    source: concern.source || "patient",
    raisedByInitials: concern.raisedByInitials || "",
    raisedByContactMethod: concern.raisedByContactMethod || "none",
    raisedByContactValue: concern.raisedByContactValue || "",
    externalReference: concern.externalReference || "",
    receivedAt: formatDateInput(toDate(concern.receivedAt)) || getInitialForm().receivedAt,
    category: concern.category || "communication",
    priority: concern.priority || CONCERN_PRIORITIES.low,
    summary: concern.summary || "",
    desiredOutcome: concern.desiredOutcome || "",
    ownerUid: concern.ownerUid || "",
    ownerName: concern.ownerName || "Unassigned",
    namedContactName: concern.namedContactName || "",
    earlyResolutionSuitable: !!concern.earlyResolutionSuitable,
    dutyOfCandourConsidered: !!concern.dutyOfCandourConsidered,
    dutyOfCandourTriggered: !!concern.dutyOfCandourTriggered,
    clinicalReviewRequired: !!concern.clinicalReviewRequired,
    mddusRequired: !!concern.mddusRequired,
    gmpiReference: concern.gmpiReference || "",
  };
}

function ConcernFormModal({ open, onClose, actor, onCreated, users, concern }) {
  const isEdit = !!concern;
  const [form, setForm] = useState(getInitialForm);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(isEdit ? getFormFromConcern(concern) : getInitialForm());
  }, [open, concern, isEdit]);

  if (!open) return null;
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  const chooseOwner = (uid) => {
    const selected = users.find((u) => u.id === uid);
    update({ ownerUid: uid, ownerName: selected?.displayName || selected?.email || "Unassigned" });
  };

  const submit = async () => {
    try {
      setBusy(true);
      if (isEdit) {
        await updateConcernDetails(concern.id, form, actor);
      } else {
        await createConcern(form, actor);
      }
      onCreated?.();
      onClose?.();
    } catch (err) {
      alert(err?.message || `Failed to ${isEdit ? "save" : "create"} concern`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-0 sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl sm:max-w-5xl sm:rounded-3xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-200">
              <Icons.governance className="h-3.5 w-3.5" /> Listening to People
            </div>
            <h2 className="mt-3 text-2xl font-black text-white">{isEdit ? `Edit ${concern.reference}` : "New Governance Concern"}</h2>
            <p className="mt-1 text-sm text-slate-400">MedTrak+ stores anonymised identifiers only. Use EMIS number first, or initials and DOB if EMIS is unavailable.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Close</button>
        </div>

        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          Patient name is deliberately not collected. Keep summaries anonymised and factual.
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="space-y-2"><label className="text-sm font-semibold text-slate-200">Reference</label><Input value={form.reference} onChange={(e) => update({ reference: e.target.value })} /></div>
          <div className="space-y-2"><label className="text-sm font-semibold text-slate-200">EMIS Number</label><Input value={form.emisNumber} onChange={(e) => update({ emisNumber: e.target.value })} placeholder="Preferred identifier" /></div>
          <div className="space-y-2"><label className="text-sm font-semibold text-slate-200">Initials if no EMIS</label><Input value={form.patientInitials} onChange={(e) => update({ patientInitials: e.target.value.toUpperCase() })} placeholder="e.g. A.B." /></div>
          <div className="space-y-2"><label className="text-sm font-semibold text-slate-200">DOB if no EMIS</label><Input type="date" value={form.dateOfBirth} onChange={(e) => update({ dateOfBirth: e.target.value })} /></div>
          <div className="space-y-2"><label className="text-sm font-semibold text-slate-200">Date received</label><Input type="date" value={form.receivedAt} onChange={(e) => update({ receivedAt: e.target.value })} /></div>
          <div className="space-y-2"><label className="text-sm font-semibold text-slate-200">External reference</label><Input value={form.externalReference} onChange={(e) => update({ externalReference: e.target.value })} placeholder="Llais / GMPI / BCUHB / MDDUS" /></div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-200">Source</label>
            <select value={form.source} onChange={(e) => update({ source: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
              {CONCERN_SOURCES.map((option) => <option key={option} value={option}>{friendly(option)}</option>)}
            </select>
          </div>

          {form.source !== "patient" && (
            <div className="space-y-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 lg:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Raised by — anonymised contact details</p>
              <p className="text-xs text-slate-400">Initials only, plus a way to respond to them. Their full name and address stay in the paper file — reference it by {form.reference || "this case's reference"}.</p>
              <div className="grid gap-4 pt-1 sm:grid-cols-3">
                <div className="space-y-2"><label className="text-xs text-slate-300">Initials</label><Input value={form.raisedByInitials} onChange={(e) => update({ raisedByInitials: e.target.value.toUpperCase() })} placeholder="e.g. J.S." /></div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Contact method</label>
                  <select value={form.raisedByContactMethod} onChange={(e) => update({ raisedByContactMethod: e.target.value, raisedByContactValue: e.target.value === "none" ? "" : form.raisedByContactValue })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
                    {CONCERN_RAISED_BY_CONTACT_METHODS.map((option) => <option key={option} value={option}>{option === "none" ? "Not recorded" : friendly(option)}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Contact details</label>
                  <Input
                    value={form.raisedByContactValue}
                    onChange={(e) => update({ raisedByContactValue: e.target.value })}
                    disabled={form.raisedByContactMethod === "none"}
                    placeholder={form.raisedByContactMethod === "email" ? "name@example.com" : form.raisedByContactMethod === "mobile" ? "07…" : "Select a method first"}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-200">Category</label>
            <select value={form.category} onChange={(e) => update({ category: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
              {CONCERN_CATEGORIES.map((option) => <option key={option} value={option}>{friendly(option)}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-200">Traffic light priority</label>
            <select value={form.priority} onChange={(e) => update({ priority: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
              <option value="low">LOW - early resolution likely</option>
              <option value="medium">MED - investigation likely</option>
              <option value="high">HIGH - patient safety / external / serious harm</option>
            </select>
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-200">Owner</label>
              <select value={form.ownerUid} onChange={(e) => chooseOwner(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.email || u.id}</option>)}
              </select>
            </div>
          )}
          <div className={`space-y-2 lg:col-span-2 ${isEdit ? "lg:col-start-1" : ""}`}><label className="text-sm font-semibold text-slate-200">Named contact for complainant</label><Input value={form.namedContactName} onChange={(e) => update({ namedContactName: e.target.value })} placeholder="Who the person raising this can ask for" /></div>

          <div className="space-y-2 lg:col-span-3"><label className="text-sm font-semibold text-slate-200">Anonymised summary</label><textarea value={form.summary} onChange={(e) => update({ summary: e.target.value })} rows={4} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3 text-white" placeholder="Brief factual summary. Do not include patient name." /></div>
          <div className="space-y-2 lg:col-span-3"><label className="text-sm font-semibold text-slate-200">Desired outcome / what would help?</label><textarea value={form.desiredOutcome} onChange={(e) => update({ desiredOutcome: e.target.value })} rows={3} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3 text-white" placeholder="Record what the person wants from the process, where known." /></div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['earlyResolutionSuitable','Early resolution suitable'],['dutyOfCandourConsidered','Duty of Candour considered'],['clinicalReviewRequired','Clinical review required'],['mddusRequired','MDDUS/GMPI advice required']].map(([key,label]) => (
            <label key={key} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-sm font-semibold text-slate-200">
              <input type="checkbox" checked={!!form[key]} onChange={(e) => update({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>

        {form.mddusRequired && (
          <div className="mt-3 space-y-2">
            <label className="text-sm font-semibold text-slate-200">GMPI / solicitor reference</label>
            <Input value={form.gmpiReference} onChange={(e) => update({ gmpiReference: e.target.value })} placeholder="Assigned solicitor and/or their case reference" />
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="rounded-full" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={submit} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950">
            {isEdit ? (busy ? "Saving…" : "Save changes") : (busy ? "Creating…" : "Create concern")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConcernDetail({ concern, actor, isTeam, isPartner, isAdmin, users, onEdit, onDeleted }) {
  const [timeline, setTimeline] = useState([]);
  const [learning, setLearning] = useState([]);
  const [correspondence, setCorrespondence] = useState([]);
  const [learningTitle, setLearningTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [correspondenceForm, setCorrespondenceForm] = useState({ type: "letter", occurredAt: formatDateInput(new Date()), notes: "" });
  const [extendDate, setExtendDate] = useState("");
  const [extendReason, setExtendReason] = useState("");
  const [closingOutcome, setClosingOutcome] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [outcomeEdit, setOutcomeEdit] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);

  const printSummary = async () => {
    setPrintBusy(true);
    try {
      await printConcernSummary(concern, actor);
    } catch (err) {
      console.error(err);
      alert(err?.message || "Couldn't prepare the summary to print.");
    } finally {
      setPrintBusy(false);
    }
  };

  useEffect(() => {
    if (!concern?.id) return undefined;
    const unsubTimeline = subscribeConcernTimeline(concern.id, setTimeline, console.error);
    const unsubLearning = subscribeLearningActions(concern.id, setLearning, console.error);
    const unsubCorrespondence = subscribeConcernCorrespondence(concern.id, setCorrespondence, console.error);
    return () => {
      unsubTimeline?.();
      unsubLearning?.();
      unsubCorrespondence?.();
    };
  }, [concern?.id]);

  if (!concern) {
    return <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-6 text-sm text-slate-400">Select a concern to view its Listening to People workflow.</div>;
  }

  const health = calculateCaseHealth(concern);
  const deadline = getDeadlineTone(concern);
  const involvedIds = concern.involvedUserIds || [];
  const involvedUsers = involvedIds.map((uid) => users.find((u) => u.id === uid) || { id: uid, displayName: uid });
  const addableUsers = users.filter((u) => !involvedIds.includes(u.id));

  const addLearning = async () => {
    if (!learningTitle.trim()) return;
    await addLearningAction(concern.id, { title: learningTitle.trim() }, actor);
    setLearningTitle("");
  };

  const submitNote = async () => {
    if (!noteText.trim()) return;
    await addConcernQuickNote(concern.id, noteText.trim(), actor);
    setNoteText("");
  };

  const shareWithUser = async () => {
    if (!addUserId) return;
    await addInvolvedUser(concern.id, addUserId, actor);
    setAddUserId("");
  };

  const reassignOwner = async (uid) => {
    const selected = users.find((u) => u.id === uid);
    await updateConcern(concern.id, { ownerUid: uid, ownerName: selected?.displayName || selected?.email || "Unassigned" }, actor);
  };

  const submitExtension = async () => {
    if (!extendDate) return;
    await extendConcernDeadline(concern.id, concern.finalResponseDueAt, extendDate, extendReason.trim(), actor);
    setExtendDate("");
    setExtendReason("");
  };

  const submitClose = async () => {
    if (!closingOutcome) return;
    try {
      setCloseBusy(true);
      setCloseError("");
      await closeConcern(concern, actor, closingOutcome);
      setClosingOutcome("");
    } catch (err) {
      setCloseError(err?.message || "Could not close the case.");
    } finally {
      setCloseBusy(false);
    }
  };

  const submitOutcomeChange = async () => {
    if (!outcomeEdit || outcomeEdit === concern.outcome) return;
    await updateConcernOutcome(concern.id, outcomeEdit, actor);
  };

  const submitCorrespondence = async () => {
    if (!correspondenceForm.notes.trim()) return;
    await addConcernCorrespondence(concern.id, correspondenceForm, actor);
    setCorrespondenceForm({ type: "letter", occurredAt: formatDateInput(new Date()), notes: "" });
  };

  const setLfeStatus = async (status) => {
    await updateLfeReportStatus(concern.id, status, actor);
  };

  const confirmDeleteCase = async () => {
    try {
      setDeleteBusy(true);
      await deleteConcern(concern.id, actor);
      setConfirmDelete(false);
      onDeleted?.();
    } catch (err) {
      alert(err?.message || "Failed to delete concern");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title={concern.reference} description="Listening to People workflow and case health.">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={getPriorityBadge(concern.priority)}>{String(concern.priority || "low").toUpperCase()}</StatusBadge>
              <StatusBadge status={getStatusBadge(concern.status)}>{friendly(concern.status)}</StatusBadge>
              <StatusBadge status={deadline.status}>{deadline.label}</StatusBadge>
              {concern.outcome && <StatusBadge status="neutral">{CONCERN_OUTCOME_LABELS[concern.outcome] || friendly(concern.outcome)}</StatusBadge>}
            </div>
            <p className="text-sm text-slate-300">{concern.summary}</p>
            <p className="text-xs text-slate-500">Identifier: {concern.emisNumber ? `EMIS ${concern.emisNumber}` : `${concern.patientInitials || "Initials missing"} | DOB ${concern.dateOfBirth || "missing"}`}</p>
            {concern.source && concern.source !== "patient" && (
              <p className="text-xs text-slate-500">
                Raised by: {friendly(concern.source)}
                {concern.raisedByInitials ? ` — ${concern.raisedByInitials}` : ""}
                {concern.raisedByContactMethod && concern.raisedByContactMethod !== "none" ? `, ${friendly(concern.raisedByContactMethod)}: ${concern.raisedByContactValue || "not recorded"}` : ""}
              </p>
            )}
            {concern.mddusRequired && <p className="text-xs text-slate-500">GMPI / solicitor: {concern.gmpiReference || "Not yet recorded"}</p>}
            {isTeam ? (
              <div className="flex items-center gap-2 pt-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner</label>
                <select value={concern.ownerUid || ""} onChange={(e) => reassignOwner(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-white">
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.email || u.id}</option>)}
                </select>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Owner: {concern.ownerName || "Unassigned"}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={printSummary} disabled={printBusy} variant="outline" className="rounded-full border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800">
                <Printer className="mr-2 h-4 w-4" />{printBusy ? "Preparing…" : "Print summary"}
              </Button>
              {isTeam && (
                <>
                  <Button onClick={() => onEdit?.(concern)} variant="outline" className="rounded-full border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800">Edit</Button>
                  {isAdmin && (
                    <Button onClick={() => setConfirmDelete(true)} variant="outline" className="rounded-full border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20">Delete</Button>
                  )}
                </>
              )}
            </div>
            <div className="rounded-3xl border border-teal-400/30 bg-teal-500/10 p-4 text-center text-teal-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-200/80">Case Health</p>
              <p className="text-4xl font-black">{health}%</p>
            </div>
          </div>
        </div>

        {isTeam && (
          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extend final response deadline</label>
              <Input type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
            </div>
            <Input value={extendReason} onChange={(e) => setExtendReason(e.target.value)} placeholder="Reason (e.g. awaiting clinical statement)" className="flex-1 min-w-[200px]" />
            <Button onClick={submitExtension} disabled={!extendDate} className="rounded-full">Extend</Button>
          </div>
        )}

        {isTeam && concern.status !== CONCERN_STATUSES.closed && (
          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Closing outcome</label>
              <select value={closingOutcome} onChange={(e) => setClosingOutcome(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white">
                <option value="">Select outcome…</option>
                {CONCERN_OUTCOMES.map((o) => <option key={o} value={o}>{CONCERN_OUTCOME_LABELS[o]}</option>)}
              </select>
            </div>
            <Button onClick={submitClose} disabled={!closingOutcome || closeBusy} className="rounded-full bg-emerald-500 text-slate-950 hover:bg-emerald-400">{closeBusy ? "Closing…" : "Close case"}</Button>
            {closeError && <p className="text-xs text-rose-300">{closeError}</p>}
          </div>
        )}

        {isTeam && concern.status === CONCERN_STATUSES.closed && (
          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Change outcome</label>
              <select value={outcomeEdit || concern.outcome || ""} onChange={(e) => setOutcomeEdit(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white">
                {CONCERN_OUTCOMES.map((o) => <option key={o} value={o}>{CONCERN_OUTCOME_LABELS[o]}</option>)}
              </select>
            </div>
            <Button onClick={submitOutcomeChange} disabled={!outcomeEdit || outcomeEdit === concern.outcome} variant="outline" className="rounded-full">Save</Button>
          </div>
        )}

        <div className="mt-5"><StageProgress status={concern.status} /></div>

        {isTeam && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button onClick={() => acknowledgeConcern(concern, actor)} className="h-auto min-h-10 whitespace-normal rounded-full bg-slate-800 py-2.5 text-center leading-snug text-slate-100 hover:bg-slate-700">Mark acknowledged</Button>
            <Button onClick={() => recordListeningDiscussion(concern, actor, false)} className="h-auto min-h-10 whitespace-normal rounded-full bg-slate-800 py-2.5 text-center leading-snug text-slate-100 hover:bg-slate-700">Listening offered</Button>
            <Button onClick={() => recordListeningDiscussion(concern, actor, true)} className="h-auto min-h-10 whitespace-normal rounded-full bg-slate-800 py-2.5 text-center leading-snug text-slate-100 hover:bg-slate-700">Listening completed</Button>
            <Button onClick={() => updateConcern(concern.id, { status: CONCERN_STATUSES.early_resolution }, actor)} className="h-auto min-h-10 whitespace-normal rounded-full bg-slate-800 py-2.5 text-center leading-snug text-slate-100 hover:bg-slate-700">Move to early resolution</Button>
            <Button onClick={() => updateConcern(concern.id, { status: CONCERN_STATUSES.investigation }, actor)} className="h-auto min-h-10 whitespace-normal rounded-full bg-slate-800 py-2.5 text-center leading-snug text-slate-100 hover:bg-slate-700">Move to investigation</Button>
            <Button onClick={() => updateConcern(concern.id, { status: CONCERN_STATUSES.response }, actor)} className="h-auto min-h-10 whitespace-normal rounded-full bg-slate-800 py-2.5 text-center leading-snug text-slate-100 hover:bg-slate-700">Move to response</Button>
            <Button onClick={() => updateConcern(concern.id, { status: CONCERN_STATUSES.learning }, actor)} className="h-auto min-h-10 whitespace-normal rounded-full bg-slate-800 py-2.5 text-center leading-snug text-slate-100 hover:bg-slate-700">Move to learning</Button>
          </div>
        )}
      </SectionCard>

      {isTeam && (
        <SectionCard title="Shared with" description="Staff who can see this specific case's progress and add notes.">
          <div className="flex flex-wrap gap-2">
            {involvedUsers.length === 0 ? <p className="text-sm text-slate-400">Not shared with anyone yet.</p> : involvedUsers.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-200">
                {u.displayName || u.email || u.id}
                <button type="button" onClick={() => removeInvolvedUser(concern.id, u.id, actor)} className="text-slate-500 hover:text-rose-400" aria-label={`Remove ${u.displayName || u.id}`}>×</button>
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="">Add a staff member…</option>
              {addableUsers.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.email || u.id}</option>)}
            </select>
            <Button onClick={shareWithUser} disabled={!addUserId} className="rounded-full">Share</Button>
          </div>
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="MedAI governance prompts" description="Rule-based prompts aligned to the new Listening to People workflow.">
          <div className="space-y-2">
            {buildGovernancePrompts([concern]).map((prompt) => (
              <div key={prompt} className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm text-violet-100">{prompt}</div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Learning actions" description="Each concern should end with learning where appropriate.">
          {isTeam && (
            <div className="flex gap-2">
              <Input value={learningTitle} onChange={(e) => setLearningTitle(e.target.value)} placeholder="Add learning action" />
              <Button onClick={addLearning} className="rounded-full">Add</Button>
            </div>
          )}
          <div className="mt-3 space-y-2">
            {learning.length === 0 ? <p className="text-sm text-slate-400">No learning actions recorded yet.</p> : learning.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
                <p className="font-semibold">{item.title}</p>
                <p className="text-xs text-slate-500">Owner: {item.ownerName || "Unassigned"}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Welsh Risk Pool — Learning from Events report</p>
            {isTeam ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={concern.lfeReportStatus || "not_required"} onChange={(e) => setLfeStatus(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white">
                  {LFE_REPORT_STATUSES.map((s) => <option key={s} value={s}>{friendly(s)}</option>)}
                </select>
                {concern.lfeReportStatus === "sent" && <span className="text-xs text-slate-400">Sent {formatDisplayDate(concern.lfeReportSentAt)}</span>}
              </div>
            ) : (
              <p className="mt-1 text-sm text-slate-300">{friendly(concern.lfeReportStatus || "not_required")}{concern.lfeReportStatus === "sent" ? ` — ${formatDisplayDate(concern.lfeReportSentAt)}` : ""}</p>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Correspondence & contact log" description="Every letter, meeting or call with the complainant — extension letters and follow-up letters all belong here as separate entries.">
        {isTeam && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
              <select value={correspondenceForm.type} onChange={(e) => setCorrespondenceForm((f) => ({ ...f, type: e.target.value }))} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
                {CORRESPONDENCE_TYPES.map((t) => <option key={t} value={t}>{t === "meeting" ? "Face-to-face meeting" : friendly(t)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</label>
              <Input type="date" value={correspondenceForm.occurredAt} onChange={(e) => setCorrespondenceForm((f) => ({ ...f, occurredAt: e.target.value }))} />
            </div>
            <Input value={correspondenceForm.notes} onChange={(e) => setCorrespondenceForm((f) => ({ ...f, notes: e.target.value }))} placeholder="What was sent/discussed" className="flex-1 min-w-[200px]" />
            <Button onClick={submitCorrespondence} disabled={!correspondenceForm.notes.trim()} className="rounded-full">Add</Button>
          </div>
        )}
        <div className="mt-3 space-y-2">
          {correspondence.length === 0 ? <p className="text-sm text-slate-400">No correspondence logged yet.</p> : correspondence.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status="info">{item.type === "meeting" ? "Face-to-face meeting" : friendly(item.type)}</StatusBadge>
                <p className="text-xs text-slate-500">{formatDisplayDate(item.occurredAt)}</p>
              </div>
              {item.notes && <p className="mt-1.5 text-slate-300">{item.notes}</p>}
              <p className="mt-1 text-xs text-slate-500">Logged by {item.createdByName || "Unknown"}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Face-to-face meetings" description="When a meeting was requested and booked, who attends, the brief outcome, and whether the patient or their representative has asked for a second meeting, a follow-up or a summary. A case can have more than one.">
        <ConcernMeetings concern={concern} actor={actor} isTeam={isTeam} variant="desktop" />
      </SectionCard>

      <SectionCard title="Case timeline" description="Chronological audit trail of key concern activity.">
        {!isPartner && (
          <div className="mb-4 flex gap-2">
            <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a quick note" />
            <Button onClick={submitNote} className="rounded-full">Add note</Button>
          </div>
        )}
        <div className="space-y-2">
          {timeline.length === 0 ? <p className="text-sm text-slate-400">No timeline events yet.</p> : timeline.map((event) => (
            <div key={event.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{event.title}</p>
                <p className="text-xs text-slate-500">{formatDisplayDate(event.createdAt)}</p>
              </div>
              {event.message && <p className="mt-1 text-slate-400">{event.message}</p>}
              <p className="mt-1 text-xs text-slate-500">By {event.actorName || "Unknown"}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {confirmDelete && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-slate-950 p-5 shadow-2xl">
            <h3 className="text-lg font-black text-rose-200">Delete {concern.reference} permanently?</h3>
            <p className="mt-2 text-sm text-slate-300">This removes the case entirely — its timeline, learning actions and correspondence log stay orphaned and unreachable. This can't be undone. If the case is genuinely finished, closing it is usually the right action instead.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" className="rounded-full" disabled={deleteBusy} onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button disabled={deleteBusy} onClick={confirmDeleteCase} className="rounded-full bg-rose-500 text-white hover:bg-rose-600">
                {deleteBusy ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GovernanceConcerns() {
  const { user, displayName, can, isAdmin } = useAuth();
  const actor = useMemo(() => actorFromUser(user, displayName), [user, displayName]);
  const isTeam = can("governance.concernsTeam");
  const isPartner = !isTeam && can("governance.partnerAccess");
  const involvedOnly = !isTeam && !isPartner;
  const [concerns, setConcerns] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [editingConcern, setEditingConcern] = useState(null);
  const [printingId, setPrintingId] = useState(null);

  const printFromRegister = async (concern) => {
    setPrintingId(concern.id);
    try {
      await printConcernSummary(concern, actor);
    } catch (err) {
      console.error(err);
      alert(err?.message || "Couldn't prepare the summary to print.");
    } finally {
      setPrintingId(null);
    }
  };
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("open");

  useEffect(() => {
    const unsub = subscribeConcerns((rows) => {
      setConcerns(rows);
      setSelectedId((current) => current || rows[0]?.id || "");
    }, (err) => setError(err?.message || String(err)), involvedOnly ? { involvedUid: user?.uid } : {});
    return () => unsub?.();
  }, [involvedOnly, user?.uid]);

  useEffect(() => {
    if (!isTeam) return undefined;
    return subscribeUsers(setUsers, console.error);
  }, [isTeam]);

  const metrics = useMemo(() => getConcernMetrics(concerns), [concerns]);
  const filtered = useMemo(() => {
    if (filter === "all") return concerns;
    if (filter === "closed") return concerns.filter((c) => c.status === CONCERN_STATUSES.closed);
    if (filter === "high") return concerns.filter((c) => c.priority === CONCERN_PRIORITIES.high);
    if (filter === "overdue") return concerns.filter((c) => getDeadlineTone(c).status === "critical");
    return concerns.filter((c) => ![CONCERN_STATUSES.closed, CONCERN_STATUSES.archived].includes(c.status));
  }, [concerns, filter]);

  const selected = concerns.find((c) => c.id === selectedId) || filtered[0] || null;

  if (involvedOnly && concerns.length === 0 && !error) {
    return (
      <div className="space-y-5">
        <PageHeader title="Governance Intelligence" description="Listening to People case management." eyebrow="Sprint 23" icon={Icons.governance} />
        <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-6 text-sm text-slate-400">No concerns have been shared with you yet. The Concerns team can share a case for you to follow its progress and add notes.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
        <PageHeader
          title="Governance Intelligence"
          description={isTeam ? "Listening to People case management, anonymised identifiers, deadlines, timeline and learning actions." : isPartner ? "Read-only oversight of every Listening to People case." : "Cases shared with you — follow progress and add notes."}
          eyebrow="Sprint 23" icon={Icons.governance}
          actions={isTeam ? <Button onClick={() => setOpenCreate(true)} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950"><Icons.add className="mr-2 h-4 w-4" /> New concern</Button> : null}
        />

        {error && <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">Firestore is not returning concerns yet. Check Sprint 23 rules. {error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="Open cases" value={metrics.open} tone="sky" />
          <MetricCard label="High priority" value={metrics.high} tone="rose" />
          <MetricCard label="Due this week" value={metrics.dueWeek} tone="amber" />
          <MetricCard label="Listening missing" value={metrics.listeningMissing} tone="slate" />
          <MetricCard label="Case health" value={`${metrics.avgHealth}%`} tone="emerald" />
        </section>

        <SectionCard title="MedAI Governance Brief" description="Operational prompts based on the new NHS Wales Listening to People pathway.">
          <div className="grid gap-2 lg:grid-cols-2">
            {buildGovernancePrompts(concerns).map((prompt) => (
              <div key={prompt} className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm font-medium text-violet-100">{prompt}</div>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
          <SectionCard
            title="Case Register"
            description="Anonymised concern list. Patient names are not stored."
            actions={<select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"><option value="open">Open</option><option value="overdue">Due/overdue</option><option value="high">High</option><option value="closed">Closed</option><option value="all">All</option></select>}
          >
            <div className="space-y-3">
              {filtered.length === 0 ? <p className="text-sm text-slate-400">No matching concerns yet.</p> : filtered.map((concern) => {
                const deadline = getDeadlineTone(concern);
                const active = concern.id === selected?.id;
                return (
                  <div key={concern.id} className="relative">
                  <button type="button" onClick={() => setSelectedId(concern.id)} className={`w-full rounded-2xl border p-4 text-left transition ${active ? "border-teal-400/40 bg-teal-500/10" : "border-slate-800 bg-slate-950/50 hover:bg-slate-900"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-100">{concern.reference}</p>
                        <p className="mt-1 text-xs text-slate-500">{concern.emisNumber ? `EMIS ${concern.emisNumber}` : `${concern.patientInitials || "Initials?"} | DOB ${concern.dateOfBirth || "?"}`}</p>
                      </div>
                      <StatusBadge status={getPriorityBadge(concern.priority)}>{String(concern.priority || "low").toUpperCase()}</StatusBadge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-300">{concern.summary || "No summary"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusBadge status={getStatusBadge(concern.status)}>{friendly(concern.status)}</StatusBadge>
                      <StatusBadge status={deadline.status}>{deadline.label}</StatusBadge>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => printFromRegister(concern)}
                    disabled={printingId === concern.id}
                    title="Print a summary of this case"
                    aria-label={`Print summary of ${concern.reference}`}
                    className="absolute bottom-3 right-3 rounded-full border border-slate-700 bg-slate-900 p-2 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <ConcernDetail
            concern={selected}
            actor={actor}
            isTeam={isTeam}
            isPartner={isPartner}
            isAdmin={isAdmin}
            users={users}
            onEdit={setEditingConcern}
            onDeleted={() => setSelectedId("")}
          />
        </div>

        <ConcernFormModal open={openCreate} onClose={() => setOpenCreate(false)} actor={actor} users={users} />
        <ConcernFormModal open={!!editingConcern} concern={editingConcern} onClose={() => setEditingConcern(null)} actor={actor} users={users} />
    </div>
  );
}
