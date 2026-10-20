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

// ---- PAT: each appliance's own due date (as in src/modules/pat/pat.js) ----
const PAT_SOON_DAYS = 30;
const PAT_RED_DAYS = 30;
const parseKey = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) || date.getMonth() !== Number(m[2]) - 1 ? null : date;
};
// today as a calendar day in London, as a plain date, so a due date is compared with the right day
function patStatus(asset, today) {
  if (asset.outOfUse === true) return { state: "out-of-use", days: null };
  const due = parseKey(asset.nextDueOn);
  if (!due) return { state: "never", days: null };
  const days = Math.round((due.getTime() - today.getTime()) / DAY);
  if (days < 0) return { state: "overdue", days };
  return { state: days <= PAT_SOON_DAYS ? "due-soon" : "ok", days };
}
function patOutstanding(patAssets, dayKey) {
  const today = parseKey(dayKey);
  const rows = patAssets.filter((a) => a && a.active !== false).map((asset) => ({ asset, ...patStatus(asset, today) }));
  const pick = (state) => rows.filter((r) => r.state === state);
  const overdue = pick("overdue");
  return { overdue, never: pick("never"), dueSoon: pick("due-soon"), redOverdue: overdue.filter((r) => r.days <= -PAT_RED_DAYS) };
}
const tagNames = (rows, max = 3) => `${rows.slice(0, max).map((r) => tidy(r.asset.tag || r.asset.name, 40) || "an appliance").join(", ")}${rows.length > max ? ` and ${rows.length - max} more` : ""}`;

const assetName = (a) => tidy(a.assetCode || a.label, 40) || "an asset";

// What is outstanding today
function outstanding({ assets = [], patAssets = [], now = new Date(), dayKey = "", monday = false }) {
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
    pat: dayKey ? patOutstanding(patAssets, dayKey) : { overdue: [], never: [], dueSoon: [], redOverdue: [] },
    monday,
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
  if (state.pat.overdue.length) lines.push(`${plural(state.pat.overdue.length, "appliance")} overdue for PAT testing: ${tagNames(state.pat.overdue)}.`);
  // what is coming up is only said on a Monday, so it is not repeated every morning
  if (state.monday && state.pat.dueSoon.length) lines.push(`${plural(state.pat.dueSoon.length, "appliance")} due for PAT testing in the next 30 days.`);
  if (!lines.length) return null;
  const red = state.fireRed || state.redOverdue.length > 0 || state.failing.length > 0 || state.pat.redOverdue.length > 0;
  return { title: "Compliance checks due", message: lines.join(" "), priority: red ? "high" : "routine" };
}

// The practice manager's Monday notice: only what has gone red. Null when nothing has.
function managerNotice(state) {
  const lines = [];
  if (state.fireRed) lines.push(Number.isFinite(state.fireDays) ? `No fire alarm test for ${plural(state.fireDays, "day")}.` : "No fire alarm test has ever been done.");
  if (state.redOverdue.length) lines.push(`${plural(state.redOverdue.length, "check")} more than a week overdue: ${names(state.redOverdue)}.`);
  if (state.failing.length) lines.push(`${plural(state.failing.length, "asset")} still failing: ${names(state.failing)}.`);
  if (state.pat.redOverdue.length) lines.push(`${plural(state.pat.redOverdue.length, "appliance")} more than a month overdue for PAT testing: ${tagNames(state.pat.redOverdue)}.`);
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

  const [assetSnap, patSnap] = await Promise.all([db.collection("compliance_assets").get(), db.collection("pat_assets").get()]);
  const assets = assetSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const patAssets = patSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const state = outstanding({ assets, patAssets, now, dayKey: day.key, monday: day.weekday === 1 });

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

module.exports = { patOutstanding, patStatus, CARETAKER_ROLE, MANAGER_ROLE, FIRE_RED_AFTER_DAYS, RED_AFTER_DAYS, caretakerNotice, daysSinceFireTest, fireTestDue, isCheckDue, londonDay, managerNotice, outstanding, overdueDays, runComplianceReminders };
