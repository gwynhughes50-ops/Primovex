import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";

// Real, cross-device quick notes. Previously this was 100% localStorage
// (primovex.quick-notes.v1), so a note marked "Practice task" — despite the
// composer explicitly offering that as a sharing choice — never actually left
// the device it was written on. One flat collection, split by scope:
// - "private" notes: authorUid == me
// - "practice" notes: visible to every signed-in user
const COLLECTION = "quick_notes";

function toMillis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => toMillis(a.dueAt || a.createdAt) - toMillis(b.dueAt || b.createdAt));
}

// Deliberately no orderBy on either query below: a note missing the sorted
// field would be silently dropped by Firestore rather than sorted last, so we
// fetch everything each side can see and sort client-side instead.
//
// Subscribes to auth state rather than reading auth.currentUser once: this
// can be called before Firebase Auth has finished resolving the signed-in
// user (e.g. on page load), and a one-time null check would permanently give
// up instead of activating once the uid becomes available.
export function subscribeQuickNotes(callback) {
  const own = new Map();
  const practice = new Map();
  let unsubOwn = () => {};
  let currentUid = undefined;
  const emit = () => callback(sortNotes([...own.values(), ...practice.values()]));

  const unsubPractice = onSnapshot(query(collection(db, COLLECTION), where("scope", "==", "practice")), (snap) => {
    practice.clear();
    snap.docs.forEach((row) => practice.set(row.id, { id: row.id, ...row.data() }));
    emit();
  });

  const unsubAuth = onAuthStateChanged(auth, (user) => {
    const uid = user?.uid || null;
    if (uid === currentUid) return;
    currentUid = uid;
    unsubOwn();
    own.clear();
    if (!uid) { emit(); return; }
    unsubOwn = onSnapshot(query(collection(db, COLLECTION), where("authorUid", "==", uid)), (snap) => {
      own.clear();
      snap.docs.forEach((row) => own.set(row.id, { id: row.id, ...row.data() }));
      emit();
    });
  });

  return () => {
    unsubAuth();
    unsubOwn();
    unsubPractice();
  };
}

// Kept for the initial useState(() => getQuickNotes()) call in QuickNotesSheet
// / MobileLayout — subscribeQuickNotes fires immediately after and takes over.
export function getQuickNotes() {
  return [];
}

export function getOpenQuickNotes() {
  return [];
}

export async function addQuickNote(input) {
  const text = String(input?.text || "").trim();
  if (!text) throw new Error("A note is required");
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You need to be signed in to add a note");

  await addDoc(collection(db, COLLECTION), {
    text,
    dueAt: input?.dueAt || null,
    priority: input?.priority || "routine",
    scope: input?.scope || "private",
    status: "open",
    authorUid: uid,
    authorName: auth.currentUser?.displayName || auth.currentUser?.email || "Unknown",
    createdAt: serverTimestamp(),
    completedAt: null,
  });
}

export async function completeQuickNote(id) {
  await updateDoc(doc(db, COLLECTION, id), { status: "completed", completedAt: serverTimestamp() });
}

export async function deleteQuickNote(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

export function isNoteDueToday(note, now = new Date()) {
  if (!note?.dueAt) return false;
  const due = new Date(note.dueAt);
  return due.toDateString() === now.toDateString();
}

export function isNoteOverdue(note, now = new Date()) {
  return note?.status !== "completed" && note?.dueAt && new Date(note.dueAt) < now;
}
