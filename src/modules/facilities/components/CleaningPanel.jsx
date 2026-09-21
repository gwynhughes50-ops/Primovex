import React, { useEffect, useMemo, useState } from "react";
import { ClipboardPen, UserRound, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { loadFacilitiesState } from "@/modules/facilities/services/facilitiesStore";
import { addManualCleaningLog, subscribeCleaningLogs, subscribeRoomOperational } from "@/modules/facilities/services/cleaningRecordService";
import { formatWhen, localDateInput, localTimeInput } from "@/components/compliance/complianceView";

const TH = "py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const TD = "py-2 pr-3 align-top text-sm text-slate-200";
const FIELD = "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none [&>option]:bg-slate-900";
const REASONS = ["Forgot to tap the tag", "Tag damaged or missing", "No phone available", "Other"];

function ManualCleanDialog({ rooms, roomOperational, onClose }) {
  const { user, displayName } = useAuth();
  const [roomId, setRoomId] = useState("");
  const [cleanedBy, setCleanedBy] = useState("");
  const [date, setDate] = useState(localDateInput());
  const [time, setTime] = useState(localTimeInput());
  const [note, setNote] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [reasonOther, setReasonOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return setError("Choose the room.");
    if (!cleanedBy.trim()) return setError("Enter who cleaned it.");
    const performedAt = new Date(`${date}T${time || "00:00"}`);
    if (Number.isNaN(performedAt.getTime())) return setError("Enter the date and time it was done.");
    if (performedAt.getTime() > Date.now() + 60_000) return setError("The date and time can't be in the future.");
    const why = reason === "Other" ? reasonOther.trim() : reason;
    if (!why) return setError("Say why this is being entered by hand.");
    setBusy(true);
    try {
      await addManualCleaningLog({
        roomId: room.id,
        roomName: room.name,
        cleanedBy,
        performedAt,
        note,
        reason: why,
        enteredBy: displayName || user?.email || "Unknown user",
        enteredByUid: user?.uid || null,
        currentLastCleanedAt: roomOperational[room.id]?.lastCleanedAt || null,
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError("Could not save the record. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Add a clean by hand</h3>
            <p className="mt-1 text-xs text-slate-400">For a clean that wasn't recorded with the room tag. It is marked as entered by hand, with your name.</p>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-200" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-slate-300">Room
            <select className={`${FIELD} mt-1`} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Choose a room</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-300">Who cleaned it
            <Input className="mt-1" value={cleanedBy} onChange={(e) => setCleanedBy(e.target.value)} maxLength={80} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-300">Date
              <Input type="date" className="mt-1" value={date} max={localDateInput()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-slate-300">Time
              <Input type="time" className="mt-1" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-300">Notes / issues (optional)
            <textarea className={`${FIELD} mt-1`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-slate-300">Why is this being entered by hand?
            <select className={`${FIELD} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {reason === "Other" && <Input placeholder="Reason" value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} maxLength={160} />}
        </div>
        {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60" onClick={onClose}>Cancel</Button>
          <Button className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-xs text-slate-950" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save record"}</Button>
        </div>
      </div>
    </div>
  );
}

// Cleaning history (moved here from Facilities): who cleaned which room, when,
// how long it took, and any note or issue they added on the phone.
export default function CleaningPanel() {
  const { can } = useAuth();
  const [logs, setLogs] = useState([]);
  const [roomOperational, setRoomOperational] = useState({});
  const [rooms, setRooms] = useState(() => loadFacilitiesState().rooms);
  const [roomFilter, setRoomFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => subscribeCleaningLogs(setLogs), []);
  useEffect(() => subscribeRoomOperational(setRoomOperational), []);
  useEffect(() => {
    const refresh = () => setRooms(loadFacilitiesState().rooms);
    window.addEventListener("primovex:space-registry-changed", refresh);
    window.addEventListener("primovex:facilities-changed", refresh);
    return () => {
      window.removeEventListener("primovex:space-registry-changed", refresh);
      window.removeEventListener("primovex:facilities-changed", refresh);
    };
  }, []);

  const people = useMemo(() => [...new Set(logs.map((l) => l.cleanedBy).filter(Boolean))], [logs]);
  const rows = useMemo(
    () => logs.filter((l) => (roomFilter === "all" || l.roomId === roomFilter) && (personFilter === "all" || l.cleanedBy === personFilter)).slice(0, 300),
    [logs, roomFilter, personFilter]
  );

  return (
    <Card className="border border-white/10 bg-slate-900/70 p-4 shadow-lg backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Cleaning history</h2>
          <p className="text-xs text-slate-500">Recorded when the cleaner taps the room tag on the way in and out.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-400">Room
            <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className={`${FIELD} mt-1 w-44`}>
              <option value="all">All rooms</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400">Cleaner
            <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className={`${FIELD} mt-1 w-44`}>
              <option value="all">All staff</option>
              {people.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          {can("compliance.recordChecks") && (
            <Button variant="outline" className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60" onClick={() => setManualOpen(true)}>
              <ClipboardPen className="mr-2 h-4 w-4" /> Add a clean by hand
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-white/10"><th className={TH}>Room</th><th className={TH}>Cleaned by</th><th className={TH}>When</th><th className={TH}>Took</th><th className={TH}>Notes / issues</th><th className={TH}>Recorded</th></tr>
          </thead>
          <tbody>
            {rows.map((log) => (
              <tr key={log.id} className="border-b border-white/5">
                <td className={TD}><div className="font-medium text-slate-100">{log.roomName}</div></td>
                <td className={TD}><span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-teal-300" /> {log.cleanedBy}</span></td>
                <td className={TD}>{formatWhen(log.cleanedAt)}</td>
                <td className={TD}>{Number.isFinite(log.durationSeconds) ? `${Math.max(1, Math.round(log.durationSeconds / 60))} min` : "—"}</td>
                <td className={TD}>{log.notes ? <span className={log.issueReported ? "text-amber-300" : ""}>{log.issueReported ? "Issue: " : ""}{log.notes}</span> : "—"}</td>
                <td className={TD}>
                  {log.manualEntry
                    ? <span title={log.manualReason || ""} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">By hand{log.enteredBy ? ` (${log.enteredBy})` : ""}</span>
                    : <span className="text-xs text-slate-500">{log.method === "nfc-session" ? "Room tag" : log.method === "one-tap-confirmation" ? "One tap" : log.method || "—"}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-500">No cleaning records match these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {manualOpen && <ManualCleanDialog rooms={rooms} roomOperational={roomOperational} onClose={() => setManualOpen(false)} />}
    </Card>
  );
}
