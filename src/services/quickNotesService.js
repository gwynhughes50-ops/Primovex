const STORAGE_KEY = "primovex.quick-notes.v1";
const EVENT_NAME = "primovex:quick-notes-changed";

function safeRead() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
  return notes;
}

export function getQuickNotes() {
  return safeRead().sort((a, b) => new Date(a.dueAt || a.createdAt) - new Date(b.dueAt || b.createdAt));
}

export function addQuickNote(input) {
  const now = new Date();
  const note = {
    id: crypto?.randomUUID?.() || `note-${Date.now()}`,
    text: String(input?.text || "").trim(),
    dueAt: input?.dueAt || null,
    priority: input?.priority || "routine",
    scope: input?.scope || "private",
    status: "open",
    createdAt: now.toISOString(),
    completedAt: null,
  };
  if (!note.text) throw new Error("A note is required");
  return write([note, ...safeRead()]);
}

export function completeQuickNote(id) {
  const now = new Date().toISOString();
  return write(safeRead().map((note) => note.id === id ? { ...note, status: "completed", completedAt: now } : note));
}

export function deleteQuickNote(id) {
  return write(safeRead().filter((note) => note.id !== id));
}

export function subscribeQuickNotes(callback) {
  const refresh = () => callback(getQuickNotes());
  window.addEventListener(EVENT_NAME, refresh);
  refresh();
  return () => window.removeEventListener(EVENT_NAME, refresh);
}

export function getOpenQuickNotes(now = new Date()) {
  return getQuickNotes().filter((note) => note.status !== "completed");
}

export function isNoteDueToday(note, now = new Date()) {
  if (!note?.dueAt) return false;
  const due = new Date(note.dueAt);
  return due.toDateString() === now.toDateString();
}

export function isNoteOverdue(note, now = new Date()) {
  return note?.status !== "completed" && note?.dueAt && new Date(note.dueAt) < now;
}
