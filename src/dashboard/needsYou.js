// The Practice Manager's "Needs you" list: everything waiting on them, most urgent first, each with one button that deals with it.
// Pure: the Dashboard hands in what the rest of the app already knows (the Orb's status signals, the SARs the reminder bell lists, the
// mileage claims, rota requests and timesheets waiting) and gets back rows. A row's `action` is either
//   { kind: "link", to, label }                     opens the exact page (and tab) that deals with it, or
//   { kind: "remind-sar" | "approve-mileage" | "agree-rota", ... }  does it there and then, after the usual confirmation.
// Nothing here holds patient details: a SAR is its reference, who has it and when it is due.

const RANK = { critical: 0, warning: 1, info: 2 };
export const MAX_EACH = 3; // how many of one kind are listed one by one before the rest are gathered into one row

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const ukDate = (key) => (key ? String(key).split("-").reverse().join("/") : "");

export function dueWords(days) {
  if (days === null || days === undefined) return "has no due date";
  if (days < 0) return `is overdue by ${plural(-days, "day")}`;
  if (days === 0) return "is due today";
  if (days === 1) return "is due tomorrow";
  return `is due in ${days} days`;
}

const CATEGORY_OF_AREA = { stock: "stock", coldchain: "fridges", compliance: "compliance", governance: "concerns" };

// What a person can leave out of their own Needs you list (Customise Home)
export const NEEDS_CATEGORIES = [
  { key: "sars", label: "SARs" },
  { key: "timesheets", label: "Timesheets to sign off" },
  { key: "mileage", label: "Mileage claims" },
  { key: "rota", label: "Rota requests" },
  { key: "concerns", label: "Concerns" },
  { key: "stock", label: "Stock" },
  { key: "fridges", label: "Fridges" },
  { key: "compliance", label: "Compliance" },
  { key: "messages", label: "Messages" },
];

// Leave out the kinds this person has hidden and keep the first `max` (0 = all). Says how many were cut off, so the list can say so.
export function filterNeedsYou(rows = [], { hide = [], max = 0 } = {}) {
  const shown = rows.filter((row) => !hide.includes(row.category));
  if (!max || shown.length <= max) return { rows: shown, more: 0 };
  return { rows: shown.slice(0, max), more: shown.length - max };
}

const LINK_LABEL = { stock: "Review stock", coldchain: "Check fridges", governance: "Open", compliance: "Open" };

function sarRowsFor(sarRows) {
  const live = sarRows.filter((r) => r.daysLeft !== null && r.daysLeft !== undefined && r.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft);
  const shown = live.slice(0, MAX_EACH + 1);
  const rows = shown.map((r) => ({
    id: `sar-${r.id}`, category: "sars", area: "governance", tone: r.daysLeft < 0 ? "critical" : "warning",
    text: `${r.reference} ${dueWords(r.daysLeft)}`,
    detail: `${r.assignedToName || "Unassigned"}${r.lastReminderAt && r.remindedToday ? " · reminded today" : ""}`,
    action: { kind: "remind-sar", row: r },
  }));
  if (live.length > MAX_EACH + 1) {
    rows.splice(MAX_EACH, rows.length, { id: "sar-more", category: "sars", area: "governance", tone: live.slice(MAX_EACH).some((r) => r.daysLeft < 0) ? "critical" : "warning", text: `${plural(live.length - MAX_EACH, "more SAR")} due soon or overdue`, detail: "", action: { kind: "link", to: "/sars-to-chase", label: "See all" } });
  }
  return rows;
}

function mileageRowsFor(claims) {
  const rows = claims.slice(0, MAX_EACH).map((c) => ({
    id: `mileage-${c.id}`, category: "mileage", area: "people", tone: "info",
    text: `${c.staffName || "Someone"}: ${c.fromName} to ${c.toName}${c.returnTrip ? " and back" : ""}`,
    detail: `Mileage claim · ${ukDate(c.date)}`,
    action: { kind: "approve-mileage", claim: c },
  }));
  if (claims.length > MAX_EACH) rows.push({ id: "mileage-more", category: "mileage", area: "people", tone: "info", text: `${plural(claims.length - MAX_EACH, "more mileage claim")} to approve`, detail: "", action: { kind: "link", to: "/mileage?tab=approve", label: "Review" } });
  return rows;
}

