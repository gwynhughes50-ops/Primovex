const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { stripTimeFromPages } = require("./usageService");

// Keeps records that describe how people use the system only as long as they are needed.
// Sign-in and activity sessions (usage_sessions) are kept for 12 months, enough for a
// security review or an annual audit, then deleted. The Orb's per-hour request counters
// (orb_ai_usage) only exist to enforce limits and are kept for 60 days. The governed audit
// ledger (audit_events) is NOT touched here: it is append-only evidence and has its own
// retention schedule (docs/governance/RETENTION-AND-DELETION-DRAFT.md).
//
// The periods are the practice's to decide (DPO); changing them is one number each here.

const USAGE_SESSION_DAYS = 365;
const ORB_USAGE_DAYS = 60;
const BATCH = 400;
const DAY_MS = 86400000;

async function deleteOlderThan({ db, collection, field, cutoff, batchSize = BATCH, maxBatches = 25 }) {
  let deleted = 0;
  for (let i = 0; i < maxBatches; i += 1) {
    const snap = await db.collection(collection).where(field, "<", cutoff).limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < batchSize) break;
  }
  return deleted;
}

// Time spent in an area is no longer recorded (9 November 2026), so any already stored on older sign-in sessions is removed: the session's total active seconds, and the seconds on each
// area (the area and its visit count stay). It looks for sessions that still have the total (the field is deleted as the session is cleaned, so each run finds fewer) and is safe to
// run again and again.
async function removeStoredTime({ db, batchSize = BATCH, maxBatches = 25, fieldDelete = () => FieldValue.delete() }) {
  let cleaned = 0;
  for (let i = 0; i < maxBatches; i += 1) {
    const snap = await db.collection("usage_sessions").where("activeSeconds", ">=", 0).limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.update(doc.ref, { activeSeconds: fieldDelete(), pages: stripTimeFromPages(doc.data().pages) }));
    await batch.commit();
    cleaned += snap.size;
    if (snap.size < batchSize) break;
  }
  return cleaned;
}

// How many sign-in sessions still hold a stored time. After a run this should be 0: it is the check that the clean-up has done its job (a limit of 1 is enough to know).
async function countStoredTime({ db }) {
  const snap = await db.collection("usage_sessions").where("activeSeconds", ">=", 0).limit(1).get();
  return snap.size;
}

async function runRetention({ db, now = new Date(), fieldDelete }) {
  const usage = await deleteOlderThan({ db, collection: "usage_sessions", field: "startedAt", cutoff: Timestamp.fromMillis(now.getTime() - USAGE_SESSION_DAYS * DAY_MS) });
  const orb = await deleteOlderThan({ db, collection: "orb_ai_usage", field: "updatedAtMs", cutoff: now.getTime() - ORB_USAGE_DAYS * DAY_MS });
  const timeRemoved = await removeStoredTime({ db, fieldDelete });
  const stillHoldingTime = (await countStoredTime({ db })) > 0;
  return { usageSessionsDeleted: usage, orbUsageDeleted: orb, usageTimeRemoved: timeRemoved, stillHoldingTime, ranAt: now.toISOString() };
}

module.exports = { USAGE_SESSION_DAYS, ORB_USAGE_DAYS, deleteOlderThan, removeStoredTime, runRetention };
