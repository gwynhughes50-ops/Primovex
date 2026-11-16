import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { recordAudit } from "@/modules/audit/recordAudit";
import { computerEvent } from "@/modules/audit/auditEvents";
import { buildChecked, buildDeleteComputer, buildEditComputer, buildNewComputer } from "./computers";
import { dayKey } from "../laptops/laptops";

// Reading and writing the PC records. it_computers is the register (one record per PC); it_computer_events is a line for everything that happens to one, never edited. Every change is one write of
// both together, so the record and its history cannot disagree. (Rules: firestore.rules, "IT EQUIPMENT: PCs".)

export const COMPUTERS = "it_computers";
export const COMPUTER_EVENTS = "it_computer_events";

const rowOf = (d) => ({ id: d.id, ...(d.data() || {}) });
const byNumber = (a, b) => String(a.assetNumber || "").localeCompare(String(b.assetNumber || ""), undefined, { numeric: true });

// every PC, for the IT team and anyone who may see the register. Demo and training mode show none.
export function subscribeComputers(onData, onError) {
  if (isSafeSyntheticMode()) { onData([]); return () => {}; }
  return onSnapshot(query(collection(db, COMPUTERS)), (snap) => onData(snap.docs.map(rowOf).filter((c) => c.active !== false).sort(byNumber)), onError);
}

// the history of one PC, newest first (sorted here, so no database index is needed)
export function subscribeComputerEvents(computerId, onData, onError) {
  if (isSafeSyntheticMode() || !computerId) { onData([]); return () => {}; }
  const time = (e) => e.createdAt?.toMillis?.() || 0;
  return onSnapshot(query(collection(db, COMPUTER_EVENTS), where("computerId", "==", computerId)), (snap) => onData(snap.docs.map(rowOf).sort((a, b) => time(b) - time(a))), onError);
}

export async function getComputer(id) {
  if (isSafeSyntheticMode() || !id) return null;
  const snap = await getDoc(doc(db, COMPUTERS, id));
  return snap.exists() ? rowOf(snap) : null;
}

const who = (actor) => ({ uid: actor?.uid || "", displayName: actor?.displayName || actor?.email || "" });
const eventDoc = (event, actor) => ({ ...event, byUid: actor.uid, byName: event.byName || actor.displayName, createdAt: serverTimestamp() });

// one change to one PC: the record's new facts and its history line, together
async function apply(computer, { patch, event }, actor) {
  if (isSafeSyntheticMode()) return;
  const batch = writeBatch(db);
  batch.update(doc(db, COMPUTERS, computer.id), { ...patch, updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, COMPUTER_EVENTS)), eventDoc(event, who(actor)));
  await batch.commit();
  recordAudit(computerEvent(event.type, { computerId: computer.id, assetNumber: computer.assetNumber, summary: event.text }));
}

export const markComputerChecked = ({ computer, checkedOn, software, note, actor }) => apply(computer, buildChecked({ computer, checkedOn, software, note, today: dayKey(), actor: who(actor) }), actor);
export const deleteComputer = ({ computer, reason, actor }) => apply(computer, buildDeleteComputer({ computer, reason, actor: who(actor) }), actor);
export const editComputer = ({ computer, changes, actor }) => apply(computer, buildEditComputer({ computer, changes, today: dayKey(), actor: who(actor) }), actor);

// A new PC, or many (the spreadsheet import). Each is a record and a line in its history, written in batches. inputs carry their own site.
export async function addComputers(inputs, actor, { imported = false } = {}) {
  const made = inputs.map((input) => buildNewComputer(input, { today: dayKey(), actor: who(actor), imported }));
  if (isSafeSyntheticMode()) return made.length;
  for (let i = 0; i < made.length; i += 200) {
    const batch = writeBatch(db);
    for (const { computer, event } of made.slice(i, i + 200)) {
      const ref = doc(collection(db, COMPUTERS));
      batch.set(ref, { ...computer, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.set(doc(collection(db, COMPUTER_EVENTS)), eventDoc({ ...event, computerId: ref.id }, who(actor)));
    }
    await batch.commit();
  }
  if (made.length === 1) recordAudit(computerEvent("added", { assetNumber: made[0].computer.assetNumber, summary: made[0].event.text }));
  else recordAudit(computerEvent("imported", { count: made.length }));
  return made.length;
}
