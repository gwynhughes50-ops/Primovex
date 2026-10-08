import { useEffect, useMemo, useState } from "react";
import {
  ACTION_STATUSES, REVIEW_STATUSES, SE_STATUSES, actionTone, defaultReviewers, formatDate, friendly, nextSteps, reviewProgress,
  addEventToMeeting, addNote, createAction, removeReviewer, requestReviews, saveFindings, setActionDone, setInvolved, setLead, moveStage,
  subscribeReviews, subscribeTimeline, submitReview,
} from "../services/seService";
import { ErrorText, FIELD, HarmPill, LABEL, PRIMARY, PeoplePicker, Pill, SECONDARY, SectionTitle, Sheet, StagePill, StageProgress } from "./SeShared";

// One significant event, start to finish. What each person sees depends on who they are:
// the significant events team runs it; the lead records the investigation; reviewers write their
// review; the reporter and anyone named on it can follow and add notes.

const CARD_CLASS = "rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3";

function Fact({ label, children }) {
  return <div><dt className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">{label}</dt><dd className="text-sm">{children || "—"}</dd></div>;
}

function ReviewForm({ review, actor, onDone }) {
  const [form, setForm] = useState({ summary: review.summary || "", learning: review.learning || "", recommendation: review.recommendation || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (patch) => setForm((c) => ({ ...c, ...patch }));
  async function submit() {
    try { setBusy(true); setError(""); await submitReview(review, form, actor); onDone?.(); } catch (err) { setError(err?.message || "Could not submit."); } finally { setBusy(false); }
  }
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-[var(--medtrak-accent)]/40 p-3">
      <p className="text-sm font-bold">Your review</p>
      <label className={LABEL}>What do you think happened and why?<textarea rows={3} value={form.summary} onChange={(e) => update({ summary: e.target.value })} className={FIELD} /></label>
      <label className={LABEL}>What should we learn?<textarea rows={2} value={form.learning} onChange={(e) => update({ learning: e.target.value })} className={FIELD} /></label>
      <label className={LABEL}>What would you recommend?<textarea rows={2} value={form.recommendation} onChange={(e) => update({ recommendation: e.target.value })} className={FIELD} /></label>
      <ErrorText>{error}</ErrorText>
      <button type="button" disabled={busy} onClick={submit} className={PRIMARY}>{busy ? "Sending…" : review.status === REVIEW_STATUSES.submitted ? "Update my review" : "Submit my review"}</button>
    </div>
  );
}

export default function SeDetail({ event, actor, isTeam, seesAll, staff, settings, meetings, actions, onClose, onChanged }) {
  const uid = actor.uid;
  const isLead = event.leadUid === uid;
  const canRun = isTeam;
  const canInvestigate = isTeam || (isLead && event.status === SE_STATUSES.investigating);

  const [timeline, setTimeline] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [pendingStep, setPendingStep] = useState(null);
  const [note, setNote] = useState("");
  const [findings, setFindings] = useState(() => ({ whatHappened: "", whyItHappened: "", contributingFactors: "", evidence: "", ...(event.findings || {}) }));
  const [picking, setPicking] = useState(null); // "reviewers" | "involved" | null
  const [pickedIds, setPickedIds] = useState([]);
  const [actionForm, setActionForm] = useState(null);
  const [meetingId, setMeetingId] = useState("");

  useEffect(() => subscribeTimeline(event.id, setTimeline, console.error), [event.id]);
  useEffect(() => subscribeReviews(event.id, { seesAll, uid }, setReviews, console.error), [event.id, seesAll, uid]);
  useEffect(() => { setFindings({ whatHappened: "", whyItHappened: "", contributingFactors: "", evidence: "", ...(event.findings || {}) }); }, [event.findings]);

  const eventActions = useMemo(() => actions.filter((a) => a.seId === event.id), [actions, event.id]);
  const openActions = eventActions.filter((a) => a.status !== ACTION_STATUSES.done).length;
  const steps = canRun ? nextSteps(event, { openActions }) : [];
  const progress = reviewProgress(reviews);
  const eventMeetings = meetings.filter((m) => (m.eventIds || []).includes(event.id));
  const plannedMeetings = meetings.filter((m) => m.status === "planned" && !(m.eventIds || []).includes(event.id));
  const reviewerRoles = settings?.reviewerRoles || [];

  const run = async (fn) => {
    try { setBusy(true); setError(""); await fn(); onChanged?.(); } catch (err) { setError(err?.message || "That did not work."); } finally { setBusy(false); }
  };

  const takeStep = (step) => {
    if (step.needsReason && pendingStep?.id !== step.id) { setPendingStep(step); setReason(""); return; }
    run(async () => { await moveStage(event, step, { reason }, actor); setPendingStep(null); setReason(""); });
  };

  const startPicking = (kind) => {
    setPicking(kind);
    if (kind === "reviewers") {
      const already = new Set(reviews.map((r) => r.reviewerUid));
      setPickedIds(defaultReviewers(staff, reviewerRoles).map((p) => p.id).filter((id) => !already.has(id)));
    } else {
      setPickedIds(event.involvedUserIds || []);
    }
  };

  const confirmPicking = () => run(async () => {
    const people = staff.filter((p) => pickedIds.includes(p.id));
    if (picking === "reviewers") await requestReviews(event, people, reviews, actor);
    else await setInvolved(event, people, actor);
    setPicking(null);
  });

  return (
    <Sheet wide eyebrow="Significant event" title={event.reference} subtitle={event.title} onClose={onClose}>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <StagePill status={event.status} />
        <HarmPill harm={event.harm} />
        <Pill>{friendly(event.category)}</Pill>
        {event.investigation === "not_required" && <Pill>No investigation needed</Pill>}
      </div>
      <StageProgress status={event.status} />

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Happened">{formatDate(event.eventDate)}</Fact>
        <Fact label="Where">{event.locationName}</Fact>
        <Fact label="Reported by">{event.reportedByName}</Fact>
        <Fact label="Leading">{event.leadName || "Nobody yet"}</Fact>
        {event.patientInvolved && <Fact label="Patient">{event.emisNumber ? `EMIS ${event.emisNumber}` : `${event.patientInitials || "?"}${event.dateOfBirth ? ` · DOB ${event.dateOfBirth}` : ""}`}</Fact>}
        {(event.involvedNames || []).length > 0 && <Fact label="People involved">{event.involvedNames.join(", ")}</Fact>}
      </dl>
      <SectionTitle>What happened</SectionTitle>
      <p className="mt-1 whitespace-pre-line text-sm">{event.description}</p>
      {event.immediateAction && (<><SectionTitle>Done straight away</SectionTitle><p className="mt-1 whitespace-pre-line text-sm">{event.immediateAction}</p></>)}
      {event.noInvestigationReason && (<><SectionTitle>Why no investigation</SectionTitle><p className="mt-1 text-sm">{event.noInvestigationReason}</p></>)}

      {canRun && (
        <>
          <SectionTitle>Next</SectionTitle>
          <div className="mt-2 flex flex-wrap gap-2">
            {steps.map((step) => (
              <button key={step.id} type="button" disabled={busy || step.blocked} title={step.blocked ? step.blockedReason : ""} onClick={() => takeStep(step)} className={step.id === "investigate" || step.id === "ready_for_meeting" || step.id === "close" ? PRIMARY : SECONDARY}>{step.label}</button>
            ))}
          </div>
          {pendingStep && (
            <div className="mt-2 space-y-2 rounded-xl border border-[var(--medtrak-border)] p-3">
              <label className={LABEL}>Why? <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD} /></label>
              <div className="flex gap-2">
                <button type="button" disabled={busy || !reason.trim()} onClick={() => takeStep(pendingStep)} className={PRIMARY}>{pendingStep.label}</button>
                <button type="button" onClick={() => setPendingStep(null)} className={SECONDARY}>Cancel</button>
              </div>
            </div>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className={LABEL}>Who leads the investigation
              <select value={event.leadUid || ""} disabled={busy} onChange={(e) => run(() => setLead(event, staff.find((p) => p.id === e.target.value) || null, actor))} className={FIELD}>
                <option value="">Nobody yet</option>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">People involved</p>
              <button type="button" onClick={() => startPicking("involved")} className={`${SECONDARY} mt-1 w-full`}>{(event.involvedNames || []).length ? `${event.involvedNames.length} named · change` : "Name people involved"}</button>
            </div>
          </div>
        </>
      )}

      {(event.status === SE_STATUSES.investigating || event.findings) && (canInvestigate || event.findings) && (
        <>
          <SectionTitle>Investigation</SectionTitle>
          {canInvestigate ? (
            <div className="mt-2 space-y-2">
              {[["whatHappened", "What happened (the facts)"], ["whyItHappened", "Why it happened"], ["contributingFactors", "What contributed"], ["evidence", "Evidence looked at"]].map(([key, label]) => (
                <label key={key} className={LABEL}>{label}<textarea rows={2} value={findings[key]} onChange={(e) => setFindings((c) => ({ ...c, [key]: e.target.value }))} className={FIELD} /></label>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => run(() => saveFindings(event, findings, {}, actor))} className={SECONDARY}>Save notes</button>
                {event.status === SE_STATUSES.investigating && <button type="button" disabled={busy} onClick={() => run(() => saveFindings(event, findings, { finish: true }, actor))} className={PRIMARY}>Finish investigation</button>}
              </div>
            </div>
          ) : (
            <dl className="mt-2 space-y-2">
              {[["whatHappened", "What happened"], ["whyItHappened", "Why"], ["contributingFactors", "Contributing factors"], ["evidence", "Evidence"]].filter(([k]) => event.findings?.[k]).map(([k, l]) => <Fact key={k} label={l}>{event.findings[k]}</Fact>)}
            </dl>
          )}
        </>
      )}

      {(reviews.length > 0 || canRun) && (
        <>
          <SectionTitle aside={canRun && <button type="button" onClick={() => startPicking("reviewers")} className="text-xs font-bold text-[var(--medtrak-accent)]">Ask for reviews</button>}>
            Reviews{reviews.length ? ` (${progress.submitted} of ${progress.total} in)` : ""}
          </SectionTitle>
          {reviews.length === 0 && <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{reviewerRoles.length ? `Your practice usually asks: ${reviewerRoles.join(", ")}.` : "Nobody has been asked to review this yet."}</p>}
          <div className="mt-2 space-y-2">
            {reviews.map((review) => (
              <div key={review.id} className={CARD_CLASS}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">{review.reviewerName} <span className="font-normal text-[var(--medtrak-muted)]">{review.reviewerRole}</span></p>
                  <div className="flex items-center gap-2">
                    <Pill tone={review.status === REVIEW_STATUSES.submitted ? "good" : "warn"}>{review.status === REVIEW_STATUSES.submitted ? "In" : "Waiting"}</Pill>
                    {canRun && <button type="button" onClick={() => run(() => removeReviewer(event, review, actor))} className="text-xs text-rose-600">Remove</button>}
                  </div>
                </div>
                {review.status === REVIEW_STATUSES.submitted && review.reviewerUid !== uid && (
                  <dl className="mt-2 space-y-1.5"><Fact label="View">{review.summary}</Fact>{review.learning && <Fact label="Learning">{review.learning}</Fact>}{review.recommendation && <Fact label="Recommends">{review.recommendation}</Fact>}</dl>
                )}
                {review.reviewerUid === uid && <ReviewForm review={review} actor={actor} onDone={onChanged} />}
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Meeting</SectionTitle>
      {eventMeetings.length === 0 ? <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Not on a meeting agenda yet.</p> : eventMeetings.map((m) => (
        <p key={m.id} className="mt-1 text-sm"><b>{m.title}</b> · {formatDate(m.meetingDate)} · {m.status === "held" ? "held" : "planned"}</p>
      ))}
      {canRun && plannedMeetings.length > 0 && (
        <div className="mt-2 flex gap-2">
          <select value={meetingId} onChange={(e) => setMeetingId(e.target.value)} className={`${FIELD} mt-0`}>
            <option value="">Add to a planned meeting…</option>
            {plannedMeetings.map((m) => <option key={m.id} value={m.id}>{m.title} · {formatDate(m.meetingDate)}</option>)}
          </select>
          <button type="button" disabled={busy || !meetingId} onClick={() => run(async () => { await addEventToMeeting(meetings.find((m) => m.id === meetingId), event, actor); setMeetingId(""); })} className={SECONDARY}>Add</button>
        </div>
      )}

      <SectionTitle aside={canRun && <button type="button" onClick={() => setActionForm({ title: "", ownerUid: "", ownerName: "", dueDate: "" })} className="text-xs font-bold text-[var(--medtrak-accent)]">Add action</button>}>Actions</SectionTitle>
      {eventActions.length === 0 && <p className="mt-1 text-sm text-[var(--medtrak-muted)]">No actions yet.</p>}
      <div className="mt-2 space-y-1.5">
        {eventActions.map((a) => {
          const tone = actionTone(a);
          const mine = a.ownerUid === uid;
          return (
            <div key={a.id} className={`${CARD_CLASS} flex items-start gap-3`}>
              <input type="checkbox" className="mt-1 h-4 w-4" checked={a.status === ACTION_STATUSES.done} disabled={busy || !(canRun || mine)} onChange={(e) => run(() => setActionDone(a, e.target.checked, "", actor))} aria-label={`Mark done: ${a.title}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${a.status === ACTION_STATUSES.done ? "line-through opacity-60" : ""}`}>{a.title}</p>
                <p className="text-xs text-[var(--medtrak-muted)]">{a.ownerName || "Unassigned"}{a.dueDate ? ` · due ${formatDate(a.dueDate)}` : ""}</p>
              </div>
              <Pill tone={tone.id === "overdue" ? "bad" : tone.id === "soon" ? "warn" : tone.id === "done" ? "good" : "plain"}>{tone.label}</Pill>
            </div>
          );
        })}
      </div>
      {actionForm && (
        <div className="mt-2 space-y-2 rounded-xl border border-[var(--medtrak-border)] p-3">
          <label className={LABEL}>What needs doing<input value={actionForm.title} onChange={(e) => setActionForm({ ...actionForm, title: e.target.value })} className={FIELD} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={LABEL}>Who
              <select value={actionForm.ownerUid} onChange={(e) => setActionForm({ ...actionForm, ownerUid: e.target.value, ownerName: staff.find((p) => p.id === e.target.value)?.label || "" })} className={FIELD}>
                <option value="">Choose…</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className={LABEL}>By when<input type="date" value={actionForm.dueDate} onChange={(e) => setActionForm({ ...actionForm, dueDate: e.target.value })} className={FIELD} /></label>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => run(async () => { await createAction(actionForm, event, null, actor); setActionForm(null); })} className={PRIMARY}>Add action</button>
            <button type="button" onClick={() => setActionForm(null)} className={SECONDARY}>Cancel</button>
          </div>
        </div>
      )}

      <SectionTitle>Notes and history</SectionTitle>
      <div className="mt-2 flex gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (no names)" className={`${FIELD} mt-0`} />
        <button type="button" disabled={busy || !note.trim()} onClick={() => run(async () => { await addNote(event.id, note, actor); setNote(""); })} className={PRIMARY}>Add</button>
      </div>
      <div className="mt-2 space-y-1.5">
        {timeline.map((t) => (
          <div key={t.id} className={CARD_CLASS}>
            <p className="text-sm font-semibold">{t.title}</p>
            {t.message && <p className="whitespace-pre-line text-xs text-[var(--medtrak-muted)]">{t.message}</p>}
            <p className="mt-0.5 text-[10px] text-[var(--medtrak-muted)]">{t.actorName} · {formatDate(t.createdAt)}</p>
          </div>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>

      {picking && (
        <Sheet title={picking === "reviewers" ? "Ask for reviews" : "People involved"} subtitle={picking === "reviewers" ? (reviewerRoles.length ? `Ticked: people in your usual reviewer roles (${reviewerRoles.join(", ")}). Change as needed.` : "Choose who should review this event.") : "Staff who were involved. They'll be able to follow the event and add notes."} onClose={() => setPicking(null)}>
          <div className="mt-3">
            <PeoplePicker people={staff} selectedIds={pickedIds} onChange={setPickedIds} disabledIds={picking === "reviewers" ? reviews.map((r) => r.reviewerUid) : []} emptyText="The staff list couldn't be loaded." />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPicking(null)} className={SECONDARY}>Cancel</button>
              <button type="button" disabled={busy} onClick={confirmPicking} className={PRIMARY}>{picking === "reviewers" ? "Ask them" : "Save"}</button>
            </div>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}

