// When the Pulse orb should pulse faster: "a substantial change" since someone last looked.
// Pure (no React, no Firestore) so the rule can be tested.
//
// Three things count, as chosen by the practice:
//   - stock newly expired or run out (the same rules as the Alerts page),
//   - Practice Pulse dropping sharply,
//   - a new high-priority task, or a SAR newly overdue.
// "Newly" means more than when the orb was last acknowledged (opened). Things getting
// better never make it pulse, and quietly lower the bar so a later recurrence is noticed.

export const SCORE_DROP = 10;

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// How many SARs are past their due date and not finished.
export function overdueSarCount(sars = [], now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return sars.filter((sar) => {
    if (["completed", "archived"].includes(sar?.status)) return false;
    const due = toDate(sar?.dueDate || sar?.due_date);
    if (!due) return false;
    const day = new Date(due);
    day.setHours(0, 0, 0, 0);
    return day < today;
  }).length;
}

export const highPriorityTaskCount = (tasks = []) =>
  tasks.filter((t) => t.status !== "resolved" && ["critical", "high"].includes(String(t.priority).toLowerCase())).length;

// The few numbers the orb watches. stockCounts is { out, expired, ... } from summariseStockAlerts.
export function takeSnapshot({ score, stockCounts = {}, highTasks = 0, overdueSars = 0 }) {
  return {
    score: Number.isFinite(Number(score)) ? Number(score) : 100,
    stockBad: (Number(stockCounts.out) || 0) + (Number(stockCounts.expired) || 0),
    highTasks: Number(highTasks) || 0,
    overdueSars: Number(overdueSars) || 0,
  };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// { changed, reasons } for the current numbers against the last acknowledged ones.
export function detectChange(current, baseline) {
  if (!baseline) return { changed: false, reasons: [] };
  const reasons = [];
  if (baseline.score - current.score >= SCORE_DROP) reasons.push(`Practice Pulse dropped from ${baseline.score} to ${current.score}`);
  if (current.stockBad > baseline.stockBad) reasons.push(`${plural(current.stockBad - baseline.stockBad, "more item has", "more items have")} expired or run out`);
  if (current.highTasks > baseline.highTasks) reasons.push(`${plural(current.highTasks - baseline.highTasks, "new high-priority task", "new high-priority tasks")}`);
  if (current.overdueSars > baseline.overdueSars) reasons.push(`${plural(current.overdueSars - baseline.overdueSars, "SAR has", "SARs have")} become overdue`);
  return { changed: reasons.length > 0, reasons };
}

// The baseline to keep. Acknowledging (someone opened the orb) accepts how things are now.
// Otherwise improvements move the bar so only a genuine new problem pulses.
export function nextBaseline(current, baseline, { acknowledged = false } = {}) {
  if (!baseline || acknowledged) return { ...current };
  return {
    score: Math.max(baseline.score, current.score),
    stockBad: Math.min(baseline.stockBad, current.stockBad),
    highTasks: Math.min(baseline.highTasks, current.highTasks),
    overdueSars: Math.min(baseline.overdueSars, current.overdueSars),
  };
}

export const baselineKey = (userId) => `primovex.orb.baseline.v1:${userId || "anon"}`;

export function readBaseline(storage, userId) {
  try {
    const value = JSON.parse(storage?.getItem(baselineKey(userId)) || "null");
    return value && typeof value === "object" && Number.isFinite(value.score) ? value : null;
  } catch {
    return null;
  }
}

export function writeBaseline(storage, userId, value) {
  try { storage?.setItem(baselineKey(userId), JSON.stringify(value)); } catch { /* optional */ }
}
