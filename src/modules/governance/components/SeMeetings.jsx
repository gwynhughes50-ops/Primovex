import { useMemo, useState } from "react";
import { CalendarPlus, Copy, Printer } from "lucide-react";
import {
  ACTION_STATUSES, MEETING_STATUSES, SE_STATUSES, actionTone, addEventToMeeting, createAction, createMeeting, formatDate, formatDateInput, markMeetingHeld,
  minutesText, removeEventFromMeeting, setActionDone, updateMeeting,
} from "../services/seService";
import { CARD, ErrorText, FIELD, LABEL, PRIMARY, PeoplePicker, Pill, SECONDARY, SectionTitle, Sheet } from "./SeShared";

// Significant event meetings: who was there, what was discussed about each event, the minutes and
// the actions agreed. One meeting can cover several events. Only the significant events team edits;
// people who attended (and oversight) can read the minutes.

function NewMeeting({ staff, actor, onClose, onCreated }) {
  const [form, setForm] = useState({ title: "Significant event meeting", meetingDate: formatDateInput(new Date()), chair: null, attendees: [], apologies: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    try { setBusy(true); setError(""); const id = await createMeeting(form, actor); onCreated?.(id); onClose(); } catch (err) { setError(err?.message || "Could not create the meeting."); } finally { setBusy(false); }
  }
  return (
    <Sheet eyebrow="Significant events" title="New meeting" onClose={onClose}>
      <div className="mt-4 space-y-3">
        <label className={LABEL}>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={FIELD} /></label>
        <label className={LABEL}>Date<input type="date" value={form.meetingDate} onChange={(e) => setForm({ ...form, meetingDate: e.target.value })} className={FIELD} /></label>
        <label className={LABEL}>Chair
          <select value={form.chair?.id || ""} onChange={(e) => setForm({ ...form, chair: staff.find((p) => p.id === e.target.value) || null })} className={FIELD}>
            <option value="">Not decided</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <div><p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Expected attendees</p>
          <PeoplePicker people={staff} selectedIds={form.attendees.map((p) => p.id)} onChange={(ids) => setForm({ ...form, attendees: staff.filter((p) => ids.includes(p.id)) })} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="sticky bottom-0 -mx-5 -mb-6 mt-3 flex justify-end gap-2 border-t border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-5 py-3"><button type="button" onClick={onClose} className={SECONDARY}>Cancel</button><button type="button" disabled={busy} onClick={save} className={PRIMARY}>Create</button></div>
      </div>
    </Sheet>
  );
}

function MeetingSheet({ meeting, events, actions, staff, isTeam, actor, onClose }) {
  const agenda = useMemo(() => (meeting.eventIds || []).map((id) => events.find((e) => e.id === id)).filter(Boolean), [meeting.eventIds, events]);
  const candidates = useMemo(
    () => events.filter((e) => !(meeting.eventIds || []).includes(e.id) && [SE_STATUSES.awaiting_meeting, SE_STATUSES.in_review, SE_STATUSES.investigating, SE_STATUSES.actions_open].includes(e.status)),
    [events, meeting.eventIds]
  );
  const [minutes, setMinutes] = useState(meeting.minutes || "");
  const [apologies, setApologies] = useState(meeting.apologies || "");
  const [discussion, setDiscussion] = useState(meeting.discussion || {});
  const [attendeeIds, setAttendeeIds] = useState(meeting.attendeeUids || []);
  const [addId, setAddId] = useState("");
  const [actionFor, setActionFor] = useState(null); // event id or "general"
  const [actionForm, setActionForm] = useState({ title: "", ownerUid: "", ownerName: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const meetingActions = actions.filter((a) => a.meetingId === meeting.id);
  const text = () => minutesText({ ...meeting, minutes, apologies, discussion, attendeeNames: staff.length ? staff.filter((p) => attendeeIds.includes(p.id)).map((p) => p.label) : meeting.attendeeNames }, agenda, meetingActions, formatDate);
  const run = async (fn) => { try { setBusy(true); setError(""); await fn(); } catch (err) { setError(err?.message || "That did not work."); } finally { setBusy(false); } };

  const save = () => run(() => updateMeeting(meeting.id, {
    minutes, apologies, discussion,
    ...(staff.length ? { attendees: staff.filter((p) => attendeeIds.includes(p.id)) } : {}),
  }, actor));

  const copy = async () => { try { await navigator.clipboard.writeText(text()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Couldn't copy. Use Print instead."); } };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) { setError("Your browser blocked the print window."); return; }
    const escaped = text().replace(/&/g, "&amp;").replace(/</g, "&lt;");
    w.document.write(`<title>Minutes</title><pre style="font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap;margin:24px">${escaped}</pre>`);
    w.document.close();
    w.print();
  };

  return (
    <Sheet wide eyebrow={meeting.status === MEETING_STATUSES.held ? "Held" : "Planned"} title={meeting.title} subtitle={`${formatDate(meeting.meetingDate)}${meeting.chairName ? ` · Chair: ${meeting.chairName}` : ""}`} onClose={onClose}>
      <SectionTitle>Present</SectionTitle>
      {isTeam && staff.length ? <div className="mt-2"><PeoplePicker people={staff} selectedIds={attendeeIds} onChange={setAttendeeIds} /></div> : <p className="mt-1 text-sm">{(meeting.attendeeNames || []).join(", ") || "Not recorded"}</p>}
      <label className={`${LABEL} mt-2`}>Apologies<input value={apologies} disabled={!isTeam} onChange={(e) => setApologies(e.target.value)} className={FIELD} /></label>

      <SectionTitle>Events discussed</SectionTitle>
      {agenda.length === 0 && <p className="mt-1 text-sm text-[var(--medtrak-muted)]">No events on the agenda yet.</p>}
      <div className="mt-2 space-y-3">
        {agenda.map((event) => {
          const own = meetingActions.filter((a) => a.seId === event.id);
          return (
            <div key={event.id} className={CARD}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold">{event.reference} <span className="font-normal text-[var(--medtrak-muted)]">{event.title}</span></p>
                {isTeam && meeting.status === MEETING_STATUSES.planned && <button type="button" onClick={() => run(() => removeEventFromMeeting(meeting, event))} className="text-xs text-rose-600">Take off</button>}
              </div>
              <label className={`${LABEL} mt-2`}>Discussion<textarea rows={3} disabled={!isTeam} value={discussion[event.id] || ""} onChange={(e) => setDiscussion({ ...discussion, [event.id]: e.target.value })} className={FIELD} /></label>
              {own.map((a) => (
                <div key={a.id} className="mt-1.5 flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" disabled={!isTeam} checked={a.status === ACTION_STATUSES.done} onChange={(e) => run(() => setActionDone(a, e.target.checked, "", actor))} aria-label={`Mark done: ${a.title}`} />
                  <span className="flex-1">{a.title} <span className="text-xs text-[var(--medtrak-muted)]">{a.ownerName}{a.dueDate ? ` · ${formatDate(a.dueDate)}` : ""}</span></span>
                  <Pill tone={actionTone(a).id === "overdue" ? "bad" : "plain"}>{actionTone(a).label}</Pill>
                </div>
              ))}
              {isTeam && <button type="button" onClick={() => { setActionFor(event.id); setActionForm({ title: "", ownerUid: "", ownerName: "", dueDate: "" }); }} className="mt-2 text-xs font-bold text-[var(--medtrak-accent)]">Add an action</button>}
            </div>
          );
        })}
      </div>
      {isTeam && candidates.length > 0 && (
        <div className="mt-2 flex gap-2">
          <select value={addId} onChange={(e) => setAddId(e.target.value)} className={`${FIELD} mt-0`}>
            <option value="">Add an event to the agenda…</option>
            {candidates.map((e) => <option key={e.id} value={e.id}>{e.reference} · {e.title}</option>)}
          </select>
          <button type="button" disabled={busy || !addId} onClick={() => run(async () => { await addEventToMeeting(meeting, events.find((e) => e.id === addId), actor); setAddId(""); })} className={SECONDARY}>Add</button>
        </div>
      )}

      <SectionTitle>Minutes</SectionTitle>
      <textarea rows={6} disabled={!isTeam} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="General discussion, decisions, anything not about one event. No names of patients." className={`${FIELD} mt-2`} />

      {meetingActions.some((a) => !a.seId) && (
        <>
          <SectionTitle>Other actions</SectionTitle>
          {meetingActions.filter((a) => !a.seId).map((a) => <p key={a.id} className="mt-1 text-sm">{a.title} <span className="text-xs text-[var(--medtrak-muted)]">{a.ownerName}</span></p>)}
        </>
      )}
      {isTeam && <button type="button" onClick={() => { setActionFor("general"); setActionForm({ title: "", ownerUid: "", ownerName: "", dueDate: "" }); }} className="mt-2 text-xs font-bold text-[var(--medtrak-accent)]">Add an action not about one event</button>}

      {actionFor && (
        <div className="mt-3 space-y-2 rounded-xl border border-[var(--medtrak-border)] p-3">
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
            <button type="button" disabled={busy} onClick={() => run(async () => { await createAction(actionForm, actionFor === "general" ? null : events.find((e) => e.id === actionFor), meeting, actor); setActionFor(null); })} className={PRIMARY}>Add action</button>
            <button type="button" onClick={() => setActionFor(null)} className={SECONDARY}>Cancel</button>
          </div>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="mt-5 flex flex-wrap gap-2">
        {isTeam && <button type="button" disabled={busy} onClick={save} className={PRIMARY}>Save minutes</button>}
        {isTeam && meeting.status === MEETING_STATUSES.planned && <button type="button" disabled={busy || agenda.length === 0} title={agenda.length ? "" : "Put at least one event on the agenda first"} onClick={() => run(async () => { await save(); await markMeetingHeld(meeting, agenda, actor); })} className={SECONDARY}>The meeting has been held</button>}
        <button type="button" onClick={copy} className={`${SECONDARY} inline-flex items-center gap-1.5`}><Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy minutes"}</button>
        <button type="button" onClick={print} className={`${SECONDARY} inline-flex items-center gap-1.5`}><Printer className="h-4 w-4" /> Print</button>
      </div>
    </Sheet>
  );
}

export default function SeMeetings({ meetings, events, actions, staff, isTeam, actor }) {
  const [openId, setOpenId] = useState("");
  const [creating, setCreating] = useState(false);
  const open = meetings.find((m) => m.id === openId);
  return (
    <div className="space-y-2">
      {isTeam && <button type="button" onClick={() => setCreating(true)} className={`${PRIMARY} inline-flex items-center gap-1.5`}><CalendarPlus className="h-4 w-4" /> New meeting</button>}
      {meetings.length === 0 && <p className="rounded-xl border border-dashed border-[var(--medtrak-border)] p-6 text-center text-sm text-[var(--medtrak-muted)]">No meetings yet.</p>}
      {meetings.map((m) => (
        <button key={m.id} type="button" onClick={() => setOpenId(m.id)} className={`${CARD} w-full text-left`}>
          <div className="flex items-start justify-between gap-2">
            <div><p className="font-bold">{m.title}</p><p className="text-xs text-[var(--medtrak-muted)]">{formatDate(m.meetingDate)} · {(m.eventIds || []).length} event{(m.eventIds || []).length === 1 ? "" : "s"}</p></div>
            <Pill tone={m.status === MEETING_STATUSES.held ? "good" : "plain"}>{m.status === MEETING_STATUSES.held ? "Held" : "Planned"}</Pill>
          </div>
        </button>
      ))}
      {open && <MeetingSheet key={open.id} meeting={open} events={events} actions={actions} staff={staff} isTeam={isTeam} actor={actor} onClose={() => setOpenId("")} />}
      {creating && <NewMeeting staff={staff} actor={actor} onClose={() => setCreating(false)} onCreated={setOpenId} />}
    </div>
  );
}
