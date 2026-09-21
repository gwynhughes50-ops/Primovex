import { useEffect, useState } from "react";

import StatusBadge from "@/components/common/StatusBadge";
import {
  MEETING_FURTHER_REQUESTS,
  addConcernMeeting,
  formatMeetingDate,
  getMeetingForm,
  getMeetingStatus,
  subscribeConcernMeetings,
  updateConcernMeeting,
} from "@/modules/governance/services/concernService";

// One component for both the desktop page and the mobile sheet — only the
// class names differ, so the two can't drift apart.
const STYLES = {
  desktop: {
    label: "text-xs font-semibold uppercase tracking-wide text-slate-500",
    field: "w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white",
    muted: "text-slate-400",
    faint: "text-slate-500",
    body: "text-slate-300",
    panel: "rounded-2xl border border-slate-700 bg-slate-950/60 p-4",
    card: "rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200",
    primary: "rounded-full bg-teal-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-teal-300 disabled:opacity-60",
    secondary: "rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800",
    pill: "rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200",
    divider: "border-slate-800",
  },
  mobile: {
    label: "text-[11px] font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]",
    field: "w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm",
    muted: "text-[var(--medtrak-muted)]",
    faint: "text-[var(--medtrak-muted)]",
    body: "",
    panel: "rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3",
    card: "rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2.5 text-sm",
    primary: "rounded-xl bg-[var(--medtrak-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60",
    secondary: "rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm",
    pill: "rounded-full border border-[var(--medtrak-border)] px-2 py-0.5 text-[11px]",
    divider: "border-[var(--medtrak-border)]",
  },
};

function Field({ label, hint, styles, className = "", children }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className={`block ${styles.label}`}>{label}</span>
      {children}
      {hint && <span className={`block text-xs ${styles.faint}`}>{hint}</span>}
    </label>
  );
}