const rotaText = (r) => (r.type === "swap" ? `${r.requesterName} and ${r.targetName} would swap shifts` : `${r.requesterName} asked: ${r.adjust?.text || "for an adjustment"}`);

function rotaRowsFor(requests) {
  const rows = requests.slice(0, MAX_EACH).map((r) => ({
    id: `rota-${r.id}`, category: "rota", area: "people", tone: "warning", text: rotaText(r),
    detail: r.type === "swap" && r.changesHours ? "Reception rota · changes hours" : "Reception rota",
    action: { kind: "agree-rota", request: r },
  }));
  if (requests.length > MAX_EACH) rows.push({ id: "rota-more", category: "rota", area: "people", tone: "warning", text: `${plural(requests.length - MAX_EACH, "more rota request")} waiting`, detail: "", action: { kind: "link", to: "/reception-rota?tab=requests", label: "Review" } });
  return rows;
}

// opts: { signals, sarRows (null when this person has no SAR list), mileage, rota, sheetsWaiting, messages }
export function buildNeedsYou({ signals = [], sarRows = null, mileage = [], rota = [], sheetsWaiting = 0, messages = 0 } = {}) {
  const rows = [];
  if (Array.isArray(sarRows)) rows.push(...sarRowsFor(sarRows));
  rows.push(...rotaRowsFor(rota));
  if (sheetsWaiting > 0) rows.push({ id: "timesheets", category: "timesheets", area: "people", tone: "warning", text: `${plural(sheetsWaiting, "timesheet")} to sign off`, detail: "", action: { kind: "link", to: "/my-timesheet?tab=signoff", label: "Sign off" } });
  rows.push(...mileageRowsFor(mileage));

  for (const s of signals) {
    // the SARs the bell lists are shown one by one above, with a Remind button, so the Orb's SAR counts would only repeat them
    if (Array.isArray(sarRows) && /^sars-/.test(s.key || "")) continue;
    const tone = s.level === "red" ? "critical" : "warning";
    const concern = s.area === "governance" && /concern/.test(s.key || "");
    rows.push({
      id: `signal-${s.key}`, category: CATEGORY_OF_AREA[s.area] || "other", area: s.area, tone, text: s.label, detail: s.detail || "",
      action: { kind: "link", to: s.route || "/dashboard", label: concern ? "Open concerns" : LINK_LABEL[s.area] || "Open" },
    });
  }
  if (messages > 0) rows.push({ id: "messages", category: "messages", area: "messages", tone: "info", text: plural(messages, "unread message"), detail: "", action: { kind: "link", to: "/notifications", label: "Read" } });

  // most urgent first; within a tone the order above stands
  return rows.map((row, index) => ({ row, index })).sort((a, b) => RANK[a.row.tone] - RANK[b.row.tone] || a.index - b.index).map(({ row }) => row);
}

// The health strip: one tile per area the person watches, coloured by the worst thing in it.
const AREA_LABEL = { governance: "Governance", stock: "Stock", coldchain: "Fridges", compliance: "Compliance", people: "People" };
export function buildHealth({ areas = [], rows = [] } = {}) {
  const tiles = areas.map((area) => {
    const mine = rows.filter((r) => r.area === area);
    const worst = mine.length ? mine.reduce((a, b) => (RANK[a.tone] <= RANK[b.tone] ? a : b)) : null;
    const level = !worst ? "green" : worst.tone === "critical" ? "red" : worst.tone === "warning" ? "amber" : "green";
    // the tile says how many, the list below says what: the same words are not shown twice
    return { area, label: AREA_LABEL[area] || area, level, text: worst ? `${mine.length} to look at` : "All clear" };
  });
  return tiles;
}
