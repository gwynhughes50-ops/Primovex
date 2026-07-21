import { useEffect, useMemo, useState } from "react";

import PageHeader from "@/components/common/PageHeader";
import SectionCard from "@/components/common/SectionCard";
import StatusBadge from "@/components/common/StatusBadge";
import PermissionGate from "@/components/security/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icons } from "@/config/medtrakIcons";
import { useAuth } from "@/contexts/AuthContext";
import {
  CONCERN_CATEGORIES,
  CONCERN_PRIORITIES,
  CONCERN_SOURCES,
  CONCERN_STAGES,
  CONCERN_STATUSES,
  acknowledgeConcern,
  addLearningAction,
  buildGovernancePrompts,
  calculateCaseHealth,
  closeConcern,
  createConcern,
  createConcernReference,
  friendly,
  formatDateInput,
  getConcernMetrics,
  getDeadlineTone,
  getPriorityBadge,
  getStatusBadge,
  recordListeningDiscussion,
  subscribeConcernTimeline,
  subscribeConcerns,
  subscribeLearningActions,
  toDate,
  updateConcern,
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
    <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {CONCERN_STAGES.map((stage, index) => {
        const active = index <= currentIndex;
        return (
          <div key={stage.key} className={`rounded-2xl border px-3 py-3 text-xs font-semibold ${active ? "border-teal-400/30 bg-teal-500/10 text-teal-100" : "border-slate-800 bg-slate-950/60 text-slate-400"}`}>
            <div className="mb-1 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${active ? "bg-teal-300" : "bg-slate-600"}`} />
              Step {index + 1}
            </div>
            {stage.label}
          </div>
        );
      })}
    </div>
  );
}

