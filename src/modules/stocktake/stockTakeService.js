import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch, deleteDoc, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { applyStockMovement, createStockItem } from "@/services/stockService";
import { TAKE_STATUS, PLACE_STATUS, buildTake, itemFromAddition, movementFor, planAdditions, validateTake } from "./stockTake";

const TAKES = "stock_takes";
const toMillis = (value) => (value?.toMillis ? value.toMillis() : value ? new Date(value).getTime() || 0 : 0);

// All stock takes, newest first. `list` is null until the first answer.
export function useStockTakes(enabled = true) {
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => !enabled ? undefined : onSnapshot(
    collection(db, TAKES),
    (snap) => setState({ list: snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)), error: "" }),
    (error) => setState({ list: [], error: error?.code === "permission-denied" ? "Your role can't open stock takes." : "Could not load stock takes." }),
  ), [enabled]);
  return state;
}

// One take with its places, counts and the items found that weren't in the system, all kept up to date.
export function useStockTake(takeId) {
  const [take, setTake] = useState(undefined);
  const [places, setPlaces] = useState([]);
  const [counts, setCounts] = useState([]);
  const [additions, setAdditions] = useState([]);
  useEffect(() => {
    if (!takeId) return undefined;
    const stops = [
      onSnapshot(doc(db, TAKES, takeId), (snap) => setTake(snap.exists() ? { id: snap.id, ...snap.data() } : null), () => setTake(null)),
      onSnapshot(collection(db, TAKES, takeId, "places"), (snap) => setPlaces(snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }))), () => setPlaces([])),
      onSnapshot(collection(db, TAKES, takeId, "counts"), (snap) => setCounts(snap.docs.map((d) => ({ ...d.data(), id: d.id }))), () => setCounts([])),
      onSnapshot(collection(db, TAKES, takeId, "additions"), (snap) => setAdditions(snap.docs.map((d) => ({ ...d.data(), id: d.id }))), () => setAdditions([])),
    ];
    return () => stops.forEach((stop) => stop());
  }, [takeId]);
  return useMemo(() => ({ take, places, counts, additions }), [take, places, counts, additions]);
}

