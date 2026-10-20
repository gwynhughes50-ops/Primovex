// Reminders for fire, water and other tagged compliance checks (the logic of src/modules/compliance/complianceDue.js and
// src/services/compliance/complianceRules.js, kept in step with them by tests/complianceReminder.test.js).
//
//   Each weekday morning the caretaker is sent ONE notice if anything is due: the weekly fire alarm test not yet done, checks
//   that have fallen due, and assets whose last check failed. Counts and a few asset names only (it can show on a lock screen).
//   Each Monday the practice manager is told only about what has gone red: a check a week past its day, or no fire alarm
//   test for a fortnight, or an asset still failing.
//
// A notice has a fixed id for its day and person, so running the job again (or twice by accident) never tells anyone twice.

const DAY = 86400000;
const TIME_ZONE = "Europe/London";
const RED_AFTER_DAYS = 7;
const FIRE_RED_AFTER_DAYS = 14;
const CARETAKER_ROLE = "Caretaker";
const MANAGER_ROLE = "Practice Manager";

const FREQUENCY_MS = { daily: DAY, weekly: 7 * DAY, monthly: 30 * DAY, quarterly: 91 * DAY, sixmonthly: 182 * DAY, annually: 365 * DAY };

const tidy = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function toDateValue(value) {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// the calendar day (and weekday, 0 = Sunday) a moment falls on in London: the cloud runs in UTC
function londonDay(now) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { key: `${get("year")}-${get("month")}-${get("day")}`, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
}

// ---- the rules (as in the app) ----

const isLive = (asset) => asset && asset.active !== false;

// a single fire call point is never "due" on its own: the test is one call point a week, in rotation
function isCheckDue(asset, now) {
  if (!asset || asset.assetType === "fire_point") return false;
  if (asset.lastCheckResult === "fail") return true;
  const last = toDateValue(asset.lastCheckAt);
  if (!last) return true;
  const interval = FREQUENCY_MS[asset.frequency] ?? FREQUENCY_MS.monthly;
  return now.getTime() - last.getTime() >= interval;
}

function overdueDays(asset, now) {
  const last = toDateValue(asset?.lastCheckAt);
  if (!last) return 0;
  const interval = FREQUENCY_MS[asset.frequency] ?? FREQUENCY_MS.monthly;
  return Math.max(0, Math.floor((now.getTime() - last.getTime() - interval) / DAY));
}

// days since any call point was last tested (Infinity when none ever has)
function daysSinceFireTest(assets, now) {
  const times = assets.filter((a) => a.assetType === "fire_point" && isLive(a)).map((a) => toDateValue(a.lastCheckAt)?.getTime()).filter(Boolean);
  return times.length ? Math.floor((now.getTime() - Math.max(...times)) / DAY) : Infinity;
}

function fireTestDue(assets, now) {
  const points = assets.filter((a) => a.assetType === "fire_point" && isLive(a));
  if (!points.length) return false;
  return daysSinceFireTest(assets, now) >= 7;
}

const assetName = (a) => tidy(a.assetCode || a.label, 40) || "an asset";

// What is outstanding today
function outstanding({ assets = [], now = new Date() }) {
  const live = assets.filter(isLive);
  const due = live.filter((a) => isCheckDue(a, now));
  const failing = due.filter((a) => a.lastCheckResult === "fail");
  const overdue = due.filter((a) => a.lastCheckResult !== "fail");
  const fire = fireTestDue(live, now);
  const fireDays = daysSinceFireTest(live, now);
  const redOverdue = overdue.filter((a) => overdueDays(a, now) >= RED_AFTER_DAYS);
  return {
    fireDue: fire,
    fireDays,
    fireRed: fire && fireDays > FIRE_RED_AFTER_DAYS,
    overdue,
    redOverdue,
    failing,
  };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const names = (list, max = 3) => `${list.slice(0, max).map(assetName).join(", ")}${list.length > max ? ` and ${list.length - max} more` : ""}`;

// The caretaker's notice, or null when nothing is due
function caretakerNotice(state) {
  const lines = [];
  if (state.fireDue) lines.push(Number.isFinite(state.fireDays) ? `The weekly fire alarm test has not been done for ${plural(state.fireDays, "day")}.` : "The weekly fire alarm test has never been done.");
  if (state.overdue.length) lines.push(`${plural(state.overdue.length, "check")} due: ${names(state.overdue)}.`);
  if (state.failing.length) lines.push(`${plural(state.failing.length, "asset")} still failing: ${names(state.failing)}.`);
  if (!lines.length) return null;
  const red = state.fireRed || state.redOverdue.length > 0 || state.failing.length > 0;
  return { title: "Compliance checks due", message: lines.join(" "), priority: red ? "high" : "routine" };
}

// The practice manager's Monday notice: only what has gone red. Null when nothing has.
function managerNotice(state) {
  const lines = [];
  if (state.fireRed) lines.push(Number.isFinite(state.fireDays) ? `No fire alarm test for ${plural(state.fireDays, "day")}.` : "No fire alarm test has ever been done.");
  if (state.redOverdue.length) lines.push(`${plural(state.redOverdue.length, "check")} more than a week overdue: ${names(state.redOverdue)}.`);
  if (state.failing.length) lines.push(`${plural(state.failing.length, "asset")} still failing: ${names(state.failing)}.`);
  if (!lines.length) return null;
  return { title: "Compliance checks overdue", message: lines.join(" "), priority: "high" };
}

const noteBase = { module: "compliance", kind: "compliance-due", read: false, status: "open", automated: true, createdByName: "Primovex", actionUrl: "/compliance" };

// Run the morning reminders. `caretakers` and `managers` are the uids to tell; `now` and the handles are given so it can be tested.
async function runComplianceReminders({ db, FieldValue, now = new Date(), caretakers = [], managers = [] }) {
  const day = londonDay(now);
  const told = { caretakers: 0, managers: 0, skipped: "" };
  // weekdays only: nobody is chased on a Saturday or Sunday
  if (day.weekday === 0 || day.weekday === 6) return { ...told, skipped: "weekend" };

  const assetSnap = await db.collection("compliance_assets").get();
  const assets = assetSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const state = outstanding({ assets, now });

  async function send(uid, kind, notice) {
    if (!notice || !uid) return false;
    const ref = db.collection("users").doc(uid).collection("notifications").doc(`${kind}-${day.key}`);
    try {
      await ref.create({ ...noteBase, recipientUid: uid, title: notice.title, message: notice.message, priority: notice.priority, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return true;
    } catch (error) {
      if (error?.code === 6 || /already exists/i.test(String(error?.message || ""))) return false; // told already today
      throw error;
    }
  }

  const forCaretaker = caretakerNotice(state);
  for (const uid of caretakers) if (await send(uid, "cd", forCaretaker)) told.caretakers += 1;
  if (day.weekday === 1) {
    const forManager = managerNotice(state);
    for (const uid of managers) if (await send(uid, "cm", forManager)) told.managers += 1;
  }
  return told;
}

module.exports = { CARETAKER_ROLE, MANAGER_ROLE, FIRE_RED_AFTER_DAYS, RED_AFTER_DAYS, caretakerNotice, daysSinceFireTest, fireTestDue, isCheckDue, londonDay, managerNotice, outstanding, overdueDays, runComplianceReminders };
