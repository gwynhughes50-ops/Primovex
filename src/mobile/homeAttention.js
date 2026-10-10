import { concernDeadline, concernOpen, sarDays, sarOpen } from "../ai/management/managementAsk";

// The strip at the top of a manager's or partner's phone home: what needs attention right now, most urgent
// first, each one a tap away from the screen that deals with it. Pure; the home screen supplies the data.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ORDER = { critical: 0, warning: 1, info: 2, ok: 3 };

// sars / concerns / stockAlerts are the records (or null when this person can't see them);
// stockAlerts are [{ state: 'expired' | 'out' | 'low' | 'soon' }]; messages is a count of unread messages;
// fridgeIncidents and fridgesUnchecked are counts (null when this person can't see temperatures);
// coshh is { overdue, dueSoon } review counts from the COSHH register (null when this person can't see it).
export function buildAttention({ sars = null, concerns = null, stockAlerts = null, messages = 0, fridgeIncidents = null, fridgeQuarantined = null, fridgesUnchecked = null, coshh = null, now = new Date() } = {}) {
  const chips = [];

  if (Array.isArray(sars)) {
    const open = sars.filter(sarOpen).map((sar) => sarDays(sar, now));
    const overdue = open.filter((d) => d !== null && d < 0).length;
    const soon = open.filter((d) => d !== null && d >= 0 && d <= 7).length;
    if (overdue) chips.push({ key: "sars-overdue", tone: "critical", label: `${plural(overdue, "SAR")} overdue`, action: "sars" });
    if (soon) chips.push({ key: "sars-soon", tone: "warning", label: `${plural(soon, "SAR")} due this week`, action: "sars" });
  }

  if (Array.isArray(concerns)) {
    const open = concerns.filter(concernOpen).map((concern) => concernDeadline(concern, now));
    const overdue = open.filter((d) => d.overdue).length;
    const soon = open.filter((d) => !d.overdue && d.days !== null && d.days <= 5).length;
    if (overdue) chips.push({ key: "concerns-overdue", tone: "critical", label: `${plural(overdue, "concern")} overdue`, action: "concerns" });
    if (soon) chips.push({ key: "concerns-soon", tone: "warning", label: `${plural(soon, "concern")} due soon`, action: "concerns" });
  }

  if (Array.isArray(stockAlerts)) {
    const urgent = stockAlerts.filter((a) => a.state === "expired" || a.state === "out").length;
    const low = stockAlerts.filter((a) => a.state === "low").length;
    if (urgent) chips.push({ key: "stock-urgent", tone: "critical", label: `${plural(urgent, "stock item")} expired or out`, action: "stock" });
    if (low) chips.push({ key: "stock-low", tone: "warning", label: `${low} running low`, action: "stock" });
  }

  if (typeof fridgeQuarantined === "number" && fridgeQuarantined > 0) chips.push({ key: "fridges-quarantined", tone: "critical", label: `${plural(fridgeQuarantined, "fridge")} quarantined`, action: "temperature" });
  if (typeof fridgeIncidents === "number" && fridgeIncidents > 0) chips.push({ key: "fridge-incidents", tone: "critical", label: `${plural(fridgeIncidents, "fridge incident")} open`, action: "temperature" });
  if (typeof fridgesUnchecked === "number" && fridgesUnchecked > 0) chips.push({ key: "fridges-unchecked", tone: "warning", label: `${plural(fridgesUnchecked, "fridge")} not checked today`, action: "fridge-check" });

  if (coshh && coshh.overdue > 0) chips.push({ key: "coshh-overdue", tone: "critical", label: `${plural(coshh.overdue, "COSHH review")} overdue`, action: "coshh" });
  if (coshh && coshh.dueSoon > 0) chips.push({ key: "coshh-soon", tone: "warning", label: `${plural(coshh.dueSoon, "COSHH review")} due soon`, action: "coshh" });

  if (messages > 0) chips.push({ key: "messages", tone: "info", label: plural(messages, "unread message"), action: "messages" });

  chips.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
  return chips.length ? chips : [{ key: "clear", tone: "ok", label: "Nothing urgent right now", action: null }];
}
