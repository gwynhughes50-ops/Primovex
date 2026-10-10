// Inspection evidence summary: what Primovex can show an inspector, boiled down to one line or a few figures per
// area. Pure (no Firestore, no screens): the loader hands in the records, this works out the sections. The aim is
// evidence that the checks are happening, not the records themselves, so governance shows counts and dates only,
// never names or patient detail.

import { concernDeadline, concernOpen, sarDays, sarOpen } from "../../ai/management/managementAsk.js";
import { reviewSummary, reviewStatus } from "../coshh/coshh.js";

const DAY = 86400000;

export function toDate(value) {
  if (!value) return null;
  // a plain day (2026-10-09) is that day at midday, local time, so it never slips to the day before
  const date = value?.toDate ? value.toDate() : /^d{4}-d{2}-d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysAgo = (date, now) => Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY);
export const ukDate = (date) => (date ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "none recorded");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// the Monday of the week a date falls in, to count how many different weeks had a check
const weekKey = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return dayKey(x); };

// "from" for a 12-month window
export function periodStart(now) { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return startOfDay(d); }

const within = (date, from, now) => Boolean(date) && date >= from && date <= new Date(now.getTime() + DAY);
const latest = (dates) => dates.reduce((a, b) => (!a || b > a ? b : a), null);

// a section: status is ok | attention | none (nothing recorded) | unavailable (this person can't read it)
const section = (id, title, status, headline, rows = [], gaps = []) => ({ id, title, status, headline, rows, gaps });
const unavailable = (id, title) => section(id, title, "unavailable", "Not shown: your role can't read this record.");

function checkDate(check) { return toDate(check.performedAt) || toDate(check.createdAt); }
const failed = (check) => String(check.result || "").toLowerCase() === "fail";

// ---- premises and safety -----------------------------------------------------------------------------------
export function fireSection({ checks, fireWeekly, now, available }) {
  if (!available.fire) return unavailable("fire", "Fire safety");
  const from = periodStart(now);
  const tagged = (checks || []).filter((c) => String(c.assetType || "").startsWith("fire_")).map((c) => ({ date: checkDate(c), fail: failed(c), by: c.actor?.displayName, type: c.assetType }));
  const legacy = (fireWeekly || []).map((r) => ({ date: toDate(r.dateKey) || toDate(r.performedAt) || toDate(r.checkedAt) || toDate(r.createdAt), fail: false, by: r.checkedBy || r.performedBy || r.createdByName, type: "fire_point" }));
  const all = [...tagged, ...legacy].filter((r) => within(r.date, from, now));
  if (!all.length) return section("fire", "Fire safety", "none", "No fire checks recorded in the last 12 months.", [], ["No fire checks recorded in the last 12 months."]);
  const last = all.reduce((a, b) => (b.date > a.date ? b : a));
  const weeks = new Set(all.filter((r) => r.type === "fire_point").map((r) => weekKey(r.date))).size;
  const fails = all.filter((r) => r.fail).length;
  const since = daysAgo(last.date, now);
  const gaps = [];
  if (since > 10) gaps.push(`The last fire check was ${plural(since, "day")} ago (a weekly alarm test is expected).`);
  if (fails) gaps.push(`${plural(fails, "fire check")} failed in the last 12 months. Show what was done about each.`);
  return section("fire", "Fire safety", gaps.length ? "attention" : "ok",
    `${plural(all.length, "check")} in the last 12 months; last on ${ukDate(last.date)}.`,
    [["Weeks with an alarm test (of 52)", String(weeks)], ["Last check", `${ukDate(last.date)}${last.by ? `, ${last.by}` : ""}`], ["Failed checks", String(fails)]], gaps);
}

