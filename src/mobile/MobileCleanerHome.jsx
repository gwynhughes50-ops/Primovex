import { useEffect, useState } from "react";
import { CheckCircle2, Nfc, SprayCan, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSenseSession } from "@/contexts/SenseSessionContext";
import { getActiveCleaningSession, subscribeRoomOperational } from "@/modules/facilities/services/cleaningRecordService";
import { reportRoomIssue } from "@/services/roomIssueService";

function elapsedLabel(startedAt) {
  if (!startedAt) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// The entire mobile experience for the Cleaner role: nothing but "scan the
// room's tag" instructions and a way to report an issue to the caretaker.
// No bottom nav, no stock/temperature/other tabs — deliberately minimal.
export default function MobileCleanerHome({ onScanRoom }) {
  const { displayName } = useAuth();
  const { activeSenseSession } = useSenseSession();
  const [roomOperational, setRoomOperational] = useState({});
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueNote, setIssueNote] = useState("");
  const [issueStatus, setIssueStatus] = useState("idle");
  const [issueMessage, setIssueMessage] = useState("");

  useEffect(() => subscribeRoomOperational(setRoomOperational), []);

  const roomId = activeSenseSession?.senseObjectId;
  const roomName = activeSenseSession?.senseObjectName;
  const cleaningSession = roomId ? getActiveCleaningSession(roomOperational, roomId) : null;

  async function submitIssue() {
    if (!issueNote.trim()) return;
    setIssueStatus("sending");
    setIssueMessage("");
    try {
      await reportRoomIssue({ roomId: roomId || "", roomName: roomName || "Unspecified room", note: issueNote.trim() });
      setIssueStatus("success");
      setIssueMessage("Sent to the caretaker.");
      setIssueNote("");
      window.setTimeout(() => { setIssueOpen(false); setIssueStatus("idle"); setIssueMessage(""); }, 1600);
    } catch (error) {
      setIssueStatus("error");
      setIssueMessage(error?.message || "Could not send this — try again.");
    }
  }

  const firstName = String(displayName || "").trim().split(" ")[0] || "there";

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[var(--medtrak-bg)] px-6 py-10 text-center text-[var(--medtrak-text)]">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--medtrak-accent)]">Cleaning team</p>
        <h1 className="mt-2 text-2xl font-bold">Hi {firstName}</h1>
      </div>

      {cleaningSession ? (
        <div className="w-full max-w-sm rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
          <SprayCan className="mx-auto h-8 w-8 text-amber-600" />
          <p className="mt-3 font-bold">Cleaning {roomName}</p>
          <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Started {elapsedLabel(cleaningSession.startedAt)} ago. Scan this room's tag again on your way out — two beeps means you're done and can move on.</p>
        </div>
      ) : (
        <div className="w-full max-w-sm rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-6">
          <Nfc className="mx-auto h-8 w-8 text-[var(--medtrak-accent)]" />
          <p className="mt-3 font-bold">Scan a room's tag to start</p>
          <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Hold your phone to the tag on the wall. One beep means cleaning has started. Scan the same tag again when you leave for two beeps, then move on to the next room — Primovex records who, when and how long automatically.</p>
        </div>
      )}

      <button type="button" onClick={onScanRoom} className="flex w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-[var(--medtrak-accent)] px-6 py-4 text-base font-bold text-white">
        <Nfc className="h-5 w-5" /> Scan room code instead
      </button>

      <button type="button" onClick={() => setIssueOpen(true)} className="flex w-full max-w-sm items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-6 py-4 text-base font-bold">
        <TriangleAlert className="h-5 w-5" /> Report an issue with this room
      </button>

      {issueOpen && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/55 sm:items-center">
          <div className="w-full max-w-md rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-left sm:rounded-2xl">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Report an issue</p>
            <h2 className="mt-1 text-xl font-bold">{roomName || "Current room"}</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{roomName ? "This goes straight to the caretaker." : "Scan a room first so the caretaker knows where to go."}</p>
            <textarea value={issueNote} onChange={(e) => setIssueNote(e.target.value)} rows={4} placeholder="e.g. Sink is blocked, out of paper towels" className="mt-4 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3" />
            {issueMessage && <p className={`mt-3 rounded-xl border p-3 text-sm ${issueStatus === "error" ? "border-red-500/30 bg-red-500/10 text-red-700" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"}`}>{issueStatus === "success" && <CheckCircle2 className="mr-2 inline h-4 w-4" />}{issueMessage}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setIssueOpen(false); setIssueNote(""); setIssueStatus("idle"); setIssueMessage(""); }} className="rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 font-bold">Cancel</button>
              <button type="button" onClick={submitIssue} disabled={!issueNote.trim() || issueStatus === "sending"} className="rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3 font-bold text-white disabled:opacity-50">{issueStatus === "sending" ? "Sending…" : "Send"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
