import { serverTimestamp, Timestamp } from "firebase/firestore";

export const NOTIFICATION_PRIORITY = {
  critical: "critical",
  high: "high",
  routine: "routine",
  info: "info",
};

export const NOTIFICATION_STATUS = {
  open: "open",
  completed: "completed",
  archived: "archived",
};

export function toDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function fromDate(date) {
  if (!date) return null;
  return Timestamp.fromDate(date instanceof Date ? date : new Date(date));
}

export function isSnoozed(notification, now = new Date()) {
  const snoozedUntil = toDate(notification?.snoozedUntil || notification?.snoozed_until);
  return !!snoozedUntil && snoozedUntil > now;
}

export function isOverdue(notification, now = new Date()) {
  const dueDate = toDate(notification?.dueDate || notification?.due_date);
  const status = notification?.status || NOTIFICATION_STATUS.open;
  return status !== NOTIFICATION_STATUS.completed && !!dueDate && dueDate < now;
}

export function daysUntil(notification, now = new Date()) {
  const dueDate = toDate(notification?.dueDate || notification?.due_date);
  if (!dueDate) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dueDate);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

export function getNotificationPriority(notification, now = new Date()) {
  if (isOverdue(notification, now)) return NOTIFICATION_PRIORITY.critical;
  const explicit = String(notification?.priority || "").toLowerCase();
  if (explicit && Object.values(NOTIFICATION_PRIORITY).includes(explicit)) return explicit;

  const days = daysUntil(notification, now);
  if (days !== null) {
    if (days <= 0) return NOTIFICATION_PRIORITY.critical;
    if (days <= 2) return NOTIFICATION_PRIORITY.high;
    if (days <= 7) return NOTIFICATION_PRIORITY.routine;
  }
  return NOTIFICATION_PRIORITY.info;
}

export function getPriorityLabel(priority) {
  if (priority === NOTIFICATION_PRIORITY.critical) return "Critical";
  if (priority === NOTIFICATION_PRIORITY.high) return "High";
  if (priority === NOTIFICATION_PRIORITY.routine) return "Routine";
  return "Info";
}

export function getPriorityClass(priority) {
  if (priority === NOTIFICATION_PRIORITY.critical) return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  if (priority === NOTIFICATION_PRIORITY.high) return "border-orange-400/40 bg-orange-500/10 text-orange-100";
  if (priority === NOTIFICATION_PRIORITY.routine) return "border-amber-400/40 bg-amber-500/10 text-amber-100";
  return "border-sky-400/30 bg-sky-500/10 text-sky-100";
}

export function getModuleLabel(module) {
  const key = String(module || "general").toLowerCase();
  const labels = {
    inventory: "Inventory",
    purchasing: "Purchasing",
    governance: "Governance",
    compliance: "Compliance",
    temperature: "Temperature",
    estates: "Estates",
    workforce: "Workforce",
    sar: "Subject Access Requests",
    general: "General",
  };
  return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

export function getSnoozeDate(option) {
  const now = new Date();
  const date = new Date(now);

  switch (option) {
    case "later_today":
      date.setHours(Math.max(date.getHours() + 3, 15), 0, 0, 0);
      return date;
    case "tomorrow":
      date.setDate(date.getDate() + 1);
      date.setHours(9, 0, 0, 0);
      return date;
    case "three_days":
      date.setDate(date.getDate() + 3);
      date.setHours(9, 0, 0, 0);
      return date;
    case "next_week":
      date.setDate(date.getDate() + 7);
      date.setHours(9, 0, 0, 0);
      return date;
    default:
      date.setDate(date.getDate() + 1);
      date.setHours(9, 0, 0, 0);
      return date;
  }
}

export function buildSnoozeUpdate(option) {
  const snoozedUntil = getSnoozeDate(option);
  return {
    snoozedUntil: Timestamp.fromDate(snoozedUntil),
    snoozeOption: option,
    updatedAt: serverTimestamp(),
  };
}

export function normalizeNotification(notification, now = new Date()) {
  const priority = getNotificationPriority(notification, now);
  const dueDays = daysUntil(notification, now);
  const snoozed = isSnoozed(notification, now);
  const overdue = isOverdue(notification, now);

  return {
    ...notification,
    priority,
    priorityLabel: getPriorityLabel(priority),
    priorityClass: getPriorityClass(priority),
    moduleLabel: getModuleLabel(notification?.module),
    dueDays,
    snoozed,
    overdue,
    status: notification?.status || NOTIFICATION_STATUS.open,
  };
}

export function summariseNotifications(rows = [], now = new Date()) {
  const normalised = rows.map((row) => normalizeNotification(row, now));
  const active = normalised.filter((row) => row.status !== NOTIFICATION_STATUS.completed && !row.snoozed);
  const snoozed = normalised.filter((row) => row.status !== NOTIFICATION_STATUS.completed && row.snoozed);
  const completed = normalised.filter((row) => row.status === NOTIFICATION_STATUS.completed);

  const counts = active.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.priority] = (acc[row.priority] || 0) + 1;
      if (row.overdue) acc.overdue += 1;
      return acc;
    },
    { total: 0, critical: 0, high: 0, routine: 0, info: 0, overdue: 0 }
  );

  const moduleCounts = active.reduce((acc, row) => {
    const module = row.moduleLabel || "General";
    acc[module] = (acc[module] || 0) + 1;
    return acc;
  }, {});

  return {
    active,
    snoozed,
    completed,
    counts,
    moduleCounts,
  };
}
