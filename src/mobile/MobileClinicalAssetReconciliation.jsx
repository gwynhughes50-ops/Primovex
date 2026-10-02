import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  PackagePlus,
  ShieldAlert,
  BellRing,
  MessageSquare,
  RefreshCw,
  ShoppingCart,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import useStock from "@/hooks/useStock";
import { resolveKitItems } from "@/lib/checklistKitHelpers";
import { buildReplacement, isRealChange } from "@/lib/kitCheckActions";
import { kitActionError, replaceKitItemBatch, sendKitMessage, setKitReminder } from "@/services/kitCheckService";
import { listStaffDirectory } from "@/services/staffDirectoryService";
import { LaterSheet, MessageSheet, ReplaceSheet } from "./kitcheck/KitCheckSheets";
import {
  createMonthlyCheck,
  getLatestCheck,
  listAnaphylaxisBoxes,
  listEmergencyAssets,
} from "@/lib/checklistsFirestore";

const RESOLUTIONS = [
  {
    id: "replace-from-stock",
    label: "Replace from stock",
    detail: "Record that a replacement must be taken from practice stock.",
    icon: PackagePlus,
  },
  {
    id: "borrow",
    label: "Borrow from another box",
    detail: "Record a controlled transfer from another box or location.",
    icon: ArrowLeft,
  },
  {
    id: "urgent-order",
    label: "Request urgent order",
    detail: "Record an urgent ordering follow-up for the ordering team.",
    icon: ShoppingCart,
  },
  {
    id: "follow-up",
    label: "Follow up later",
    detail: "Keep the box not ready and create a clear follow-up record.",
    icon: Clock3,
  },
];

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildResult(item, status, resolution = null) {
  return {
    itemId: item.id,
    itemName: item.name,
    status,
    qty: item.expectedQty ?? null,
    batch: item.defaultBatch ?? null,
    expiry: item.defaultExpiry ?? null,
    notes: resolution?.note || null,
    resolution: resolution
      ? {
          type: resolution.type,
          label: RESOLUTIONS.find((entry) => entry.id === resolution.type)?.label || resolution.type,
          sourceLocation: resolution.sourceLocation || null,
          urgency: resolution.type === "urgent-order" ? "urgent" : null,
          recordedAt: new Date().toISOString(),
          status: "pending",
        }
      : null,
  };
}