export function waterSection({ checks, waterRounds, now, available }) {
  if (!available.water) return unavailable("water", "Water safety (legionella)");
  const from = periodStart(now);
  const tagged = (checks || []).filter((c) => String(c.assetType || "").startsWith("water_")).map((c) => ({ date: checkDate(c), fail: failed(c), by: c.actor?.displayName, asset: c.assetId }));
  const legacy = (waterRounds || []).map((r) => ({ date: toDate(r.dateKey) || toDate(r.performedAt) || toDate(r.checkedAt) || toDate(r.createdAt), fail: false, by: r.checkedBy || r.performedBy || r.createdByName, asset: null }));
  const all = [...tagged, ...legacy].filter((r) => within(r.date, from, now));
  if (!all.length) return section("water", "Water safety (legionella)", "none", "No water temperature checks recorded in the last 12 months.", [], ["No water temperature checks recorded in the last 12 months."]);
  const last = all.reduce((a, b) => (b.date > a.date ? b : a));
  const since = daysAgo(last.date, now);
  const recentOutlets = new Set(tagged.filter((r) => r.asset && within(r.date, new Date(now.getTime() - 31 * DAY), now)).map((r) => r.asset)).size;
  const fails = all.filter((r) => r.fail).length;
  const gaps = [];
  if (since > 35) gaps.push(`The last water temperature check was ${plural(since, "day")} ago (monthly is expected).`);
  if (fails) gaps.push(`${plural(fails, "water reading")} out of range in the last 12 months. Show what was done about each.`);
  return section("water", "Water safety (legionella)", gaps.length ? "attention" : "ok",
    `${plural(all.length, "check")} in the last 12 months; last on ${ukDate(last.date)}.`,
    [["Outlets checked in the last 31 days", String(recentOutlets)], ["Last check", `${ukDate(last.date)}${last.by ? `, ${last.by}` : ""}`], ["Readings out of range", String(fails)]], gaps);
}

export function patSection({ patSessions, patAssets, now, available }) {
  if (!available.pat) return unavailable("pat", "Electrical safety (PAT)");
  const from = periodStart(now);
  const sessions = (patSessions || []).map((s) => toDate(s.testDate) || toDate(s.createdAt)).filter(Boolean);
  const recent = sessions.filter((d) => within(d, from, now));
  const assets = (patAssets || []).filter((a) => a.active !== false).length;
  if (!sessions.length) return section("pat", "Electrical safety (PAT)", "none", "No PAT testing sessions recorded.", [["Appliances listed", String(assets)]], ["No PAT testing sessions recorded."]);
  const last = latest(sessions);
  const gaps = recent.length ? [] : [`The last PAT testing session was on ${ukDate(last)}, over 12 months ago.`];
  return section("pat", "Electrical safety (PAT)", gaps.length ? "attention" : "ok",
    `Last testing session ${ukDate(last)}; ${plural(recent.length, "session")} in the last 12 months.`,
    [["Appliances listed", String(assets)], ["Sessions in the last 12 months", String(recent.length)]], gaps);
}

export function emergencySection({ checks, now, available }) {
  if (!available.fire) return unavailable("emergency", "Emergency equipment (AED and emergency kit)");
  const from = periodStart(now);
  const mine = (checks || []).filter((c) => c.assetType === "aed" || c.assetType === "emergency_equipment").map((c) => ({ type: c.assetType, date: checkDate(c), fail: failed(c) })).filter((r) => within(r.date, from, now));
  if (!mine.length) return section("emergency", "Emergency equipment (AED and emergency kit)", "none", "No AED or emergency equipment checks recorded in the last 12 months.", [], ["No AED or emergency equipment checks recorded in the last 12 months."]);
  const gaps = [];
  const rows = [];
  for (const [type, label, limit] of [["aed", "AED", 10], ["emergency_equipment", "Emergency equipment", 35]]) {
    const own = mine.filter((r) => r.type === type);
    if (!own.length) continue;
    const last = latest(own.map((r) => r.date));
    rows.push([`${label}: checks / last`, `${own.length} / ${ukDate(last)}`]);
    if (daysAgo(last, now) > limit) gaps.push(`${label} was last checked ${plural(daysAgo(last, now), "day")} ago.`);
  }
  const fails = mine.filter((r) => r.fail).length;
  if (fails) gaps.push(`${plural(fails, "emergency equipment check")} failed in the last 12 months.`);
  return section("emergency", "Emergency equipment (AED and emergency kit)", gaps.length ? "attention" : "ok", `${plural(mine.length, "check")} in the last 12 months.`, rows, gaps);
}

