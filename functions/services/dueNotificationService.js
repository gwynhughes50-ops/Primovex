const { FieldValue } = require("firebase-admin/firestore");

// Due-soon and overdue notifications for SARs and concerns, sent into each
// person's in-app inbox (users/{uid}/notifications) by a scheduled job.
//
// Who is told, following the practice's own design notes: the person a SAR or
// concern is assigned to is told first (when it is due within two days, and
// again when it goes overdue); a SAR's escalation manager is told only when it
// becomes overdue. Each notification has a fixed id built from the record, the
// person and the due date, and is only ever created once - so a daily run never
// repeats itself, and a changed due date (a new id) tells people again.
//
// Dates are worked out as whole calendar days in London time (the cloud runs in
// UTC, so a due date late in the evening would otherwise land on the wrong day).
// The two-day window matches the desktop pop-up (src/desktop/alerts/alertRules.js).

const DUE_SOON_DAYS = 2;
const TIME_ZONE = "Europe/London";

const SAR_OPEN = ["new", "assigned", "in_progress", "quality_check"];
const CONCERN_OPEN = ["received", "acknowledged", "listening", "early_resolution", "investigation", "response", "learning"];
const SAR_CLOSED = ["completed", "archived"];
const CONCERN_CLOSED = ["closed", "archived"];

function toDateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// The calendar date (year, month, day) a moment falls on in London.
function londonParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

const dayNumber = ({ year, month, day }) => Math.round(Date.UTC(year, month - 1, day) / 86400000);

// Whole calendar days from today to the due date, in London: 0 on the day,
// negative once it has passed. Null if there is no usable date.
function daysUntil(value, now) {
  const due = toDateValue(value);
  if (!due) return null;
  return dayNumber(londonParts(due)) - dayNumber(londonParts(now));
}

