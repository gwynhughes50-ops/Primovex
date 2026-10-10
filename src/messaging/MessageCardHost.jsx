import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { BellRing, CheckCircle2, ChevronLeft, ChevronRight, Clock, MessageSquare, Send, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { functions } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import useNotifications from "@/hooks/useNotifications";
import { QUICK_REPLIES, REPLY_MAX, SNOOZE_CHOICES, messageQueue, senderOf, validateReply, whenLabel } from "./messageCard";

// A message from a colleague appears in the middle of the screen, on the desktop and the phone, as soon as
// it arrives (or when the person signs in): who it is from, what it says, and Reply, Dismiss or Snooze.
// Alerts and reminders from the system keep the small corner pop-up. On the phone a small "Messages" button
// brings back anything put aside or snoozed.

const isPhone = () => typeof document !== "undefined" && document.documentElement.dataset.primovexClient === "android";

export default function MessageCardHost() {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const navigate = useNavigate();
  const { rows, markRead, snooze } = useNotifications(uid);
  const [hidden, setHidden] = useState(() => new Set());
  const [browsing, setBrowsing] = useState(false); // opened from "Messages": everything unread, newest first
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState("read"); // read | reply | snooze
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [tick, setTick] = useState(() => Date.now());
  const firstButton = useRef(null);
  const phone = isPhone();

  // wakes snoozed messages while the app is open
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const now = useMemo(() => new Date(tick), [tick]);
  const waiting = useMemo(() => messageQueue(rows, { now, hidden }), [rows, now, hidden]);
  const everything = useMemo(() => messageQueue(rows, { now, hidden, everything: true }), [rows, now, hidden]);
  const queue = browsing ? everything : waiting;
  const current = queue[browsing ? Math.min(index, Math.max(queue.length - 1, 0)) : 0] || null;

  const reset = useCallback(() => { setMode("read"); setText(""); setError(""); setBusy(false); }, []);
  useEffect(() => { reset(); }, [current?.id, reset]);
  useEffect(() => { if (!current && browsing) setBrowsing(false); }, [current, browsing]);
  useEffect(() => { if (current && mode === "read") firstButton.current?.focus?.(); }, [current?.id, mode]);

  const putAside = useCallback(() => {
    if (!current) return;
    if (browsing) { setBrowsing(false); return; }
    setHidden((old) => new Set(old).add(current.id));
  }, [browsing, current]);

  useEffect(() => {
    if (!current) return undefined;
    const onKey = (event) => { if (event.key === "Escape") putAside(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, putAside]);

  const run = async (work) => {
    setBusy(true);
    setError("");
    try { await work(); } catch (problem) { setError(problem?.message || "That didn't work. Try again."); } finally { setBusy(false); }
  };

  const dismiss = () => run(() => markRead(current.id));
  const snoozeFor = (option) => run(() => snooze(current.id, option));
  const sendReply = (payload) => run(async () => {
    const result = await httpsCallable(functions, "replyToMessage")({ notificationId: current.id, ...payload });
    setToast(`Reply sent to ${result?.data?.toName || senderOf(current)}.`);
    window.setTimeout(() => setToast(""), 2800);
  });
  const sendTyped = () => {
    const checked = validateReply(text);
    if (!checked.ok) { setError(checked.error); return; }
    sendReply({ text: checked.text });
  };
  const openLink = () => {
    const url = current?.actionUrl;
    putAside();
    if (url && url !== "/notifications") navigate(url);
  };

  if (isSafeSyntheticMode() || !uid) return null;
  const toastView = toast ? <div role="status" className="fixed bottom-24 left-1/2 z-[170] flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {toast}</div> : null;

  // nothing on screen: on the phone, a small button for anything put aside or snoozed
  if (!current) {
    const unread = messageQueue(rows, { now, hidden, everything: true });
    if (!phone || !unread.length) return toastView;
    return (
      <>
      {toastView}
      <button type="button" onClick={() => { setBrowsing(true); setIndex(0); }} className="fixed bottom-24 left-3 z-[120] inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 text-sm font-semibold shadow-lg" aria-label={`Messages, ${unread.length} unread`}>
        <MessageSquare className="h-4 w-4 text-[var(--medtrak-accent)]" aria-hidden="true" /> Messages ({unread.length})
      </button>
      </>
    );
  }

  const position = browsing ? `${Math.min(index, queue.length - 1) + 1} of ${queue.length}` : queue.length > 1 ? `1 of ${queue.length} waiting` : "";
  const hasLink = !phone && current.actionUrl && current.actionUrl !== "/notifications";

  return (
    <>
    {toastView}
    <div className="fixed inset-0 z-[160] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) putAside(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="message-card-title" className="w-full max-w-md rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 text-[var(--medtrak-text)] shadow-2xl">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--medtrak-accent)]/15 text-[var(--medtrak-accent)]"><BellRing className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h2 id="message-card-title" className="truncate font-bold">{current.kind === "message-reply" ? `${senderOf(current)} replied` : `Message from ${senderOf(current)}`}</h2>
              <p className="text-xs text-[var(--medtrak-muted)]">{whenLabel(current.createdAt, now)}{position ? ` · ${position}` : ""}</p>
            </div>
          </div>
          <button type="button" onClick={putAside} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--medtrak-muted)] hover:bg-black/5" aria-label="Not now, keep it for later" title="Not now"><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>

        <p className="mt-4 whitespace-pre-line rounded-2xl bg-black/5 px-4 py-3 text-base leading-6">{current.message}</p>

        {mode === "reply" ? (
          <div className="mt-4">
            <label htmlFor="message-reply" className="text-xs font-semibold text-[var(--medtrak-muted)]">Your reply to {senderOf(current)}</label>
            <textarea id="message-reply" value={text} maxLength={REPLY_MAX} onChange={(event) => setText(event.target.value)} rows={3} autoFocus placeholder="Keep it short. No patient details." className="mt-1 w-full resize-none rounded-2xl border border-[var(--medtrak-border)] bg-transparent px-3 py-2 text-base outline-none focus:border-[var(--medtrak-accent)]" />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={sendTyped} disabled={busy || !text.trim()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--medtrak-accent)] px-4 font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" aria-hidden="true" /> Send reply</button>
              <button type="button" onClick={() => { setMode("read"); setError(""); }} disabled={busy} className="min-h-11 rounded-xl border border-[var(--medtrak-border)] px-4 font-semibold">Back</button>
            </div>
          </div>
        ) : mode === "snooze" ? (
          <div className="mt-4">
            <p className="text-xs font-semibold text-[var(--medtrak-muted)]">Remind me about this</p>
            <div className="mt-2 grid gap-2">
              {SNOOZE_CHOICES.map((choice) => (
                <button key={choice.option} type="button" onClick={() => snoozeFor(choice.option)} disabled={busy} className="min-h-11 rounded-xl border border-[var(--medtrak-border)] px-4 text-left font-semibold">{choice.label}</button>
              ))}
              <button type="button" onClick={() => setMode("read")} disabled={busy} className="min-h-11 rounded-xl px-4 text-left text-[var(--medtrak-muted)]">Back</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quick replies">
              {QUICK_REPLIES.map((quick, i) => (
                <button key={quick.key} ref={i === 0 ? firstButton : null} type="button" onClick={() => sendReply({ quick: quick.key })} disabled={busy} className="min-h-11 rounded-full border border-[var(--medtrak-accent)] px-4 text-sm font-bold text-[var(--medtrak-accent)] disabled:opacity-40">{quick.label}</button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setMode("reply")} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--medtrak-accent)] px-2 text-sm font-bold text-white disabled:opacity-40"><MessageSquare className="h-4 w-4" aria-hidden="true" /> Reply</button>
              <button type="button" onClick={() => setMode("snooze")} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--medtrak-border)] px-2 text-sm font-bold"><Clock className="h-4 w-4" aria-hidden="true" /> Snooze</button>
              <button type="button" onClick={dismiss} disabled={busy} className="min-h-11 rounded-xl border border-[var(--medtrak-border)] px-2 text-sm font-bold">Dismiss</button>
            </div>
            {hasLink && <button type="button" onClick={openLink} className="mt-2 min-h-11 w-full rounded-xl px-2 text-sm font-semibold text-[var(--medtrak-accent)] underline">Open what it's about</button>}
          </>
        )}

        {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600" role="alert">{error}</p>}

        {browsing && queue.length > 1 && (
          <nav className="mt-4 flex items-center justify-between" aria-label="Messages">
            <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index <= 0} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold disabled:opacity-30"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Newer</button>
            <button type="button" onClick={() => setIndex((i) => Math.min(queue.length - 1, i + 1))} disabled={index >= queue.length - 1} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold disabled:opacity-30">Older <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </nav>
        )}
      </section>
    </div>
    </>
  );
}
