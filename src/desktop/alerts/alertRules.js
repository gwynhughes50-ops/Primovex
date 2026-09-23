// Rules for the desktop corner alert. Kept free of Firebase and React so the
// decisions (what counts as overdue, when to show, what snooze and dismiss
// mean) can be tested on their own.
//
// The alert only ever carries counts: no reference numbers, names or case
// details leave the app, so it is safe to appear over another program.

export const DUE_SOON_DAYS = 2;
export const REPEAT_MS = 60 * 60 * 1000; // shown again every hour until snoozed or dismissed
export const NEW_ITEM_GAP_MS = 5 * 60 * 1000; // a newly overdue item can bring it back sooner, but not in a rapid stream
export const ALERT_START_HOUR = 8;
export const ALERT_END_HOUR = 18;

const SAR_CLOSED = ["completed", "archived"];
const CONCERN_CLOSED = ["closed", "archived"];
const MAX_REMEMBERED_KEYS = 500;

export function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

// Whole calendar days from today to the due date (negative once it has passed),
// the same way the SAR and Concerns pages count them.
function daysUntil(dueMs, nowMs) {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dueMs);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function stateFromDays(days) {
  if (days === null) return null;
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_DAYS) return "soon";
  return null;
}

// "overdue" | "soon" | null for one SAR.
export function sarAlertState(sar, nowMs) {
  if (!sar || SAR_CLOSED.includes(sar.status)) return null;
  const due = toMillis(sar.dueDate || sar.due_date);
  return due === null ? null : stateFromDays(daysUntil(due, nowMs));
}

// A concern has up to three deadlines; the most urgent one that still applies
// decides. Acknowledgement only matters until it has been acknowledged, the
// early-resolution date only while it is in early resolution.
export function concernAlertState(concern, nowMs) {
  if (!concern || CONCERN_CLOSED.includes(concern.status)) return null;
  const days = [];
  if (!concern.acknowledgedAt) days.push(dayCount(concern.acknowledgementDueAt, nowMs));
  if (concern.status === "early_resolution") days.push(dayCount(concern.earlyResolutionDueAt, nowMs));
  days.push(dayCount(concern.finalResponseDueAt, nowMs));
  const known = days.filter((d) => d !== null);
  return known.length ? stateFromDays(Math.min(...known)) : null;
}

function dayCount(value, nowMs) {
  const ms = toMillis(value);
  return ms === null ? null : daysUntil(ms, nowMs);
}

// Everything that could be shown right now. Pass only the rows the person's
// team is allowed to see (an empty list for a team they are not in).
export function summariseDueItems({ sars = [], concerns = [], now = Date.now() } = {}) {
  const items = [];
  for (const sar of sars) {
    const state = sarAlertState(sar, now);
    if (state) items.push({ kind: "sar", id: sar.id, state, key: `sar:${sar.id}:${state}` });
  }
  for (const concern of concerns) {
    const state = concernAlertState(concern, now);
    if (state) items.push({ kind: "concern", id: concern.id, state, key: `concern:${concern.id}:${state}` });
  }
  const count = (kind, state) => items.filter((i) => i.kind === kind && i.state === state).length;
  const counts = {
    sarOverdue: count("sar", "overdue"),
    sarSoon: count("sar", "soon"),
    concernOverdue: count("concern", "overdue"),
    concernSoon: count("concern", "soon"),
  };
  return { items, keys: items.map((i) => i.key), counts, total: items.length };
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function firstNameOf(displayName) {
  const first = String(displayName || "").trim().split(/\s+/)[0];
  return first || "";
}

// The words on the alert. Overdue lines first, then due-soon.
export function buildAlertPayload({ displayName, counts }) {
  const lines = [];
  if (counts.concernOverdue) lines.push({ tone: "danger", text: `${plural(counts.concernOverdue, "concern", "concerns")} overdue` });
  if (counts.sarOverdue) lines.push({ tone: "danger", text: `${plural(counts.sarOverdue, "SAR", "SARs")} overdue` });
  if (counts.concernSoon) lines.push({ tone: "warning", text: `${plural(counts.concernSoon, "concern", "concerns")} due within ${DUE_SOON_DAYS} days` });
  if (counts.sarSoon) lines.push({ tone: "warning", text: `${plural(counts.sarSoon, "SAR", "SARs")} due within ${DUE_SOON_DAYS} days` });

  const name = firstNameOf(displayName);
  const overdue = counts.concernOverdue + counts.sarOverdue;
  // Open the page with the most urgent work: SARs first (a statutory clock),
  // unless only concerns need attention.
  const sarWeight = counts.sarOverdue * 2 + counts.sarSoon;
  const concernWeight = counts.concernOverdue * 2 + counts.concernSoon;
  return {
    title: `${name ? `Hi ${name}` : "Hi"}, ${overdue ? "you have overdue items" : "you have items due soon"}`,
    lines,
    openPath: concernWeight > sarWeight ? "/governance/concerns" : "/governance/sars",
  };
}

// Mon–Fri, 08:00–18:00 local time: a practice PC left running overnight or at
// the weekend has nobody to read it.
export function isWithinAlertHours(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const hour = d.getHours();
  return hour >= ALERT_START_HOUR && hour < ALERT_END_HOUR;
}

export const SNOOZE_OPTIONS = {
  snooze_1h: "1 hour",
  snooze_later: "Later today",
  snooze_tomorrow: "Tomorrow morning",
};

export function snoozeUntil(action, nowMs = Date.now()) {
  if (action === "snooze_1h") return nowMs + 60 * 60 * 1000;
  if (action === "snooze_later") return nowMs + 3 * 60 * 60 * 1000;
  if (action === "snooze_tomorrow") {
    const d = new Date(nowMs);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  }
  return null;
}

export const EMPTY_ALERT_STATE = { snoozedUntil: 0, dismissedKeys: [], lastShownAt: 0, lastShownKeys: [] };

// Whether the alert should pop up now.
//  - snoozed: nothing until the snooze ends
//  - dismissed: nothing, until something new turns up that was not on the
//    list when it was dismissed
//  - otherwise: once an hour, or sooner (not within 5 minutes) when something
//    new has become due since the last time it was shown
export function shouldShowAlert({ summary, state = EMPTY_ALERT_STATE, now = Date.now() }) {
  if (!summary || summary.total === 0) return false;
  if (!isWithinAlertHours(now)) return false;
  if ((state.snoozedUntil || 0) > now) return false;

  const dismissed = new Set(state.dismissedKeys || []);
  if (summary.keys.every((k) => dismissed.has(k))) return false;

  const sinceShown = now - (state.lastShownAt || 0);
  if (sinceShown >= REPEAT_MS) return true;

  const lastShown = new Set(state.lastShownKeys || []);
  const hasNew = summary.keys.some((k) => !lastShown.has(k) && !dismissed.has(k));
  return hasNew && sinceShown >= NEW_ITEM_GAP_MS;
}

function cap(keys) {
  return keys.slice(-MAX_REMEMBERED_KEYS);
}

export function afterShown(state, summary, now = Date.now()) {
  return { ...state, snoozedUntil: 0, lastShownAt: now, lastShownKeys: cap(summary.keys) };
}

// Snoozing also clears "last shown" so the alert returns as soon as the snooze ends.
export function afterSnooze(state, action, now = Date.now()) {
  const until = snoozeUntil(action, now);
  if (!until) return state;
  return { ...state, snoozedUntil: until, lastShownAt: 0 };
}

export function afterDismiss(state, summary) {
  return { ...state, dismissedKeys: cap([...new Set([...(state.dismissedKeys || []), ...summary.keys])]) };
}

// ---- per-person, per-computer storage (localStorage) ----------------------

const stateKey = (uid) => `primovex.desktopAlerts.state.${uid}`;
const enabledKey = (uid) => `primovex.desktopAlerts.enabled.${uid}`;

export function loadAlertState(uid, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(stateKey(uid));
    return raw ? { ...EMPTY_ALERT_STATE, ...JSON.parse(raw) } : { ...EMPTY_ALERT_STATE };
  } catch {
    return { ...EMPTY_ALERT_STATE };
  }
}