export default function ConcernMeetings({ concern, actor, isTeam, variant = "desktop" }) {
  const s = STYLES[variant] || STYLES.desktop;
  const [meetings, setMeetings] = useState([]);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(null);
    setEditing(null);
    setError("");
    if (!concern?.id) return undefined;
    return subscribeConcernMeetings(concern.id, setMeetings, (err) => console.error("Face-to-face meetings", err));
  }, [concern?.id]);

  const openNew = (seed = {}) => { setEditing(null); setForm(getMeetingForm(null, seed)); setError(""); };
  const openEdit = (meeting) => { setEditing(meeting); setForm(getMeetingForm(meeting)); setError(""); };
  const close = () => { setForm(null); setEditing(null); setError(""); };
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const toggleRequest = (key) => update({
    furtherRequests: form.furtherRequests.includes(key) ? form.furtherRequests.filter((item) => item !== key) : [...form.furtherRequests, key],
  });

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (editing) await updateConcernMeeting(editing, form, actor);
      else await addConcernMeeting(concern.id, form, actor);
      close();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Couldn't save the meeting.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {variant === "mobile" && (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Face-to-face meetings</p>
          <p className="mt-0.5 text-xs text-[var(--medtrak-muted)]">Record when a meeting is requested and booked, who attends, and the outcome. A case can have more than one.</p>
        </>
      )}

      {isTeam && !form && (
        <div className={variant === "mobile" ? "mt-2" : ""}>
          <button type="button" onClick={() => openNew()} className={s.primary}>Add a meeting</button>
        </div>
      )}

      {form && (
        <div className={`mt-3 ${s.panel}`}>
          <p className={`text-sm font-semibold ${variant === "desktop" ? "text-white" : ""}`}>{editing ? "Edit meeting" : "New face-to-face meeting"}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Date requested" styles={s}>
              <input type="date" value={form.requestedDate} onChange={(e) => update({ requestedDate: e.target.value })} className={s.field} />
            </Field>
            <Field label="Person requesting" hint="Initials and relationship rather than a full name, e.g. 'Patient (AB)' or 'Daughter'." styles={s}>
              <input value={form.requestedBy} onChange={(e) => update({ requestedBy: e.target.value })} maxLength={160} className={s.field} />
            </Field>
            <Field label="Date booked" styles={s}>
              <input type="date" value={form.bookedDate} onChange={(e) => update({ bookedDate: e.target.value })} className={s.field} />
            </Field>
            <Field label="Time booked" styles={s}>
              <input type="time" value={form.bookedTime} onChange={(e) => update({ bookedTime: e.target.value })} className={s.field} />
            </Field>
            <Field label="Who will attend" hint="Staff by name; the patient or family by initials and relationship." styles={s} className="sm:col-span-2">
              <input value={form.attendees} onChange={(e) => update({ attendees: e.target.value })} maxLength={400} className={s.field} />
            </Field>
            <Field label="Brief outcome" hint="Fill this in after the meeting." styles={s} className="sm:col-span-2">
              <textarea value={form.outcome} onChange={(e) => update({ outcome: e.target.value })} rows={3} maxLength={2000} className={s.field} />
            </Field>
          </div>

          <div className={`mt-4 border-t pt-3 ${s.divider}`}>
            <p className={`text-sm font-semibold ${variant === "desktop" ? "text-white" : ""}`}>The patient or their representative has requested</p>
            <div className="mt-2 space-y-1.5">
              {MEETING_FURTHER_REQUESTS.map((item) => (
                <label key={item.key} className={`flex items-center gap-2 text-sm ${s.body}`}>
                  <input type="checkbox" checked={form.furtherRequests.includes(item.key)} onChange={() => toggleRequest(item.key)} className="h-4 w-4" />
                  {item.label}
                </label>
              ))}
            </div>
            <p className={`mt-1 text-xs ${s.faint}`}>Leave all unticked if nothing further has been asked for.</p>
          </div>

          {error && <p role="alert" className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 p-2 text-sm text-rose-400">{error}</p>}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={close} disabled={busy} className={s.secondary}>Cancel</button>
            <button type="button" onClick={save} disabled={busy} className={s.primary}>{busy ? "Saving..." : editing ? "Save changes" : "Add meeting"}</button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {meetings.length === 0 ? (
          <p className={`text-sm ${s.muted}`}>No face-to-face meetings recorded yet.</p>
        ) : meetings.map((meeting) => {
          const status = getMeetingStatus(meeting);
          const requests = MEETING_FURTHER_REQUESTS.filter((item) => (meeting.furtherRequests || []).includes(item.key));
          return (
            <div key={meeting.id} className={s.card}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={status.tone}>{status.label}</StatusBadge>
                <span className={`text-xs ${s.faint}`}>
                  {meeting.bookedDate ? `${formatMeetingDate(meeting.bookedDate)}${meeting.bookedTime ? ` at ${meeting.bookedTime}` : ""}` : "Not yet booked"}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                <p><span className={s.faint}>Requested:</span> {formatMeetingDate(meeting.requestedDate)} by {meeting.requestedBy || "not recorded"}</p>
                {meeting.attendees && <p><span className={s.faint}>Attending:</span> {meeting.attendees}</p>}
                {meeting.outcome && <p><span className={s.faint}>Outcome:</span> <span className="whitespace-pre-wrap">{meeting.outcome}</span></p>}
              </div>
              {requests.length > 0 && (
                <div className="mt-2">
                  <p className={`text-xs ${s.faint}`}>Patient or representative has requested:</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">{requests.map((item) => <span key={item.key} className={s.pill}>{item.label}</span>)}</div>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs ${s.faint}`}>Logged by {meeting.createdByName || "Unknown"}</span>
                {isTeam && !form && (
                  <span className="flex flex-wrap gap-2">
                    {(meeting.furtherRequests || []).includes("second_meeting") && (
                      <button type="button" onClick={() => openNew({ requestedBy: meeting.requestedBy || "" })} className={s.secondary}>Arrange second meeting</button>
                    )}
                    <button type="button" onClick={() => openEdit(meeting)} className={s.secondary}>Edit</button>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