export function cleaningSection({ cleaningLogs, now, available }) {
  if (!available.cleaning) return unavailable("cleaning", "Cleaning");
  const month = new Date(now.getTime() - 30 * DAY);
  const logs = (cleaningLogs || []).map((l) => ({ date: toDate(l.cleanedAt) || toDate(l.createdAt), room: l.roomId || l.roomName, issue: Boolean(l.issueReported) })).filter((l) => l.date);
  const recent = logs.filter((l) => within(l.date, month, now));
  if (!logs.length) return section("cleaning", "Cleaning", "none", "No cleaning records.", [], ["No cleaning records."]);
  const last = latest(logs.map((l) => l.date));
  const gaps = daysAgo(last, now) > 7 ? [`The last cleaning record was ${plural(daysAgo(last, now), "day")} ago.`] : [];
  return section("cleaning", "Cleaning", gaps.length ? "attention" : "ok",
    `${plural(recent.length, "room clean")} recorded in the last 30 days.`,
    [["Different rooms cleaned (30 days)", String(new Set(recent.map((l) => l.room)).size)], ["Last cleaning record", ukDate(last)], ["Issues reported by cleaners (30 days)", String(recent.filter((l) => l.issue).length)]], gaps);
}

// ---- cold chain and medicines ------------------------------------------------------------------------------
export function coldChainSection({ tempUnits, tempLogs, tempIncidents, now, available }) {
  if (!available.temperature) return unavailable("coldchain", "Fridges and the cold chain");
  const units = (tempUnits || []).filter((u) => u.active !== false);
  const logs = (tempLogs || []).filter((l) => l.dateKey);
  const incidents = tempIncidents || [];
  const open = incidents.filter((i) => i.status === "open");
  const year = incidents.filter((i) => within(toDate(i.openedAt) || toDate(i.createdAt), periodStart(now), now));
  if (!units.length && !logs.length) return section("coldchain", "Fridges and the cold chain", "none", "No fridges are set up in Primovex.", [], ["No fridges are set up in Primovex."]);
  const days = new Set(logs.map((l) => l.dateKey));
  const outOfRange = logs.filter((l) => l.outOfRange).length;
  const lastKey = [...days].sort().at(-1);
  const gaps = [];
  if (open.length) gaps.push(`${plural(open.length, "fridge incident")} still open.`);
  if (units.length && (!lastKey || daysAgo(new Date(`${lastKey}T12:00:00`), now) > 2)) gaps.push("No fridge temperature has been recorded in the last 2 days.");
  return section("coldchain", "Fridges and the cold chain", gaps.length ? "attention" : "ok",
    `${plural(units.length, "fridge/freezer", "fridges and freezers")} checked on ${plural(days.size, "day")} in the last 30 days.`,
    [["Readings in the last 30 days", String(logs.length)], ["Readings out of range", String(outOfRange)], ["Incidents in the last 12 months", String(year.length)], ["Incidents still open", String(open.length)]], gaps);
}

export function stockSection({ stockAlerts, stockCount, now, available }) {
  if (!available.stock) return unavailable("stock", "Medicines and stock");
  if (!stockCount) return section("stock", "Medicines and stock", "none", "No stock items on record.", [], ["No stock items on record."]);
  const count = (state) => (stockAlerts || []).filter((a) => a.state === state).length;
  const expired = count("expired");
  const gaps = [];
  if (expired) gaps.push(`${plural(expired, "stock item")} past its expiry date still on record. Remove or dispose of them and record it.`);
  return section("stock", "Medicines and stock", gaps.length ? "attention" : "ok",
    `${plural(stockCount, "stock item")} on record; ${expired} past expiry.`,
    [["Expired", String(expired)], ["Out of stock", String(count("out"))], ["Running low", String(count("low"))], ["Expiring soon", String(count("soon"))]], gaps);
}

