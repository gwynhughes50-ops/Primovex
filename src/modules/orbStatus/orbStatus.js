// The Orb's colour: a traffic light for the person looking at it. Green when what is theirs is in order, amber when
// something is coming up or just late, red when something has failed or is properly overdue. It is per person: the
// Practice Manager's covers the whole practice, the Caretaker's only compliance, a nurse's the cold chain and stock.
// Pure: the screens hand in the attention chips and the compliance list.

import { dueList } from "../compliance/complianceDue.js";

export const AREAS = { governance: "Governance", stock: "Stock", coldchain: "Fridges", compliance: "Compliance" };
const norm = (value) => String(value || "").trim().toLowerCase();
const PRACTICE_ROLES = ["system admin", "practice manager", "partner"];

// which areas this person's Orb watches
//   role: their role name; can(capability): what they may do
export function scopeFor({ role, can = () => false } = {}) {
  const r = norm(role);
  if (PRACTICE_ROLES.includes(r) || can("admin.access")) return { key: "practice", areas: ["governance", "stock", "coldchain", "compliance"] };
  if (r.includes("caretaker")) return { key: "caretaker", areas: ["compliance"] };
  const areas = [];
  if (can("temperature.write")) areas.push("coldchain");
  if (can("inventory.write") || can("inventory.verify")) areas.push("stock");
  if (can("compliance.write") || can("compliance.manageAssets")) areas.push("compliance");
  return { key: areas.length ? "own" : "none", areas };
}

const LEVEL_OF = { critical: "red", warning: "amber" };
const ROUTE = { governance: "/governance/sars", stock: "/inventory", coldchain: "/temperature", compliance: "/compliance" };
const MOBILE = { governance: "sars", stock: "stock", coldchain: "temperature", compliance: "checks" };

// Everything wrong or coming up for this person, red first.
//   chips: the attention chips (see mobile/homeAttention.js), each with an area; due: the compliance list items
export function buildSignals({ scope, chips = [], due = [] } = {}) {
  const areas = new Set(scope?.areas || []);
  const signals = [];
  for (const chip of chips) {
    // compliance comes from the fuller list below, so its chips (failed checks, certificates, COSHH) are not counted twice
    if (!chip.area || chip.area === "messages" || chip.area === "compliance" || !areas.has(chip.area)) continue;
    const level = LEVEL_OF[chip.tone];
    if (level) signals.push({ key: chip.key, area: chip.area, level, label: chip.label, detail: "", route: chip.area === "governance" && /concern/.test(chip.key) ? "/governance/concerns" : ROUTE[chip.area], mobile: chip.action || MOBILE[chip.area] });
  }
  if (areas.has("compliance")) {
    for (const item of due) {
      const level = LEVEL_OF[item.tone];
      if (level) signals.push({ key: item.key, area: "compliance", level, label: item.label, detail: item.detail || "", route: ROUTE.compliance, mobile: MOBILE.compliance, action: item.action });
    }
  }
  const rank = { red: 0, amber: 1 };
  return signals.sort((a, b) => rank[a.level] - rank[b.level]);
}

export const levelOf = (signals = []) => (signals.some((s) => s.level === "red") ? "red" : signals.length ? "amber" : "green");

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lower = (text) => String(text).charAt(0).toLowerCase() + String(text).slice(1);

// "2 things need attention now: a fire check failed, a certificate expired." in the person's own words
export function messageFor(signals = []) {
  const level = levelOf(signals);
  if (level === "green") return { level, headline: "All clear", summary: "Nothing needs attention." };
  const red = signals.filter((s) => s.level === "red");
  const amber = signals.filter((s) => s.level === "amber");
  const top = (level === "red" ? red : amber).slice(0, 3).map((s) => lower(s.label)).join("; ");
  const more = (level === "red" ? red : amber).length > 3 ? ` and ${(level === "red" ? red : amber).length - 3} more` : "";
  if (level === "red") {
    const tail = amber.length ? ` Also ${plural(amber.length, "thing")} coming up.` : "";
    return { level, headline: red.length === 1 ? "Something has failed or is overdue" : "Things have failed or are overdue", summary: `${red.length === 1 ? "1 thing needs" : `${red.length} things need`} attention now: ${top}${more}.${tail}` };
  }
  return { level, headline: amber.length === 1 ? "Something is coming up" : "Things are coming up", summary: `${amber.length === 1 ? "1 thing is" : `${amber.length} things are`} coming up or just late: ${top}${more}.` };
}

// the whole picture from the raw inputs
export function buildOrbStatus({ scope, chips = [], dueInputs = null, now = new Date() } = {}) {
  const due = scope?.areas?.includes("compliance") && dueInputs ? dueList({ ...dueInputs, now }) : [];
  const signals = buildSignals({ scope, chips, due });
  const message = messageFor(signals);
  return { level: message.level, signals, headline: message.headline, summary: message.summary, redCount: signals.filter((s) => s.level === "red").length, amberCount: signals.filter((s) => s.level === "amber").length };
}

export const NO_STATUS = { level: "green", signals: [], headline: "All clear", summary: "Nothing needs attention.", redCount: 0, amberCount: 0 };