function ResultPill({ status }) {
  const tone = status === "OK" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : status === "N/A" ? "bg-slate-50 text-slate-600 border-slate-200" : "bg-red-50 text-red-700 border-red-200";
  const label = status === "OK" ? "Present" : status === "N/A" ? "Not required" : status;
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

export default function MobileClinicalAssetReconciliation({ kind = "anaphylaxis", requestedAssetId = null, onExit }) {
  const isEmergency = kind === "emergency";
  const collectionName = isEmergency ? "emergency_assets" : "anaphylaxis_boxes";
  const listEntities = isEmergency ? listEmergencyAssets : listAnaphylaxisBoxes;
  const assetPlural = isEmergency ? "emergency kits" : "anaphylaxis boxes";
  const assetExample = isEmergency ? "CMC Resus Trolley" : "Anaphylaxis Box 2";
  const { can, user, role, profile } = useAuth();
  const [boxes, setBoxes] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState({});
  const [resolutionFor, setResolutionFor] = useState(null);
  const [resolutionType, setResolutionType] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [sourceLocation, setSourceLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Quick actions on the current item: replace it, message someone, flag it for later.
  const [sheet, setSheet] = useState(null); // "replace" | "message" | "later"
  const [extras, setExtras] = useState({}); // itemId -> { messages: [], flaggedLater }
  const [staff, setStaff] = useState([]);
  const [staffError, setStaffError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveNotice, setSaveNotice] = useState(null);

  const { items: stockItems } = useStock({ includeArchived: false });
  const selected = useMemo(() => boxes.find((box) => box.id === selectedId) || null, [boxes, selectedId]);
  // Items linked to a stock record show its current batch / expiry (unless set
  // to use their own), so a new batch received in Inventory shows here too.
  const items = useMemo(() => resolveKitItems(selected?.items || [], stockItems || []), [selected, stockItems]);
  const currentItem = items[index] || null;
  const completedCount = Object.keys(results).length;
  const progress = items.length ? Math.round((completedCount / items.length) * 100) : 0;
  const canVerify = can("inventory.verify");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const rows = await listEntities();
        if (!active) return;
        setBoxes(rows);
        // A scanned kit label (or an Orb link) asks for a specific box - open
        // that one rather than always defaulting to the first in the list.
        // Falls back the same way if the requested id doesn't match anything
        // (wrong tab scanned, or the box was since deleted).
        // A label that names a box that isn't on file must not quietly open a
        // different box (and have someone check the wrong kit): say so instead.
        if (requestedAssetId && !rows.some((row) => row.id === requestedAssetId)) {
          setError(`This label points to a ${isEmergency ? "kit" : "box"} that isn't on file (${requestedAssetId}). It may have been deleted, or belong to another practice. Ask an administrator to check it.`);
          setSelectedId("");
          return;
        }
        setSelectedId(requestedAssetId || rows[0]?.id || "");
      } catch (loadError) {
        if (active) setError(loadError?.message || `${isEmergency ? "Emergency kits" : "Anaphylaxis boxes"} could not be loaded.`);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setIndex(0);
    setResults({});
    setSaved(false);
    getLatestCheck(collectionName, selectedId)
      .then((record) => active && setLatest(record))
      .catch(() => active && setLatest(null));
    return () => { active = false; };
  }, [selectedId]);

  function advance(fromIndex = index, answeredItemId = null) {
    const isAnswered = (item) => item.id === answeredItemId || Boolean(results[item.id]);
    const nextUnanswered = items.findIndex((item, itemIndex) => itemIndex > fromIndex && !isAnswered(item));
    if (nextUnanswered >= 0) setIndex(nextUnanswered);
    else {
      const firstUnanswered = items.findIndex((item) => !isAnswered(item));
      if (firstUnanswered >= 0) setIndex(firstUnanswered);
    }
  }

  function recordSimple(status) {
    if (!canVerify || !currentItem) return;
    setResults((previous) => ({ ...previous, [currentItem.id]: buildResult(currentItem, status) }));
    window.setTimeout(() => advance(index, currentItem.id), 160);
  }

  function openResolution(status) {
    if (!canVerify || !currentItem) return;
    setResolutionFor({ item: currentItem, status });
    setResolutionType("");
    setResolutionNote("");
    setSourceLocation("");
  }

  function confirmResolution() {
    if (!resolutionFor || !resolutionType) return;
    const result = buildResult(resolutionFor.item, resolutionFor.status, {
      type: resolutionType,
      note: resolutionNote,
      sourceLocation,
    });
    setResults((previous) => ({ ...previous, [resolutionFor.item.id]: result }));
    const resolvedIndex = items.findIndex((item) => item.id === resolutionFor.item.id);
    setResolutionFor(null);
    window.setTimeout(() => advance(resolvedIndex, resolutionFor.item.id), 160);
  }

  function openSheet(type) {
    if (!canVerify || !currentItem) return;
    setActionError("");
    setNotice("");
    setSheet(type);
    if (type === "message" && !staff.length) loadStaff();
  }

  async function loadStaff() {
    setStaffError("");
    try {
      const list = await listStaffDirectory();
      setStaff(list.filter((person) => person.id !== (user?.uid || profile?.uid)));
    } catch {
      setStaffError("The list of colleagues couldn't be loaded.");
    }
  }

  // Swap this item for a new one: it's marked present with the new batch and
  // expiry, and saving the check updates what the kit expects.
  function confirmReplace(replacement) {
    if (!currentItem) return;
    const base = buildResult(currentItem, "OK");
    setResults((previous) => ({
      ...previous,
      [currentItem.id]: { ...base, batch: replacement.batch_number || null, expiry: replacement.expiry_date || null, replacement },
    }));
    const at = index;
    const id = currentItem.id;
    setSheet(null);
    setNotice(`${currentItem.name} replaced - ${replacement.batch_number ? `batch ${replacement.batch_number}` : "new one"} noted. The kit is updated when you save the check.`);
    window.setTimeout(() => advance(at, id), 160);
  }

  async function confirmMessage({ toUid, toLabel, text }) {
    if (!currentItem) return;
    setActionBusy(true);
    setActionError("");
    try {
      await sendKitMessage({ collection: collectionName, kitId: selected.id, toUid, text, itemName: currentItem.name });
      setExtras((previous) => ({
        ...previous,
        [currentItem.id]: { ...(previous[currentItem.id] || {}), messages: [...(previous[currentItem.id]?.messages || []), { toUid, toLabel, text, at: new Date().toISOString() }] },
      }));
      setSheet(null);
      setNotice(`Message sent to ${toLabel || "your colleague"}.`);
    } catch (err) {
      setActionError(kitActionError(err));
    } finally {
      setActionBusy(false);
    }
  }

  // Flag this item to come back to: a reminder lands in your own inbox at the
  // time you pick, and the check moves on to the next item.
  async function confirmLater({ note, remindAt }) {
    if (!currentItem) return;
    setActionBusy(true);
    setActionError("");
    try {
      await setKitReminder({ collection: collectionName, kitId: selected.id, remindAt, text: note, itemName: currentItem.name });
      const id = currentItem.id;
      setExtras((previous) => ({ ...previous, [id]: { ...(previous[id] || {}), flaggedLater: true } }));
      setSheet(null);
      setNotice(`Reminder set for ${remindAt.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Moving on.`);
      window.setTimeout(() => advance(index, null), 160);
    } catch (err) {
      setActionError(kitActionError(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function saveVerification() {
    if (!canVerify || !selected || completedCount !== items.length) return;
    const resultRows = items.map((item) => ({
      ...results[item.id],
      ...(extras[item.id]?.messages?.length ? { messages: extras[item.id].messages } : {}),
      ...(extras[item.id]?.flaggedLater ? { flaggedLater: true } : {}),
    }));
    const missing = resultRows.filter((result) => result.status === "Missing").length;
    const expired = resultRows.filter((result) => result.status === "Expired").length;
    const pendingActions = resultRows.filter((result) => result.resolution).map((result) => ({
      itemId: result.itemId,
      itemName: result.itemName,
      issue: result.status,
      ...result.resolution,
    }));
    const readinessStatus = missing || expired ? "critical" : "ready";
    const actor = {
      uid: user?.uid || profile?.uid || null,
      role: role || profile?.role || null,
    };

    try {
      setSaving(true);
      await createMonthlyCheck(collectionName, selected.id, {
        monthKey: monthKey(),
        workflow: "mobile-one-item-reconciliation",
        asset: {
          id: selected.id,
          name: selected.name,
          location: selected.location || null,
          site: selected.site || null,
        },
        readiness: {
          score: Math.round(((items.length - missing - expired) / Math.max(items.length, 1)) * 100),
          status: readinessStatus,
          missing,
          expired,
          expiringSoon: 0,
        },
        results: resultRows,
        pendingActions,
        audit: {
          actor,
          completedAt: new Date().toISOString(),
          source: "primovex-mobile",
          stockChanged: false,
          readinessChangedBeforeSave: false,
          statement: "Resolution choices are recorded follow-up intentions. No stock movement, transfer or order was made. An item replaced during the check updates the kit's expected batch and expiry only.",
        },
      });
      setLatest(await getLatestCheck(collectionName, selected.id));
      // Items swapped for a new one during the check now change what the kit expects.
      const swaps = resultRows.filter((row) => row.replacement && isRealChange(row.replacement));
      const failed = [];
      for (const row of swaps) {
        try {
          await replaceKitItemBatch({ collection: collectionName, kitId: selected.id, itemId: row.itemId, batch_number: row.replacement.batch_number, expiry_date: row.replacement.expiry_date });
        } catch {
          failed.push(row.itemName);
        }
      }
      setSaveNotice({ updated: swaps.length - failed.length, failed });
      setSaved(true);
    } catch (saveError) {
      setError(saveError?.message || "The reconciliation could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5">Loading {assetPlural}…</div>;
  if (error && !selected) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{error}</div>;
  if (!selected) return <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5">No {assetPlural} are configured.</div>;

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--pvx-mobile-content-bottom))] w-full max-w-xl flex-col overflow-hidden bg-[var(--medtrak-bg)] text-[var(--medtrak-text)]">
      <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-panel)_96%,transparent)] px-3 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onExit} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]" aria-label="Exit reconciliation">
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="w-full truncate bg-transparent text-lg font-bold text-[var(--medtrak-text)] outline-none">
              {boxes.map((box) => <option key={box.id} value={box.id}>{box.name}{box.site ? ` · ${box.site}` : ""}</option>)}
            </select>
            <p className="truncate text-xs font-medium text-[var(--medtrak-muted)]">{selected.location || selected.site || "Room not assigned"} · {Math.min(completedCount + 1, items.length)}/{items.length}</p>
          </div>
          <span className="text-sm font-bold text-[var(--medtrak-accent)]">{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--medtrak-muted)_18%,transparent)]">
          <div className="h-full rounded-full bg-[var(--medtrak-accent)] transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {!canVerify && <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Your role can view this box but cannot complete a clinical verification.</div>}
        {error && <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {notice && !saved && <div role="status" className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}

        {saved ? (
          <section className="flex min-h-full flex-col items-center justify-center rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-950">
            <CheckCircle2 className="h-14 w-14 text-emerald-600" />
            <h2 className="mt-4 text-2xl font-bold">Reconciliation saved</h2>
            <p className="mt-2 text-sm">{selected.name} is {Object.values(results).some((result) => result.status === "Missing" || result.status === "Expired") ? "not ready and has recorded follow-up actions" : "clinically ready based on this completed check"}.</p>
            <p className="mt-3 text-xs text-emerald-800">No stock was changed automatically.</p>
            {saveNotice?.updated > 0 && <p className="mt-2 text-sm font-semibold">{saveNotice.updated} item{saveNotice.updated === 1 ? "" : "s"} in the kit {saveNotice.updated === 1 ? "now shows" : "now show"} the replacement batch.</p>}
            {saveNotice?.failed?.length > 0 && <p role="alert" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">The check was saved, but the kit couldn't be updated for: {saveNotice.failed.join(", ")}. Ask an administrator to update the batch in Manage.</p>}
            <button type="button" onClick={onExit} className="mt-6 rounded-xl bg-[var(--medtrak-accent)] px-6 py-3 font-bold text-white">Done</button>
          </section>
        ) : completedCount === items.length ? (
          <section className="rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-8 w-8 text-[var(--medtrak-accent)]" />
              <div><h2 className="text-xl font-bold">Review and save</h2><p className="text-sm text-[var(--medtrak-muted)]">Every item has been addressed.</p></div>
            </div>
            <div className="mt-4 space-y-2">
              {items.map((item, itemIndex) => (
                <button key={item.id} type="button" onClick={() => setIndex(itemIndex)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3 text-left">
                  <span className="min-w-0 truncate text-sm font-semibold">{item.name}</span><ResultPill status={results[item.id]?.status} />
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">Saving creates the auditable readiness record. Replacement, borrowing and urgent-order choices remain pending follow-up records until a user completes the corresponding stock or ordering action.</div>
            <button type="button" onClick={saveVerification} disabled={saving || !canVerify} className="mt-4 w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3.5 text-base font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save verification"}</button>
          </section>
        ) : currentItem ? (
          <section className="rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">Item {index + 1} of {items.length}</p>
                <h2 className="mt-2 text-2xl font-bold leading-tight">{currentItem.name}</h2>
                {(currentItem.expectedQty || currentItem.defaultExpiry) && <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{currentItem.expectedQty ? `Expected ${currentItem.expectedQty}` : ""}{currentItem.expectedQty && currentItem.defaultExpiry ? " · " : ""}{currentItem.defaultExpiry ? `Expiry ${currentItem.defaultExpiry}` : ""}{currentItem.fromStock ? " (from stock)" : ""}</p>}
              </div>
              {results[currentItem.id] && <ResultPill status={results[currentItem.id].status} />}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" disabled={!canVerify} onClick={() => recordSimple("OK")} className="flex min-h-20 flex-col items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 p-3 font-bold text-emerald-800 active:scale-[.98] disabled:opacity-50"><Check className="mb-1 h-6 w-6" />Present</button>
              <button type="button" disabled={!canVerify} onClick={() => openResolution("Missing")} className="flex min-h-20 flex-col items-center justify-center rounded-2xl border border-red-300 bg-red-50 p-3 font-bold text-red-800 active:scale-[.98] disabled:opacity-50"><X className="mb-1 h-6 w-6" />Missing</button>
              <button type="button" disabled={!canVerify} onClick={() => openResolution("Expired")} className="flex min-h-20 flex-col items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 p-3 font-bold text-amber-900 active:scale-[.98] disabled:opacity-50"><AlertTriangle className="mb-1 h-6 w-6" />Expired</button>
              <button type="button" disabled={!canVerify} onClick={() => recordSimple("N/A")} className="flex min-h-20 flex-col items-center justify-center rounded-2xl border border-slate-300 bg-slate-50 p-3 font-bold text-slate-700 active:scale-[.98] disabled:opacity-50"><ShieldAlert className="mb-1 h-6 w-6" />Not required</button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Other actions for this item">
              <button type="button" disabled={!canVerify} onClick={() => openSheet("replace")} className="flex min-h-14 flex-col items-center justify-center rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2 text-sm font-bold active:scale-[.98] disabled:opacity-50"><RefreshCw className="mb-0.5 h-5 w-5 text-[var(--medtrak-accent)]" />Replace</button>
              <button type="button" disabled={!canVerify} onClick={() => openSheet("message")} className="flex min-h-14 flex-col items-center justify-center rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2 text-sm font-bold active:scale-[.98] disabled:opacity-50"><MessageSquare className="mb-0.5 h-5 w-5 text-[var(--medtrak-accent)]" />Message</button>
              <button type="button" disabled={!canVerify} onClick={() => openSheet("later")} className="flex min-h-14 flex-col items-center justify-center rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2 text-sm font-bold active:scale-[.98] disabled:opacity-50"><BellRing className="mb-0.5 h-5 w-5 text-[var(--medtrak-accent)]" />Later</button>
            </div>
            {extras[currentItem.id]?.flaggedLater && <p className="mt-2 text-xs font-semibold text-amber-700">Flagged to come back to - answer it now, or finish the others first.</p>}
            {extras[currentItem.id]?.messages?.length > 0 && <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Messaged {extras[currentItem.id].messages.map((m) => m.toLabel || "a colleague").join(", ")}.</p>}

            <div className="mt-4 flex items-center justify-between text-sm">
              <button type="button" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} className="rounded-xl px-3 py-2 font-semibold text-[var(--medtrak-muted)] disabled:opacity-30">Previous</button>
              <p className="text-xs text-[var(--medtrak-muted)]">Present advances automatically</p>
              <button type="button" disabled={index >= items.length - 1} onClick={() => setIndex((value) => Math.min(items.length - 1, value + 1))} className="rounded-xl px-3 py-2 font-semibold text-[var(--medtrak-accent)] disabled:opacity-30">Next</button>
            </div>
          </section>
        ) : null}

        {latest && !saved && <p className="mt-3 text-center text-xs text-[var(--medtrak-muted)]">Previous audit evidence is retained. This check creates a new record.</p>}
      </main>

      {sheet === "replace" && currentItem && (
        <ReplaceSheet item={currentItem} stockItems={stockItems || []} onConfirm={confirmReplace} onClose={() => setSheet(null)} />
      )}
      {sheet === "message" && currentItem && (
        <MessageSheet item={currentItem} kitName={selected.name} staff={staff} staffError={staffError} onRetryStaff={loadStaff} onSend={confirmMessage} onClose={() => setSheet(null)} busy={actionBusy} error={actionError} />
      )}
      {sheet === "later" && currentItem && (
        <LaterSheet item={currentItem} onConfirm={confirmLater} onClose={() => setSheet(null)} busy={actionBusy} error={actionError} />
      )}

      {resolutionFor && (
        <div className="fixed inset-0 z-[120] flex items-end bg-black/50" role="dialog" aria-modal="true" aria-label={`${resolutionFor.status} item resolution`}>
          <div className="max-h-[calc(100dvh-var(--pvx-mobile-content-bottom)-env(safe-area-inset-top))] w-full overflow-y-auto rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[var(--medtrak-text)]">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[.16em] text-red-600">{resolutionFor.status}</p><h2 className="mt-1 text-xl font-bold">{resolutionFor.item.name}</h2><p className="mt-1 text-sm text-[var(--medtrak-muted)]">Choose the intended resolution. Nothing changes until a user completes and records that separate action.</p></div>
              <button type="button" onClick={() => setResolutionFor(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--medtrak-border)]"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 grid gap-2">
              {RESOLUTIONS.map(({ id, label, detail, icon: Icon }) => (
                <button key={id} type="button" onClick={() => setResolutionType(id)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left ${resolutionType === id ? "border-[var(--medtrak-accent)] bg-blue-50 text-blue-950" : "border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]"}`}>
                  <Icon className="h-5 w-5 shrink-0 text-[var(--medtrak-accent)]" /><span><span className="block font-bold">{label}</span><span className="block text-xs opacity-75">{detail}</span></span>
                </button>
              ))}
            </div>
            {resolutionType === "borrow" && <label className="mt-3 block text-sm font-semibold">Source box or location<input value={sourceLocation} onChange={(event) => setSourceLocation(event.target.value)} placeholder={`e.g. ${assetExample}`} className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-3 font-normal" /></label>}
            <label className="mt-3 block text-sm font-semibold">Follow-up note<textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} rows={2} placeholder="Optional context for the audit trail" className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-3 font-normal" /></label>
            <button type="button" disabled={!resolutionType || (resolutionType === "borrow" && !sourceLocation.trim())} onClick={confirmResolution} className="mt-4 w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3.5 font-bold text-white disabled:opacity-40">Record follow-up and continue</button>
          </div>
        </div>
      )}
    </div>
  );
}