export function coshhSection({ coshh, now, available }) {
  if (!available.coshh) return unavailable("coshh", "COSHH (hazardous substances)");
  const active = (coshh || []).filter((s) => s.active !== false);
  if (!active.length) return section("coshh", "COSHH (hazardous substances)", "none", "No substances in the COSHH register.", [], ["No substances in the COSHH register."]);
  const summary = reviewSummary(active, now);
  const noSheet = active.filter((s) => !s.sdsUrl).length;
  const gaps = [];
  if (summary.overdue) gaps.push(`${plural(summary.overdue, "COSHH review")} overdue.`);
  if (noSheet) gaps.push(`${plural(noSheet, "product")} without a safety data sheet attached.`);
  return section("coshh", "COSHH (hazardous substances)", gaps.length ? "attention" : "ok",
    `${plural(active.length, "product")} in the register; ${summary.overdue} overdue for review.`,
    [["Products with a safety data sheet", `${active.length - noSheet} of ${active.length}`], ["Reviews overdue", String(summary.overdue)], ["Reviews due in the next 30 days", String(summary.dueSoon)],
      ["In date", String(active.filter((s) => reviewStatus(s, now) === "ok").length)]], gaps);
}

// ---- governance: counts and dates only -------------------------------------------------------------------
export function governanceSection({ concerns, sars, events, now, available }) {
  const from = periodStart(now);
  const rows = [];
  const gaps = [];
  let anything = false;
  if (available.concerns) {
    const recent = (concerns || []).filter((c) => within(toDate(c.receivedAt) || toDate(c.createdAt), from, now));
    const open = (concerns || []).filter(concernOpen);
    const overdue = open.filter((c) => concernDeadline(c, now)?.overdue).length;
    rows.push(["Concerns and complaints received (12 months)", String(recent.length)], ["Concerns still open", String(open.length)]);
    if (overdue) gaps.push(`${plural(overdue, "concern")} past a response deadline.`);
    anything = true;
  }
  if (available.sars) {
    const recent = (sars || []).filter((s) => within(toDate(s.createdAt), from, now));
    const open = (sars || []).filter(sarOpen);
    const overdue = open.filter((s) => { const d = sarDays(s, now); return d !== null && d < 0; }).length;
    rows.push(["Subject access requests received (12 months)", String(recent.length)], ["SARs still open", String(open.length)]);
    if (overdue) gaps.push(`${plural(overdue, "SAR")} past the due date.`);
    anything = true;
  }
  if (available.events) {
    const recent = (events || []).filter((e) => within(toDate(e.createdAt) || toDate(e.eventDate), from, now));
    const closed = recent.filter((e) => e.status === "closed").length;
    rows.push(["Significant events reported (12 months)", String(recent.length)], ["...of which closed", String(closed)]);
    anything = true;
  }
  if (!anything) return unavailable("governance", "Governance (counts only)");
  return section("governance", "Governance (counts only)", gaps.length ? "attention" : "ok", "Counts of records only. No names or patient details are included in this summary.", rows, gaps);
}

// every section, in the order a visit sheet lists them
export function buildSections(data) {
  return {
    fire: fireSection(data), water: waterSection(data), pat: patSection(data), emergency: emergencySection(data), cleaning: cleaningSection(data),
    coldchain: coldChainSection(data), stock: stockSection(data), coshh: coshhSection(data), governance: governanceSection(data),
  };
}

export function allGaps(sections) {
  return sections.flatMap((s) => (s.gaps || []).map((text) => ({ section: s.title, text })));
}