function formatDate(value) {
  const date = toDateValue(value);
  if (!date) return "";
  const { year, month, day } = londonParts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

// 20261030 - in the id, so a moved due date is a new notification.
function dueKey(value) {
  const date = toDateValue(value);
  if (!date) return "nodate";
  const { year, month, day } = londonParts(date);
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const whenText = (days) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);

function notification({ id, recipientUid, title, message, module, priority, dueDate, actionUrl, kind, sourceId }) {
  return {
    id,
    recipientUid,
    data: {
      recipientUid,
      title,
      message,
      module,
      priority,
      dueDate: dueDate || null,
      actionUrl,
      read: false,
      status: "open",
      automated: true,
      kind,
      sourceId,
      createdByUid: null,
      createdByName: "Primovex",
    },
  };
}

function planSar(sar, now) {
  if (!sar || SAR_CLOSED.includes(sar.status)) return [];
  const dueValue = sar.dueDate || sar.due_date;
  const days = daysUntil(dueValue, now);
  if (days === null || days > DUE_SOON_DAYS) return [];

  const reference = sar.reference || sar.id;
  const label = sar.requestTypeLabel || "SAR";
  const assignee = String(sar.assignedToUid || "");
  const manager = String(sar.managerUid || "");
  const key = dueKey(dueValue);
  const out = [];
  const base = { module: "sar", dueDate: dueValue, actionUrl: "/governance/sars", sourceId: sar.id };

  if (days >= 0) {
    // Due soon: the person it's assigned to, only.
    if (assignee) {
      out.push(notification({
        ...base, id: `sar-due-soon-${sar.id}-${assignee}-${key}`, recipientUid: assignee, kind: "due-soon", priority: "high",
        title: `SAR due ${whenText(days)}: ${reference}`,
        message: `${label} request is due ${formatDate(dueValue)}.`,
      }));
    }
    return out;
  }

  const ago = plural(-days, "day");
  if (assignee) {
    out.push(notification({
      ...base, id: `sar-overdue-${sar.id}-${assignee}-${key}`, recipientUid: assignee, kind: "overdue", priority: "critical",
      title: `SAR overdue: ${reference}`,
      message: `${label} request was due ${formatDate(dueValue)} (${ago} ago).`,
    }));
  }
  // The escalation manager hears only once it is overdue - and when nobody has
  // been assigned, they are the one to act.
  if (manager && manager !== assignee) {
    out.push(notification({
      ...base, id: `sar-overdue-manager-${sar.id}-${manager}-${key}`, recipientUid: manager, kind: "overdue-escalation", priority: "critical",
      title: `SAR overdue: ${reference}`,
      message: assignee
        ? `Assigned to ${sar.assignedToName || "a colleague"}. ${label} request was due ${formatDate(dueValue)} (${ago} ago). You're the escalation manager.`
        : `Not assigned to anyone. ${label} request was due ${formatDate(dueValue)} (${ago} ago). You're the escalation manager.`,
    }));
  }
  return out;
}

// A concern has up to three deadlines; the most urgent one that still applies
// decides (the same rule as the desktop pop-up): acknowledgement until it has
// been acknowledged, early resolution while in early resolution, and the final
// response always.
function concernDeadline(concern, now) {
  const candidates = [];
  if (!concern.acknowledgedAt) candidates.push({ label: "acknowledgement", value: concern.acknowledgementDueAt });
  if (concern.status === "early_resolution") candidates.push({ label: "early resolution", value: concern.earlyResolutionDueAt });
  candidates.push({ label: "final response", value: concern.finalResponseDueAt });
  let best = null;
  for (const c of candidates) {
    const days = daysUntil(c.value, now);
    if (days === null) continue;
    if (!best || days < best.days) best = { ...c, days };
  }
  return best;
}

function planConcern(concern, now) {
  if (!concern || CONCERN_CLOSED.includes(concern.status)) return [];
  const owner = String(concern.ownerUid || "");
  if (!owner) return [];
  const deadline = concernDeadline(concern, now);
  if (!deadline || deadline.days > DUE_SOON_DAYS) return [];

  const reference = concern.reference || concern.id;
  const key = `${deadline.label.replace(/\s+/g, "-")}-${dueKey(deadline.value)}`;
  const base = { module: "governance", dueDate: deadline.value, actionUrl: "/governance/concerns", sourceId: concern.id, recipientUid: owner };

  if (deadline.days >= 0) {
    return [notification({
      ...base, id: `concern-due-soon-${concern.id}-${owner}-${key}`, kind: "due-soon", priority: "high",
      title: `Concern ${deadline.label} due ${whenText(deadline.days)}: ${reference}`,
      message: `The ${deadline.label} deadline is ${formatDate(deadline.value)}.`,
    })];
  }
  return [notification({
    ...base, id: `concern-overdue-${concern.id}-${owner}-${key}`, kind: "overdue", priority: "critical",
    title: `Concern overdue: ${reference}`,
    message: `The ${deadline.label} deadline was ${formatDate(deadline.value)} (${plural(-deadline.days, "day")} ago).`,
  })];
}

// IT laptops: the person who has a laptop (lent to them, otherwise assigned to them) is told a week before it is due an
// update or due back, and again once it is overdue. The IT team set the dates; nobody else is told. Laptop dates are plain
// days ("2026-11-20"), not moments, so they are read as the London calendar day they name.
const LAPTOP_SOON_DAYS = 7;
const LAPTOP_LIVE = ["in_use", "on_loan"];

function dayFromKey(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return null;
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  // reject 2026-02-31 and the like
  const back = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return back.getUTCMonth() === parts.month - 1 && back.getUTCDate() === parts.day ? parts : null;
}

function planLaptop(laptop, now) {
  if (!laptop || laptop.active === false || !LAPTOP_LIVE.includes(laptop.status)) return [];
  const onLoan = laptop.status === "on_loan" && laptop.loan;
  const holder = String((onLoan ? laptop.loan.borrowerUid : laptop.currentUserUid) || "");
  if (!holder) return [];
  const code = laptop.assetCode || laptop.id;
  const today = dayNumber(londonParts(now));
  const base = { module: "laptop", actionUrl: "/my-laptop", sourceId: laptop.id, recipientUid: holder };
  const out = [];

  const one = (what, dueOn, soonTitle, overdueTitle, soonMessage, overdueMessage) => {
    const parts = dayFromKey(dueOn);
    if (!parts) return;
    const days = dayNumber(parts) - today;
    if (days > LAPTOP_SOON_DAYS) return;
    const key = String(dueOn).replace(/-/g, "");
    const dueDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
    const when = formatDate(dueDate);
    if (days >= 0) {
      out.push(notification({ ...base, id: `laptop-${what}-soon-${laptop.id}-${holder}-${key}`, kind: "due-soon", priority: "routine", dueDate, title: `${soonTitle} ${whenText(days)}: ${code}`, message: soonMessage(when) }));
    } else {
      out.push(notification({ ...base, id: `laptop-${what}-overdue-${laptop.id}-${holder}-${key}`, kind: "overdue", priority: "high", dueDate, title: `${overdueTitle}: ${code}`, message: overdueMessage(when, plural(-days, "day")) }));
    }
  };

  one("update", laptop.nextUpdateDue, "Laptop update due", "Laptop update overdue",
    (when) => `The IT team need to update this laptop by ${when}. Please bring it to them or contact them to arrange it.`,
    (when, ago) => `This laptop was due an update on ${when} (${ago} ago). Please contact the IT team to arrange it.`);
  if (onLoan) {
    one("return", laptop.loan.dueBackOn, "Laptop due back", "Laptop overdue back",
      (when) => `This laptop is on loan to you until ${when}. Please return it to the IT team by then.`,
      (when, ago) => `This laptop was due back on ${when} (${ago} ago). Please return it to the IT team.`);
  }
  return out;
}

// Everything that should exist right now, given the open SARs and concerns and the laptops in use.
// Pure, so it can be tested without Firebase.
function planDueNotifications({ sars = [], concerns = [], laptops = [], now = new Date() } = {}) {
  return [
    ...sars.flatMap((sar) => planSar(sar, now)),
    ...concerns.flatMap((concern) => planConcern(concern, now)),
    ...laptops.flatMap((laptop) => planLaptop(laptop, now)),
  ];
}

const ALREADY_EXISTS = 6; // gRPC status code the Admin SDK reports for create() on an existing document

async function inChunks(items, size, fn) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

// Reads the open SARs and concerns, works out who should be told, and creates
// each notification that doesn't already exist (and only for accounts that are
// still active).
async function sendDueNotifications({ db, now = new Date() }) {
  const [sarSnap, concernSnap, laptopSnap] = await Promise.all([
    db.collection("governance_sars").where("status", "in", SAR_OPEN).get(),
    db.collection("governance_concerns").where("status", "in", CONCERN_OPEN).get(),
    db.collection("it_laptops").where("status", "in", LAPTOP_LIVE).get(),
  ]);
  const plan = planDueNotifications({
    sars: sarSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    concerns: concernSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    laptops: laptopSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    now,
  });
  const result = { considered: plan.length, created: 0, alreadySent: 0, skippedInactive: 0 };
  if (!plan.length) return result;

  const uids = [...new Set(plan.map((p) => p.recipientUid))];
  const userSnaps = await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)));
  const active = new Set(userSnaps.filter((s) => s.exists && s.data()?.active !== false).map((s) => s.id));

  await inChunks(plan, 20, async (item) => {
    if (!active.has(item.recipientUid)) {
      result.skippedInactive += 1;
      return;
    }
    try {
      await db.collection("users").doc(item.recipientUid).collection("notifications").doc(item.id).create({
        ...item.data,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      result.created += 1;
    } catch (error) {
      if (error?.code === ALREADY_EXISTS || /already exists/i.test(error?.message || "")) result.alreadySent += 1;
      else throw error;
    }
  });
  return result;
}

module.exports = {
  DUE_SOON_DAYS,
  LAPTOP_SOON_DAYS,
  daysUntil,
  formatDate,
  dueKey,
  planDueNotifications,
  sendDueNotifications,
  SAR_OPEN,
  CONCERN_OPEN,
};