export function saveAlertState(uid, state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(stateKey(uid), JSON.stringify(state));
  } catch {
    // Storage unavailable: the alert still works, it just will not remember a snooze across restarts.
  }
}

export function isDesktopAlertsEnabled(uid, storage = globalThis.localStorage) {
  try {
    return storage?.getItem(enabledKey(uid)) !== "off";
  } catch {
    return true;
  }
}

export function setDesktopAlertsEnabled(uid, enabled, storage = globalThis.localStorage) {
  try {
    if (enabled) storage?.removeItem(enabledKey(uid));
    else storage?.setItem(enabledKey(uid), "off");
  } catch {
    // ignore
  }
}

// ---- Login reminder (desktop, signed-out screen) ---------------------------
// Same corner popup as the SAR/concerns alert above (see DesktopAlertsHost),
// used for the opposite moment: nobody is signed in, so there is no uid to
// scope Firestore reads or state by. State lives under one fixed key rather
// than per-person; "dismiss" is deliberately not remembered forever the way
// it is for SAR/concern items (there is no new item to bring it back), so it
// simply falls back to the normal hourly repeat - see DesktopLoginReminderHost.

export const LOGIN_REMINDER_ID = "login-reminder";
export const LOGIN_REMINDER_GRACE_MS = 90 * 1000; // let the login screen settle before the first nudge
export const LOGIN_REMINDER_STALE_DAYS = 2; // "it's been a while" wording kicks in
// Always "due" while the login screen is showing - shouldShowAlert/afterShown
// handle all the pacing (grace aside, which the host applies itself).
export const LOGIN_REMINDER_SUMMARY = { total: 1, keys: [LOGIN_REMINDER_ID] };

const LAST_LOGIN_AT_KEY = "primovex.lastLoginAt";

// Called once, right after a real sign-in succeeds (see AuthContext). Never
// called for demo/synthetic sessions - there is nothing to remind them of.
export function recordLoginTimestamp(whenMs = Date.now(), storage = globalThis.localStorage) {
  try {
    storage?.setItem(LAST_LOGIN_AT_KEY, String(whenMs));
  } catch {
    // Storage unavailable: the reminder still works, it just won't know how long it's been.
  }
}

export function readLastLoginAt(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(LAST_LOGIN_AT_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Whole days since the last recorded sign-in on this PC, or null if unknown
// (e.g. a fresh install, or storage was cleared).
export function daysSinceLogin(lastLoginAtMs, nowMs = Date.now()) {
  if (!lastLoginAtMs) return null;
  return Math.max(0, Math.floor((nowMs - lastLoginAtMs) / 86400000));
}

export function buildLoginReminderPayload({ days }) {
  if (days !== null && days >= LOGIN_REMINDER_STALE_DAYS) {
    return {
      title: "It's been a while",
      lines: [{ tone: "warning", text: `${days} days since anyone signed in on this PC` }],
    };
  }
  return {
    title: "Still there?",
    lines: [{ tone: "warning", text: "Sign in to Primovex when you're ready" }],
  };
}