function ConcernFormModal({ open, onClose, actor, onCreated }) {
  const [form, setForm] = useState(getInitialForm);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(getInitialForm());
  }, [open]);

  if (!open) return null;
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  const submit = async () => {
    try {
      setBusy(true);
      await createConcern(form, actor);
      onCreated?.();
      onClose?.();
    } catch (err) {
      alert(err?.message || "Failed to create concern");
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
            <h2 className="mt-3 text-2xl font-black text-white">New Governance Concern</h2>
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
          <div className="space-y-2"><label className="text-sm font-semibold text-slate-200">External reference</label><Input value={form.externalReference} onChange={(e) => update({ externalReference: e.target.value })} placeholder="PALS / GMPI / BCUHB / MDDUS" /></div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-200">Source</label>
            <select value={form.source} onChange={(e) => update({ source: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white">
              {CONCERN_SOURCES.map((option) => <option key={option} value={option}>{friendly(option)}</option>)}
            </select>
          </div>
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

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="rounded-full" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={submit} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950">
            {busy ? "Creating…" : "Create concern"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConcernDetail({ concern, actor }) {
  const [timeline, setTimeline] = useState([]);
  const [learning, setLearning] = useState([]);
  const [learningTitle, setLearningTitle] = useState("");

  useEffect(() => {
    if (!concern?.id) return undefined;
    const unsubTimeline = subscribeConcernTimeline(concern.id, setTimeline, console.error);
    const unsubLearning = subscribeLearningActions(concern.id, setLearning, console.error);
    return () => {
      unsubTimeline?.();
      unsubLearning?.();
    };
  }, [concern?.id]);

  if (!concern) {
    return <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-6 text-sm text-slate-400">Select a concern to view its Listening to People workflow.</div>;
  }

  const health = calculateCaseHealth(concern);
  const deadline = getDeadlineTone(concern);

  const addLearning = async () => {
    if (!learningTitle.trim()) return;
    await addLearningAction(concern.id, { title: learningTitle.trim() }, actor);
    setLearningTitle("");
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
            </div>
            <p className="text-sm text-slate-300">{concern.summary}</p>
            <p className="text-xs text-slate-500">Identifier: {concern.emisNumber ? `EMIS ${concern.emisNumber}` : `${concern.patientInitials || "Initials missing"} | DOB ${concern.dateOfBirth || "missing"}`}</p>
          </div>
          <div className="rounded-3xl border border-teal-400/30 bg-teal-500/10 p-4 text-center text-teal-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-200/80">Case Health</p>
            <p className="text-4xl font-black">{health}%</p>
          </div>
        </div>

        <div className="mt-5"><StageProgress status={concern.status} /></div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button onClick={() => acknowledgeConcern(concern, actor)} className="rounded-full bg-slate-800 text-slate-100 hover:bg-slate-700">Mark acknowledged</Button>
          <Button onClick={() => recordListeningDiscussion(concern, actor, false)} className="rounded-full bg-slate-800 text-slate-100 hover:bg-slate-700">Listening offered</Button>
          <Button onClick={() => updateConcern(concern.id, { status: CONCERN_STATUSES.investigation }, actor)} className="rounded-full bg-slate-800 text-slate-100 hover:bg-slate-700">Move to investigation</Button>
          <Button onClick={() => closeConcern(concern, actor)} className="rounded-full bg-emerald-500 text-slate-950 hover:bg-emerald-400">Close case</Button>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="MedAI governance prompts" description="Rule-based prompts aligned to the new Listening to People workflow.">
          <div className="space-y-2">
            {buildGovernancePrompts([concern]).map((prompt) => (
              <div key={prompt} className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm text-violet-100">{prompt}</div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Learning actions" description="Each concern should end with learning where appropriate.">
          <div className="flex gap-2">
            <Input value={learningTitle} onChange={(e) => setLearningTitle(e.target.value)} placeholder="Add learning action" />
            <Button onClick={addLearning} className="rounded-full">Add</Button>
          </div>
          <div className="mt-3 space-y-2">
            {learning.length === 0 ? <p className="text-sm text-slate-400">No learning actions recorded yet.</p> : learning.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
                <p className="font-semibold">{item.title}</p>
                <p className="text-xs text-slate-500">Owner: {item.ownerName || "Unassigned"}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Case timeline" description="Chronological audit trail of key concern activity.">
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
    </div>
  );
}

export default function GovernanceConcerns() {
  const { user, displayName } = useAuth();
  const actor = useMemo(() => actorFromUser(user, displayName), [user, displayName]);
  const [concerns, setConcerns] = useState([]);
  const [error, setError] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("open");

  useEffect(() => {
    const unsub = subscribeConcerns((rows) => {
      setConcerns(rows);
      setSelectedId((current) => current || rows[0]?.id || "");
    }, (err) => setError(err?.message || String(err)));
    return () => unsub?.();
  }, []);

  const metrics = useMemo(() => getConcernMetrics(concerns), [concerns]);
  const filtered = useMemo(() => {
    if (filter === "all") return concerns;
    if (filter === "closed") return concerns.filter((c) => c.status === CONCERN_STATUSES.closed);
    if (filter === "high") return concerns.filter((c) => c.priority === CONCERN_PRIORITIES.high);
    if (filter === "overdue") return concerns.filter((c) => getDeadlineTone(c).status === "critical");
    return concerns.filter((c) => ![CONCERN_STATUSES.closed, CONCERN_STATUSES.archived].includes(c.status));
  }, [concerns, filter]);

  const selected = concerns.find((c) => c.id === selectedId) || filtered[0] || null;

  return (
    <PermissionGate capability="governance.manageConcerns">
      <div className="space-y-5">
        <PageHeader
          title="Governance Intelligence"
          description="Listening to People case management, anonymised identifiers, deadlines, timeline and learning actions."
          eyebrow="Sprint 23" icon={Icons.governance}
          actions={<Button onClick={() => setOpenCreate(true)} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950"><Icons.add className="mr-2 h-4 w-4" /> New concern</Button>}
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
                  <button key={concern.id} type="button" onClick={() => setSelectedId(concern.id)} className={`w-full rounded-2xl border p-4 text-left transition ${active ? "border-teal-400/40 bg-teal-500/10" : "border-slate-800 bg-slate-950/50 hover:bg-slate-900"}`}>
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
                );
              })}
            </div>
          </SectionCard>

          <ConcernDetail concern={selected} actor={actor} />
        </div>

        <ConcernFormModal open={openCreate} onClose={() => setOpenCreate(false)} actor={actor} />
      </div>
    </PermissionGate>
  );
}
