import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { QUICK_MESSAGES, MESSAGE_MAX, REMIND_OPTIONS, buildReplacement, isRealChange, prepareMessage, remindAtFor, replacementOptions } from "@/lib/kitCheckActions";

// The three quick actions on the phone's kit check, as bottom sheets. Each one
// only collects the choice and hands it back; the screen decides what to do.

const field = "mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-3 font-normal";
const primary = "mt-4 w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3.5 font-bold text-white disabled:opacity-50";

function Sheet({ label, eyebrow, title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end bg-black/50" role="dialog" aria-modal="true" aria-label={label}>
      <div className="max-h-[calc(100dvh-var(--pvx-mobile-content-bottom)-env(safe-area-inset-top))] w-full overflow-y-auto rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[var(--medtrak-text)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">{eyebrow}</p>
            <h2 className="mt-1 text-xl font-bold">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--medtrak-border)]"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Problem = ({ text }) => (text ? <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-800">{text}</p> : null);

// ---- swap this item for a new one ---------------------------------------------
export function ReplaceSheet({ item, stockItems, onConfirm, onClose, busy = false, error = "" }) {
  const { stock, options } = useMemo(() => replacementOptions(item, stockItems), [item, stockItems]);
  const firstNew = options.find((o) => !o.current);
  const [pickedKey, setPickedKey] = useState(firstNew?.key || "");
  const [manual, setManual] = useState(!stock || options.length === 0);
  const [typed, setTyped] = useState({ batch_number: "", expiry_date: "" });

  const picked = options.find((o) => o.key === pickedKey);
  const chosen = manual ? typed : picked || {};
  const replacement = buildReplacement(item, chosen);
  const ready = (replacement.batch_number || replacement.expiry_date) && isRealChange(replacement);

  return (
    <Sheet label="Replace with a new one" eyebrow="Replace" title={item.name} subtitle={`Now in the kit: ${item.defaultBatch ? `batch ${item.defaultBatch}` : "no batch"}${item.defaultExpiry ? `, expires ${item.defaultExpiry.split("-").reverse().join("/")}` : ""}. Pick the new one.`} onClose={onClose}>
      {!manual && (
        <div className="mt-4 grid gap-2">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={o.current}
              onClick={() => setPickedKey(o.key)}
              className={`rounded-2xl border p-3 text-left ${pickedKey === o.key ? "border-[var(--medtrak-accent)] bg-blue-50 text-blue-950" : "border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]"} ${o.current ? "opacity-50" : ""}`}
            >
              <span className="block font-bold">{o.label}</span>
              {o.current && <span className="block text-xs">This is the one already in the kit</span>}
            </button>
          ))}
          {!firstNew && <p className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">There's no other in-date batch of this in stock. Enter the new one below, or message someone to order more.</p>}
        </div>
      )}

      {manual && (
        <div className="mt-4 grid gap-3">
          {stock && <p className="text-xs text-[var(--medtrak-muted)]">Enter the batch and expiry printed on the new one.</p>}
          {!stock && <p className="text-xs text-[var(--medtrak-muted)]">This item isn't linked to a stock record, so type what's printed on the new one.</p>}
          <label className="text-sm font-semibold">Batch number<input value={typed.batch_number} onChange={(e) => setTyped((p) => ({ ...p, batch_number: e.target.value }))} className={field} /></label>
          <label className="text-sm font-semibold">Expiry date<input type="date" value={typed.expiry_date} onChange={(e) => setTyped((p) => ({ ...p, expiry_date: e.target.value }))} className={field} /></label>
        </div>
      )}

      {stock && options.length > 0 && (
        <button type="button" onClick={() => setManual((m) => !m)} className="mt-3 text-sm font-semibold text-[var(--medtrak-accent)] underline">
          {manual ? "Pick from the batches in stock instead" : "The new one isn't listed - type its details"}
        </button>
      )}

      <Problem text={error} />
      <button type="button" disabled={!ready || busy} onClick={() => onConfirm(replacement)} className={primary}>{busy ? "Saving…" : "Replace and mark present"}</button>
    </Sheet>
  );
}

// ---- message a colleague about this item --------------------------------------
export function MessageSheet({ item, kitName, staff, staffError, onRetryStaff, onSend, onClose, busy = false, error = "" }) {
  const [toUid, setToUid] = useState("");
  const [text, setText] = useState("");
  const prepared = prepareMessage(text);

  return (
    <Sheet label="Message someone" eyebrow="Message" title={item.name} subtitle={`They'll get a notification about this item in ${kitName}.`} onClose={onClose}>
      <label className="mt-4 block text-sm font-semibold">Who to tell
        <select value={toUid} onChange={(e) => setToUid(e.target.value)} className={field} disabled={!staff.length}>
          <option value="">{staff.length ? "Choose a colleague" : staffError ? "Couldn't load colleagues" : "Loading colleagues…"}</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.label}{s.role ? ` (${s.role})` : ""}</option>)}
        </select>
      </label>
      {staffError && <p role="alert" className="mt-2 text-sm text-amber-800">{staffError} <button type="button" onClick={onRetryStaff} className="underline">Try again</button></p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_MESSAGES.map((q) => (
          <button key={q} type="button" onClick={() => setText(q)} className={`rounded-full border px-3 py-1.5 text-sm ${text === q ? "border-[var(--medtrak-accent)] bg-blue-50 text-blue-950" : "border-[var(--medtrak-border)]"}`}>{q}</button>
        ))}
      </div>
      <label className="mt-3 block text-sm font-semibold">Message
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={MESSAGE_MAX + 50} placeholder="Choose a quick one above, or write your own" className={field} />
      </label>
      <p className="mt-1 text-right text-xs text-[var(--medtrak-muted)]">{text.trim().length}/{MESSAGE_MAX}</p>

      <Problem text={error || (text && !prepared.ok ? prepared.error : "")} />
      <button type="button" disabled={!toUid || !prepared.ok || busy} onClick={() => onSend({ toUid, toLabel: staff.find((s) => s.id === toUid)?.label || "", text: prepared.text })} className={primary}>{busy ? "Sending…" : "Send message"}</button>
    </Sheet>
  );
}

// ---- flag it to come back to --------------------------------------------------
export function LaterSheet({ item, onConfirm, onClose, busy = false, error = "" }) {
  const [optionId, setOptionId] = useState("tomorrow");
  const [note, setNote] = useState("");
  const when = remindAtFor(optionId);

  return (
    <Sheet label="Remind me later" eyebrow="Do later" title={item.name} subtitle="Move on to the next item. You'll get a reminder to come back to this one." onClose={onClose}>
      <div className="mt-4 grid gap-2">
        {REMIND_OPTIONS.map((o) => (
          <button key={o.id} type="button" onClick={() => setOptionId(o.id)} className={`rounded-2xl border p-3 text-left font-bold ${optionId === o.id ? "border-[var(--medtrak-accent)] bg-blue-50 text-blue-950" : "border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]"}`}>
            {o.label}
            <span className="block text-xs font-normal opacity-75">{when && optionId === o.id ? when.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
          </button>
        ))}
      </div>
      <label className="mt-3 block text-sm font-semibold">Note to yourself (optional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={MESSAGE_MAX} placeholder="e.g. Check if the new delivery has arrived" className={field} />
      </label>
      <Problem text={error} />
      <button type="button" disabled={busy} onClick={() => onConfirm({ optionId, note: note.trim(), remindAt: remindAtFor(optionId) })} className={primary}>{busy ? "Setting…" : "Remind me, and move on"}</button>
    </Sheet>
  );
}
