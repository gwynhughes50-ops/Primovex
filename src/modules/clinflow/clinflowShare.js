import { serialisableDocument } from "./clinflowDocumentCache.js";

// Sharing letters between the computers that run ClinFlow, through one shared folder (a OneDrive folder only the coding team can see). Every computer keeps its own copy as before;
// this keeps the shared folder up to date after each save, and brings other people's changes in. Each letter has a revision number: a save is refused if someone else has saved a newer
// one (the person's change is not lost silently: they are told, and the newer letter is loaded). OneDrive takes a few seconds to sync, so two people changing the same letter within
// those seconds can still clash; "Claim this letter" is the way to avoid it. When a letter is finished and filed, its two patient files are deleted and only a tiny note is left.
// Pure apart from `api`, which is the shared folder: list, read, write, finish, forget (see the shared_* commands in src-tauri/src/lib.rs).

// The sharing that is switched on right now, so other parts of ClinFlow (archiving a letter) can tell it a letter has gone. Empty when sharing is off.
export const activeShare = { current: null };

export const TOMBSTONE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const decode = (bytes) => JSON.parse(new TextDecoder().decode(bytes));
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));

// A letter that has been finished (completed) and its Docman PDF saved: nothing more to do with it, so it can leave the shared folder
export const isDone = (document) => document?.status === "completed" && Boolean(document?.triageReview?.savedFolder);

export function createSharedStore({ api, who = { uid: "", name: "" }, now = () => Date.now() }) {
  const revs = new Map(); // id -> the revision this computer last wrote or read
  const seen = new Map(); // id -> "docMs:docSize" of the document.json last read
  const pdfStored = new Set(); // ids whose letter.pdf is known to be in the shared folder
  const finished = new Set();
  let queue = Promise.resolve();
  const inOrder = (task) => { const run = queue.then(task, task); queue = run.catch(() => {}); return run; }; // one thing at a time, in order

  async function currentRev(id) {
    try { return decode(await api.read(id, "document.json")).sharedRev || 0; } catch { return 0; }
  }

  // Saves a letter. Resolves { ok: true }, { skipped: "finished" | "not shared" }, or { conflict: true } if someone else saved a newer one first.
  function push(document) {
    return inOrder(async () => {
      const id = document?.id;
      if (!id || document.dataMode === "live") return { skipped: "not shared" };
      if (finished.has(id)) return { skipped: "finished" };
      if (isDone(document)) { await finish(document); return { ok: true, finished: true }; }
      const theirs = await currentRev(id);
      const mine = revs.get(id) ?? 0;
      if (theirs > mine) return { conflict: true, theirs };
      const sourceFile = document.syntheticOcr?.sourceFile;
      if (!pdfStored.has(id) && sourceFile instanceof Blob) {
        await api.write(id, "letter.pdf", new Uint8Array(await sourceFile.arrayBuffer()));
        pdfStored.add(id);
      }
      const rev = theirs + 1;
      const shareable = { ...serialisableDocument(document, pdfStored.has(id) || Boolean(document.syntheticOcr?.sourceFileAvailable)), sharedRev: rev, sharedBy: who.name || who.uid, sharedAt: new Date(now()).toISOString() };
      await api.write(id, "document.json", encode(shareable));
      revs.set(id, rev);
      return { ok: true, rev };
    });
  }

  // The letter is done: leave only the tiny note (no patient details), delete the patient files, and never share it again
  async function finish(document, reason = "finished") {
    const id = document?.id;
    if (!id || finished.has(id)) return;
    await api.finish(id, encode({ id, at: new Date(now()).toISOString(), reason, byUid: who.uid }));
    finished.add(id);
    revs.delete(id); seen.delete(id); pdfStored.delete(id);
  }

  // Looks at the shared folder. Resolves { upserts: [{ document, pdf }], finishedIds, count }: letters that are new or changed since the last look (not this computer's own
  // saves), and letters that were finished by someone. `hasPdf(id)` says whether this computer already has the scan. A file that has not finished syncing is tried again next time.
  async function pull({ hasPdf = () => false } = {}) {
    const entries = await api.list();
    const upserts = []; const finishedIds = []; const problems = [];
    for (const entry of entries) {
      if (entry.finishedMs > 0) {
        if (!finished.has(entry.id)) { finished.add(entry.id); finishedIds.push(entry.id); }
        if (now() - entry.finishedMs > TOMBSTONE_DAYS * DAY_MS) await api.forget(entry.id).catch(() => {});
        continue;
      }
      if (!(entry.docMs > 0 && entry.docSize > 0)) continue;
      const stamp = `${entry.docMs}:${entry.docSize}`;
      if (seen.get(entry.id) === stamp) continue;
      try {
        const document = decode(await api.read(entry.id, "document.json"));
        const rev = document.sharedRev || 0;
        if (rev <= (revs.get(entry.id) ?? 0) && revs.has(entry.id)) { seen.set(entry.id, stamp); continue; } // this computer's own save, or one already taken in
        let pdf = null;
        if (!hasPdf(entry.id) && entry.pdfSize > 0) pdf = new Blob([await api.read(entry.id, "letter.pdf")], { type: "application/pdf" });
        revs.set(entry.id, rev);
        if (entry.pdfSize > 0) pdfStored.add(entry.id);
        seen.set(entry.id, stamp);
        upserts.push({ document, pdf });
      } catch (error) {
        problems.push(String(error?.message || error).slice(0, 160)); // probably still syncing: not marked as seen, so it is tried again
      }
    }
    return { upserts, finishedIds, count: entries.filter((e) => !(e.finishedMs > 0)).length, problems };
  }

  return { push, finish, pull, knows: (id) => revs.has(id) || finished.has(id), finishedIds: () => new Set(finished) };
}
