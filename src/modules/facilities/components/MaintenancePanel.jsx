import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { loadFacilitiesState } from "@/modules/facilities/services/facilitiesStore";
import { formatWhen } from "@/components/compliance/complianceView";
import { ISSUE_STATUS, PRIORITIES, ageDays, isOpenIssue, issueSummary, reportedMs, statusLabel } from "@/modules/maintenance/maintenance";
import { completeIssue, raiseIssue, reopenIssue, setIssuePriority, startIssue, useMaintenanceIssues } from "@/modules/maintenance/maintenanceService";

const PRIORITY = {
  high: "bg-rose-500/15 text-rose-300",
  medium: "bg-amber-500/15 text-amber-300",
  low: "bg-slate-500/15 text-slate-300",
};
const FIELD = "rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60 [&>option]:bg-slate-900";

// Maintenance issues, shared across every device: anyone raises one (on the phone, or here), the caretaker and practice
// manager work them (start, add a note, mark done). Replaces the old per-computer list.
export default function MaintenancePanel() {
  const { displayName, user, can, isAdmin } = useAuth();
  const mayWork = can("compliance.write") || can("operations.manage") || isAdmin;
  const actor = { uid: user?.uid || "", displayName: displayName || user?.email || "Signed-in user" };
  const { list, error: loadError } = useMaintenanceIssues(true);
  const [rooms, setRooms] = useState(() => loadFacilitiesState().rooms || []);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ roomId: "", note: "", urgent: false });
  const [noteFor, setNoteFor] = useState("");
  const [noteText, setNoteText] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => setRooms(loadFacilitiesState().rooms || []);
    window.addEventListener("primovex:space-registry-changed", refresh);
    window.addEventListener("primovex:facilities-changed", refresh);
    return () => { window.removeEventListener("primovex:space-registry-changed", refresh); window.removeEventListener("primovex:facilities-changed", refresh); };
  }, []);

  const sortedRooms = useMemo(() => [...rooms].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })), [rooms]);
  const issues = list || [];
  const open = issues.filter(isOpenIssue);
  const done = issues.filter((i) => !isOpenIssue(i));
  const summary = issueSummary(issues);

  async function run(id, work, doneText) {
    setBusyId(id); setError(""); setMessage("");
    try { await work(); setMessage(doneText); } catch (problem) { setError(problem?.message || "That didn't work. Check you have permission."); } finally { setBusyId(""); }
  }

  async function add() {
    const room = rooms.find((r) => r.id === form.roomId);
    await run("new", async () => {
      await raiseIssue({ roomId: room?.id || "", roomName: room?.name || "", note: form.note, urgent: form.urgent, source: "desktop", actor });
      setForm({ roomId: "", note: "", urgent: false });
      setAdding(false);
    }, "Reported. The caretaker has been told.");
  }

  const card = (item) => (
    <div key={item.id} className="rounded-xl border border-white/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-100">{item.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.status === ISSUE_STATUS.closed ? "bg-emerald-500/15 text-emerald-300" : item.status === ISSUE_STATUS.inProgress ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300"}`}>{statusLabel[item.status] || item.status}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${PRIORITY[item.priority] || PRIORITY.low}`}>{PRIORITIES.find((p) => p.key === item.priority)?.label || item.priority}</span>
          </div>
          <div className="mt-1 text-sm text-slate-400">{item.roomName || "Unknown room"} • reported by {item.reportedBy || "someone"} • {formatWhen(item.reportedAt || (reportedMs(item) ? new Date(reportedMs(item)) : null))}{isOpenIssue(item) && ageDays(item) > 0 ? ` • ${ageDays(item)} day${ageDays(item) === 1 ? "" : "s"} old` : ""}</div>
          {(item.updates || []).length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
              {item.updates.slice(-4).map((u, i) => <li key={`${u.atMs}-${i}`}>{u.text} <span className="text-slate-500">({u.by}, {formatWhen(new Date(u.atMs))})</span></li>)}
            </ul>
          )}
        </div>
        {mayWork && (
          <div className="flex flex-wrap items-center gap-2">
            {isOpenIssue(item) ? (
              <>
                <select value={item.priority} onChange={(e) => run(item.id, () => setIssuePriority(item.id, e.target.value, actor), "Priority changed.")} aria-label="Priority" className={FIELD}>
                  {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
                {item.status === ISSUE_STATUS.open && <Button variant="outline" disabled={busyId === item.id} className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200" onClick={() => run(item.id, () => startIssue(item.id, actor), "Marked as in progress.")}>Start work</Button>}
                <Button variant="outline" disabled={busyId === item.id} className="rounded-full border-emerald-400/40 bg-emerald-500/10 text-xs text-emerald-200" onClick={() => { setNoteFor(item.id); setNoteText(""); }}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark complete</Button>
              </>
            ) : <Button variant="outline" disabled={busyId === item.id} className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200" onClick={() => run(item.id, () => reopenIssue(item.id, actor), "Reopened.")}>Reopen</Button>}
          </div>
        )}
      </div>
      {noteFor === item.id && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={noteText} onChange={(e) => setNoteText(e.target.value)} maxLength={300} placeholder="What was done? (optional)" aria-label="What was done" className={`${FIELD} min-w-64 flex-1`} />
          <Button disabled={busyId === item.id} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-xs text-slate-950" onClick={() => run(item.id, async () => { await completeIssue(item.id, actor, noteText); setNoteFor(""); }, "Marked complete.")}>Save</Button>
          <Button variant="outline" className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200" onClick={() => setNoteFor("")}>Cancel</Button>
        </div>
      )}
      {!isOpenIssue(item) && item.closedBy && <div className="mt-2 text-sm text-emerald-300">Completed by {item.closedBy}</div>}
    </div>
  );

  return (
    <Card className="border border-white/10 bg-slate-900/70 p-4 shadow-lg backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Wrench className="h-4 w-4 text-teal-300" aria-hidden="true" /> Maintenance</h2>
          <p className="text-xs text-slate-500">Anything that needs fixing, raised by anyone (on the phone or here) and worked by the caretaker. {summary.open ? `${summary.open} open${summary.urgent ? `, ${summary.urgent} urgent` : ""}.` : ""}</p>
        </div>
        <Button variant="outline" className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200" onClick={() => setAdding((v) => !v)}><Plus className="mr-1 h-3.5 w-3.5" /> Report an issue</Button>
      </div>

      {adding && (
        <div className="mt-3 rounded-xl border border-teal-300/30 bg-slate-950/40 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} aria-label="Room" className={FIELD}>
              <option value="">Choose the room…</option>
              {sortedRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={400} placeholder="What is wrong? e.g. hand dryer not working" aria-label="What is wrong" className={`${FIELD} sm:col-span-2`} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={form.urgent} onChange={(e) => setForm({ ...form, urgent: e.target.checked })} /> Urgent</label>
            <Button disabled={busyId === "new"} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-xs text-slate-950" onClick={add}>Report it</Button>
            <Button variant="outline" className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-emerald-300" role="status">{message}</p>}
      {(error || loadError) && <p className="mt-3 text-sm text-rose-300" role="alert">{error || loadError}</p>}

      <div className="mt-4 space-y-3">
        {list === null && <p className="text-sm text-slate-500">Loading…</p>}
        {list !== null && open.length === 0 && <p className="text-sm text-slate-500">No open maintenance issues.</p>}
        {open.map(card)}
      </div>

      {done.length > 0 && (
        <div className="mt-5">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="text-xs font-semibold text-slate-400 underline">{showDone ? "Hide" : "Show"} {done.length} completed</button>
          {showDone && <div className="mt-3 space-y-3">{done.slice(0, 100).map(card)}</div>}
        </div>
      )}
    </Card>
  );
}