export async function createStockTake({ title, places, audience, dueDate, note, mode, creator }) {
  const problems = validateTake({ title, places, dueDate });
  if (problems.length) throw new Error(problems[0]);
  const built = buildTake({ title, places, audience, dueDate, note, mode, creator });
  const takeRef = doc(collection(db, TAKES));
  const batch = writeBatch(db);
  batch.set(takeRef, { ...built.take, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  built.places.forEach((place) => batch.set(doc(db, TAKES, takeRef.id, "places", place.id), place));
  await batch.commit();
  return takeRef.id;
}

// Claim a free place. Done in a transaction so two people tapping the same place can't both get it.
export async function claimPlace(takeId, placeId, actor) {
  const ref = doc(db, TAKES, takeId, "places", placeId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const place = snap.data();
    if (!place) throw new Error("That place is no longer part of this stock take.");
    if (place.status !== PLACE_STATUS.free && place.claimedByUid !== actor.uid) throw new Error(`${place.claimedByName || "Someone"} has already taken ${place.name}.`);
    if (place.status === PLACE_STATUS.free) tx.update(ref, { status: PLACE_STATUS.claimed, claimedByUid: actor.uid, claimedByName: actor.name, claimedAt: serverTimestamp() });
  });
}

export const releasePlace = (takeId, placeId) => updateDoc(doc(db, TAKES, takeId, "places", placeId), { status: PLACE_STATUS.free, claimedByUid: null, claimedByName: null });
export const finishPlace = (takeId, placeId) => updateDoc(doc(db, TAKES, takeId, "places", placeId), { status: PLACE_STATUS.done, doneAt: serverTimestamp() });
export const reopenPlace = (takeId, placeId) => updateDoc(doc(db, TAKES, takeId, "places", placeId), { status: PLACE_STATUS.claimed });
// a manager frees a place someone claimed and never finished
export const resetPlace = (takeId, placeId) => updateDoc(doc(db, TAKES, takeId, "places", placeId), { status: PLACE_STATUS.free, claimedByUid: null, claimedByName: null });

export const saveCount = (takeId, count) => setDoc(doc(db, TAKES, takeId, "counts", count.id), { ...count, countedAt: serverTimestamp() });
export const removeCount = (takeId, countId) => deleteDoc(doc(db, TAKES, takeId, "counts", countId));
export const addAddition = (takeId, addition) => addDoc(collection(db, TAKES, takeId, "additions"), { ...addition, createdAt: serverTimestamp() });

export const sendForReview = (takeId) => updateDoc(doc(db, TAKES, takeId), { status: TAKE_STATUS.review, reviewRequestedAt: serverTimestamp(), updatedAt: serverTimestamp() });
export const reopenTake = (takeId) => updateDoc(doc(db, TAKES, takeId), { status: TAKE_STATUS.open, updatedAt: serverTimestamp() });
export const closeTake = (takeId, actorName) => updateDoc(doc(db, TAKES, takeId), { status: TAKE_STATUS.closed, closedAt: serverTimestamp(), closedByName: actorName, updatedAt: serverTimestamp() });
export const cancelTake = (takeId, actorName) => updateDoc(doc(db, TAKES, takeId), { status: TAKE_STATUS.cancelled, closedAt: serverTimestamp(), closedByName: actorName, updatedAt: serverTimestamp() });

// Apply the reviewed lines to stock, one at a time so a failure on one doesn't stop the rest. Each line that
// goes through is marked applied on its count, so it can never be applied twice.
export async function applyReviewedLines(take, lines, actor) {
  const done = [];
  const failed = [];
  for (const line of lines) {
    const plan = movementFor(line);
    if (!plan) continue;
    try {
      await applyStockMovement(plan.itemId, { ...plan.movement, reason: `Stock take: ${take.title}`, notes: line.kind === "not-counted" ? "Not counted in the stock take; set to none" : "", actor, source: "stocktake" });
      await setDoc(doc(db, TAKES, take.id, "counts", line.id), {
        placeId: line.placeId, itemId: line.itemId, itemLabel: line.itemLabel, counted: line.kind === "not-counted" ? 0 : line.counted, expected: line.expectedAtCount,
        unexpected: line.kind === "unexpected", countedByUid: actor.uid || "", countedByName: line.countedByName || actor.displayName || actor.name || "", source: "review",
        applied: true, appliedAt: serverTimestamp(), appliedByName: actor.displayName || actor.name || "",
      }, { merge: true });
      done.push(line);
    } catch (error) {
      failed.push({ line, message: error?.message || "could not be updated" });
    }
  }
  return { done, failed };
}

// A stock item from something found in the take, with every detail the counter entered (name, brand, strength, form,
// barcode, category, subcategory, site and room from the place) and the number counted as its stock.
export async function createItemFromAddition(take, addition, actor) {
  const created = await createStockItem(itemFromAddition(addition));
  await updateDoc(doc(db, TAKES, take.id, "additions", addition.id), { status: "created", handledByName: actor.displayName || actor.name || "", handledAt: serverTimestamp(), itemId: created || "" });
  return created;
}

// Create every waiting addition in one go. Anything that is already in stock at that place, or that two people both
// found, is left for the manager to decide. One failing does not stop the rest.
export async function createItemsFromAdditions(take, additions, items, actor) {
  const plan = planAdditions(items, additions);
  const created = [];
  const failed = [];
  for (const addition of plan.create) {
    try {
      await createItemFromAddition(take, addition, actor);
      created.push(addition);
    } catch (error) {
      failed.push({ addition, message: error?.message || "could not be created" });
    }
  }
  return { created, failed, skipped: plan.skipped };
}

export const dismissAddition = (takeId, additionId, actorName) => updateDoc(doc(db, TAKES, takeId, "additions", additionId), { status: "dismissed", handledByName: actorName, handledAt: serverTimestamp() });

export { getDoc };
