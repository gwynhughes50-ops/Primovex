import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { recordAudit } from "@/modules/audit/recordAudit";
import { laptopEvent } from "@/modules/audit/auditEvents";
import { buildAssign, buildEdit, buildLoanOut, buildNewLaptop, buildReturn, buildUpdated, dayKey } from "./laptops";

// Reading and writing the laptop records. it_laptops is the register (one record per laptop, with who has it and any loan); it_laptop_events is a line for everything that happens to one,
// never edited. Every change is one write of both together, so the record and its log cannot disagree.

export const LAPTOPS = "it_laptops";
export const LAPTOP_EVENTS = "it_laptop_events";

const rowOf = (d) => ({ id: d.id, ...(d.data() || {}) });
const byCode = (a, b) => String(a.assetCode || "").localeCompare(String(b.assetCode || ""), undefined, { numeric: true });

// every laptop, for the IT team and anyone who may see the register. Demo and training mode show none.
export function subscribeLaptops(onData, onError) {
  if (isSafeSyntheticMode()) { onData([]); return () => {}; }
  return onSnapshot(query(collection(db, LAPTOPS)), (snap) => onData(snap.docs.map(rowOf).filter((l) => l.active !== false).sort(byCode)), onError);
}

// the laptops a person has: assigned to them, or lent to them (the rules let a person read only their own)
export function subscribeMyLaptops(uid, onData, onError) {
  if (isSafeSyntheticMode() || !uid) { onData([]); return () => {}; }
  let assigned = []; let lent = [];
  const emit = () => onData([...new Map([...assigned, ...lent].map((l) => [l.id, l])).values()].filter((l) => l.active !== false && l.status !== "decommissioned").sort(byCode));
  const stopA = onSnapshot(query(collection(db, LAPTOPS), where("currentUserUid", "==", uid)), (s) => { assigned = s.docs.map(rowOf); emit(); }, onError);
  const stopB = onSnapshot(query(collection(db, LAPTOPS), where("borrowerUid", "==", uid)), (s) => { lent = s.docs.map(rowOf); emit(); }, onError);
  return () => { stopA(); stopB(); };
}

// the log of one laptop, newest first (sorted here, so no database index is needed)
export function subscribeLaptopEvents(laptopId, onData, onError) {
  if (isSafeSyntheticMode() || !laptopId) { onData([]); return () => {}; }
  const time = (e) => e.createdAt?.toMillis?.() || 0;
  return onSnapshot(query(collection(db, LAPTOP_EVENTS), where("laptopId", "==", laptopId)), (snap) => onData(snap.docs.map(rowOf).sort((a, b) => time(b) - time(a))), onError);
}

export async function getLaptop(id) {
  if (isSafeSyntheticMode() || !id) return null;
  const snap = await getDoc(doc(db, LAPTOPS, id));
  return snap.exists() ? rowOf(snap) : null;
}

const who = (actor) => ({ uid: actor?.uid || "", displayName: actor?.displayName || actor?.email || "" });
const eventDoc = (event, actor) => ({ ...event, byUid: actor.uid, byName: event.byName || actor.displayName, createdAt: serverTimestamp() });

// one change to one laptop: the record's new facts and its log line, together
async function apply(laptop, { patch, event }, actor) {
  if (isSafeSyntheticMode()) return;
  const batch = writeBatch(db);
  batch.update(doc(db, LAPTOPS, laptop.id), { ...patch, updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, LAPTOP_EVENTS)), eventDoc(event, who(actor)));
  await batch.commit();
  recordAudit(laptopEvent(event.type, { laptopId: laptop.id, assetCode: laptop.assetCode, summary: event.text }));
}

export const loanOutLaptop = ({ laptop, borrower, dueBackOn, conditionOut, actor }) => apply(laptop, buildLoanOut({ laptop, borrower, dueBackOn, conditionOut, actor: who(actor) }), actor);
export const returnLaptop = ({ laptop, condition, actor }) => apply(laptop, buildReturn({ laptop, condition, actor: who(actor) }), actor);
export const markLaptopUpdated = ({ laptop, updatedOn, nextDueOn, actor }) => apply(laptop, buildUpdated({ laptop, updatedOn, nextDueOn, actor: who(actor) }), actor);
export const assignLaptop = ({ laptop, holder, actor }) => apply(laptop, buildAssign({ laptop, holder, actor: who(actor) }), actor);
export const editLaptop = ({ laptop, changes, actor }) => apply(laptop, buildEdit({ laptop, changes, actor: who(actor) }), actor);

// A new laptop, or many (the paste import). Each is a record and a line in its log, written in batches.
export async function addLaptops(inputs, actor, { today = dayKey() } = {}) {
  const made = inputs.map((input) => buildNewLaptop(input, { today, actor: who(actor) }));
  if (isSafeSyntheticMode()) return made.length;
  for (let i = 0; i < made.length; i += 200) {
    const batch = writeBatch(db);
    for (const { laptop, event } of made.slice(i, i + 200)) {
      const ref = doc(collection(db, LAPTOPS));
      batch.set(ref, { ...laptop, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.set(doc(collection(db, LAPTOP_EVENTS)), eventDoc({ ...event, laptopId: ref.id }, who(actor)));
    }
    await batch.commit();
  }
  if (made.length === 1) recordAudit(laptopEvent("added", { assetCode: made[0].laptop.assetCode, summary: made[0].event.text }));
  else recordAudit(laptopEvent("imported", { count: made.length }));
  return made.length;
}
