// A "this concern is overdue" or "this SAR is due soon" notification is written by the daily job while the case is open. Once the
// case has been dealt with and closed the notification is out of date, but nothing took it away, so it kept appearing when the
// person next signed in. These decide which of a person's notifications are out of date. Pure (no Firestore, no screens).

// the collection each kind of automated notification points at, and the statuses that mean it has been dealt with
export const DUE_SOURCES = {
  governance: { collection: "governance_concerns", done: ["closed", "archived"] },
  sar: { collection: "governance_sars", done: ["completed", "archived"] },
};

const FINISHED = ["completed", "archived"];

// an automated due notification that has not been dealt with yet
export function isOpenDueNotification(note) {
  if (!note || note.automated !== true || !note.sourceId) return false;
  if (!DUE_SOURCES[note.module]) return false;
  return !FINISHED.includes(note.status || "open");
}

// the records to look at: [{ collection, id }], each once
export function sourcesToCheck(notes = []) {
  const seen = new Map();
  for (const note of notes) {
    if (!isOpenDueNotification(note)) continue;
    const collection = DUE_SOURCES[note.module].collection;
    seen.set(`${collection}/${note.sourceId}`, { collection, id: String(note.sourceId) });
  }
  return [...seen.values()];
}

// states: { "<collection>/<id>": "closed" | "gone" | <anything else, or missing = could not be read> }
// A record that has gone, or has a finished status, means its notification is out of date. One that could not be read (no
// permission, offline) is left alone.
export function staleNotificationIds(notes = [], states = {}) {
  return notes.filter((note) => {
    if (!isOpenDueNotification(note)) return false;
    const source = DUE_SOURCES[note.module];
    const state = states[`${source.collection}/${note.sourceId}`];
    return state === "gone" || source.done.includes(state);
  }).map((note) => note.id);
}

export const RETIRE_PATCH_NOTE = "The case has been closed.";
