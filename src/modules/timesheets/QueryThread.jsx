import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SKINS } from "./timesheetSkins";
import { QUERY_STATUS, QUERY_TO, canReopen, canReply, canResolve, queryHeading, stampText } from "./timesheetPayroll";
import { raiseQuery, reopenQuery, replyToQuery, resolveQuery, useMessages, useQueries } from "./timesheetQueryService";

// The screens for payroll queries on a timesheet:
//   RaiseQuery    the payroll team asks the person, or their line manager, about a signed-off timesheet
//   QueryThread   one query: what was said, who by and when; reply, mark as resolved, open again
//   QueriesInbox  the queries raised with this login (the person about their own timesheet, or a line manager about someone's)

const KIND_WORDS = { raised: "asked", reply: "replied", resolved: "marked it resolved", reopened: "opened it again" };

const whenOf = (m) => (m?.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000) : m?.createdAtMs ? new Date(m.createdAtMs) : null);
const whenText = (m) => { const d = whenOf(m); return d ? stampText(d.toISOString()) : "just now"; };

export function QueryThread({ query, skin = "desktop", open: startOpen = false }) {
  const s = SKINS[skin];
  const { user, displayName } = useAuth();
  const uid = user?.uid || "";
  const actor = { displayName: displayName || user?.email || "" };
  const [open, setOpen] = useState(startOpen);
  const { thread, error: loadError } = useMessages(query.id, open);
  const [mode, setMode] = useState(""); // "" | "reply" | "resolve" | "reopen"
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resolved = query.status === QUERY_STATUS.resolved;

  async function submit() {
    setBusy(true); setError("");
    try {
      if (mode === "reply") await replyToQuery({ query, text, uid, actor });
      else if (mode === "resolve") await resolveQuery({ query, note: text, uid, actor });
      else if (mode === "reopen") await reopenQuery({ query, text, uid, actor });
      setMode(""); setText("");
    } catch (failure) { setError(failure?.message || "That could not be saved. Try again."); } finally { setBusy(false); }
  }
  const choose = (next) => { setMode(next); setText(""); setError(""); };

  return (
    <div className={`${s.note} space-y-2`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={`font-semibold ${s.strong}`}>{query.subject}</p>
          <p className={`text-xs ${s.muted}`}>{queryHeading(query)}{query.createdAt?.seconds ? ` · ${stampText(new Date(query.createdAt.seconds * 1000).toISOString())}` : ""}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${resolved ? s.chip.sent : s.chip.submitted}`}>{resolved ? "Resolved" : "Open"}</span>
      </div>
      <button type="button" className={`text-sm font-semibold underline ${s.muted}`} onClick={() => setOpen(!open)}>{open ? "Hide the conversation" : "Show the conversation"}</button>
      {open && (
        <div className="space-y-2">
          {loadError && <p className={s.warn}>{loadError}</p>}
          <ol className="space-y-1.5">
            {thread.map((m) => (
              <li key={m.id} className="text-sm">
                <p className={s.body}><b className={s.strong}>{m.authorName || "Someone"}</b> {KIND_WORDS[m.kind] || "wrote"} <span className={s.muted}>· {whenText(m)}</span></p>
                {m.text && <p className={`${s.body} whitespace-pre-wrap`}>{m.text}</p>}
              </li>
            ))}
          </ol>
          {resolved && query.resolvedByName && <p className={`text-xs ${s.muted}`}>Resolved by {query.resolvedByName}{query.resolvedAt?.seconds ? ` on ${stampText(new Date(query.resolvedAt.seconds * 1000).toISOString())}` : ""}.</p>}
        </div>
      )}
      {!mode && (
        <div className="flex flex-wrap gap-2">
          {canReply(query, uid) && <button type="button" className={s.btn} onClick={() => choose("reply")}>Reply</button>}
          {canResolve(query, uid) && <button type="button" className={s.btn} onClick={() => choose("resolve")}>Mark as resolved</button>}
          {canReopen(query, uid) && <button type="button" className={s.btn} onClick={() => choose("reopen")}>Open it again</button>}
        </div>
      )}
      {mode && (
        <div className="space-y-2">
          <label className={s.label}>{mode === "reply" ? "Your reply" : mode === "resolve" ? "A note on how it was settled (optional)" : "Why is it being opened again?"}
            <textarea className={s.field} rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          {error && <p className={`text-sm font-semibold ${s.bad}`} role="alert">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className={s.primary} disabled={busy} onClick={submit}>{busy ? "Saving…" : mode === "reply" ? "Send reply" : mode === "resolve" ? "Mark as resolved" : "Open it again"}</button>
            <button type="button" className={s.btn} disabled={busy} onClick={() => choose("")}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// The payroll team raises a query on one timesheet
export function RaiseQuery({ sheet, skin = "desktop", onDone }) {
  const s = SKINS[skin];
  const { user, displayName } = useAuth();
  const actor = { displayName: displayName || user?.email || "" };
  const [to, setTo] = useState(QUERY_TO.person);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const managerName = sheet.managerName || sheet.decision?.by || "";
  async function submit() {
    setBusy(true); setError("");
    try { await raiseQuery({ sheet, to, text, uid: user?.uid, actor }); setText(""); onDone?.(); } catch (failure) { setError(failure?.message || "That could not be saved. Try again."); } finally { setBusy(false); }
  }
  return (
    <div className={`${s.note} space-y-2`}>
      <p className={`font-semibold ${s.strong}`}>Raise a query</p>
      <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="Who is the query for?">
        <label className="flex items-center gap-2"><input type="radio" name={`to-${sheet.id}`} checked={to === QUERY_TO.person} onChange={() => setTo(QUERY_TO.person)} /> {sheet.staffName} (the person)</label>
        <label className={`flex items-center gap-2 ${sheet.managerUid ? "" : "opacity-50"}`}><input type="radio" name={`to-${sheet.id}`} disabled={!sheet.managerUid} checked={to === QUERY_TO.manager} onChange={() => setTo(QUERY_TO.manager)} /> {managerName || "Their line manager"} (the line manager)</label>
      </div>
      <label className={s.label}>What do you need to know?
        <textarea className={s.field} rows={3} maxLength={1000} value={text} onChange={(e) => { setText(e.target.value); setError(""); }} placeholder="e.g. Was the overtime on Thursday agreed?" />
      </label>
      {error && <p className={`text-sm font-semibold ${s.bad}`} role="alert">{error}</p>}
      <button type="button" className={s.primary} disabled={busy} onClick={submit}>{busy ? "Saving…" : "Send the query"}</button>
      <p className={`text-xs ${s.muted}`}>They are told straight away. What is asked and answered is kept on the timesheet's history and can not be changed. You mark it resolved when you have what you need.</p>
    </div>
  );
}

// Queries raised with this login. scope "person": about my own timesheet; "manager": raised with me as a line manager.
export function QueriesInbox({ scope = "person", skin = "desktop" }) {
  const s = SKINS[skin];
  const queries = useQueries(scope, true);
  const list = queries.list || [];
  const open = list.filter((q) => q.status !== QUERY_STATUS.resolved);
  const done = list.filter((q) => q.status === QUERY_STATUS.resolved);
  if (queries.list === null || !list.length) return queries.error ? <p className={s.warn}>{queries.error}</p> : null;
  return (
    <div className={`${s.card} space-y-2`}>
      <p className={`font-semibold ${s.strong}`}>{scope === "manager" ? "Queries from payroll about your team" : "Queries from payroll about your timesheet"}{open.length ? ` (${open.length} waiting for a reply)` : ""}</p>
      {open.map((q) => <QueryThread key={q.id} query={q} skin={skin} open />)}
      {done.length > 0 && <details><summary className={`cursor-pointer text-sm font-semibold ${s.muted}`}>Resolved ({done.length})</summary><div className="mt-2 space-y-2">{done.map((q) => <QueryThread key={q.id} query={q} skin={skin} />)}</div></details>}
    </div>
  );
}
