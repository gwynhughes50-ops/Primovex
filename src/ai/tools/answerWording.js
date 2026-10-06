// How the Orb phrases what it found: whole sentences, the headline first, the
// things that need doing named, and a suggested next question. Pure functions of
// plain data (no Firestore, no React), so the wording can be tested. Each returns
// { text, followUps } where followUps are short questions the Orb itself
// understands, offered as buttons under the answer.

export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const verb = (n, one, many) => (n === 1 ? one : many);

// "A", "A and B", "A, B and C", "A, B, C and 4 more".
export function joinList(items = [], max = 5) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length <= max) return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  const shown = list.slice(0, max);
  return `${shown.join(", ")} and ${list.length - max} more`;
}

// "today", "tomorrow", "in 5 days", "on 3 Nov" (dates further than a month away are named).
export function dayWords(days, isoDate) {
  if (days === null || days === undefined) return "";
  if (days < 0) return days === -1 ? "yesterday" : `${Math.abs(days)} days ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 31) return `in ${days} days`;
  const [y, m, d] = String(isoDate || "").split("-").map(Number);
  if (!y || !m || !d) return `in ${days} days`;
  return `on ${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}

const lines = (...parts) => parts.filter(Boolean).join("\n");
const ask = (...questions) => questions.filter(Boolean);

// ---- stock -------------------------------------------------------------------------

// out, low, expired, soon: arrays of { label, current, min, days, expiry }
export function stockOverview({ total, units, out = [], low = [], expired = [], soon = [], windowDays = 30 }) {
  if (!total) return { text: "There's no stock recorded yet.", followUps: [] };
  const problems = out.length + low.length + expired.length + soon.length;
  const bits = [];
  if (out.length) bits.push(`${plural(out.length, "item")} ${verb(out.length, "is", "are")} out of stock`);
  if (low.length) bits.push(`${low.length} ${verb(low.length, "is", "are")} running low`);
  if (expired.length) bits.push(`${expired.length} ${verb(expired.length, "has", "have")} expired`);
  if (soon.length) bits.push(`${soon.length} ${verb(soon.length, "is", "are")} close to expiry`);
  return {
    text: lines(
      `You have ${plural(total, "stock item")}, ${plural(units, "unit")} in all.`,
      problems ? `Needs attention: ${joinList(bits, 4)}.` : `Nothing needs attention right now: no items are out, low or close to expiry.`,
      out.length ? `Out of stock: ${joinList(out.map((i) => i.label), 4)}.` : "",
      expired.length ? `Expired: ${joinList(expired.map((i) => i.label), 4)}.` : ""
    ),
    followUps: ask(out.length || low.length ? "low stock" : "", expired.length || soon.length ? "expiry dates" : ""),
  };
}

export function lowStockAnswer({ out = [], low = [] }) {
  if (!out.length && !low.length) return { text: "Good news: nothing is out of stock or running low.", followUps: ask("expiry dates") };
  const show = (list) => joinList(list.map((i) => `${i.label} (${i.current} left, minimum ${i.min})`), 6);
  return {
    text: lines(
      out.length ? `${plural(out.length, "item")} ${verb(out.length, "has", "have")} run out: ${joinList(out.map((i) => i.label), 8)}.` : "",
      low.length ? `${plural(low.length, "item")} ${verb(low.length, "is", "are")} running low: ${show(low)}.` : "",
      "These probably need ordering."
    ),
    followUps: ask("expiry dates"),
  };
}

export function expiryAnswer({ expired = [], soon = [], windowDays = 30, explicitDays = false, next = null }) {
  const when = explicitDays ? `within ${windowDays} days` : "soon";
  const named = (list) => joinList(list.map((i) => `${i.label} (${dayWords(i.days, i.expiry)})`), 6);
  if (!expired.length && !soon.length) {
    return {
      text: lines(
        explicitDays ? `Nothing expires within ${windowDays} days.` : "Nothing has expired and nothing is close to its expiry date.",
        next ? `The next one to expire is ${next.label}, ${dayWords(next.days, next.expiry)}.` : ""
      ),
      followUps: ask("low stock"),
    };
  }
  return {
    text: lines(
      expired.length ? `${plural(expired.length, "item")} ${verb(expired.length, "has", "have")} already expired and should come out of use: ${named(expired)}.` : "",
      soon.length ? `${plural(soon.length, "item")} ${verb(soon.length, "expires", "expire")} ${when}: ${named(soon)}.` : ""
    ),
    followUps: ask("low stock"),
  };
}

export function stockSearchAnswer({ term, matches = [] }) {
  if (!matches.length) return { text: `I couldn't find any stock matching “${term}”. Try a different name, or part of it.`, followUps: [] };
  const describe = (i) => `${i.label}: ${i.current} in stock${i.status === "out" ? " (out of stock)" : i.status === "low" ? ` (low, minimum ${i.min})` : ""}${i.expiry ? `, expires ${dayWords(i.days, i.expiry)}` : ""}`;
  if (matches.length === 1) return { text: `${describe(matches[0])}.`, followUps: ask("low stock") };
  return {
    text: lines(`I found ${plural(matches.length, "item")} matching “${term}”:`, ...matches.slice(0, 8).map((i) => `• ${describe(i)}`), matches.length > 8 ? `…and ${matches.length - 8} more.` : ""),
    followUps: [],
  };
}

export function categoryAnswer({ label, total, units, out = [], low = [], expired = [], soon = [], windowDays = 30, names = [] }) {
  if (!total) return { text: `There's no active stock under ${label}.`, followUps: [] };
  const bits = [];
  if (out.length) bits.push(`${out.length} out of stock`);
  if (low.length) bits.push(`${low.length} running low`);
  if (expired.length) bits.push(`${expired.length} expired`);
  if (soon.length) bits.push(`${soon.length} close to expiry`);
  return {
    text: lines(
      `${label}: ${plural(total, "item")}, ${plural(units, "unit")} in all.`,
      bits.length ? `Of those, ${joinList(bits, 4)}.` : "All of them are in stock and in date.",
      names.length ? `They are ${joinList(names, 8)}.` : ""
    ),
    followUps: ask(out.length || low.length ? "low stock" : "", expired.length || soon.length ? "expiry dates" : ""),
  };
}

// ---- rooms and equipment -------------------------------------------------------------

export function cleaningAnswer({ overdue = [], total = 0 }) {
  if (!total) return { text: "No rooms are registered yet.", followUps: [] };
  if (!overdue.length) return { text: `Every room (${total}) has been cleaned today.`, followUps: ask("maintenance") };
  const left = overdue.length === total ? "None of the rooms have been marked as cleaned today yet." : `${overdue.length} of ${total} rooms haven't been marked as cleaned today.`;
  return { text: lines(left, `Still to do: ${joinList(overdue, 8)}.`), followUps: ask("maintenance") };
}

export function maintenanceAnswer(titles = []) {
  if (!titles.length) return { text: "There are no open maintenance issues.", followUps: ask("cleaning status") };
  return { text: lines(`${plural(titles.length, "maintenance issue")} ${verb(titles.length, "is", "are")} open:`, ...titles.slice(0, 10).map((t) => `• ${t}`), titles.length > 10 ? `…and ${titles.length - 10} more.` : ""), followUps: ask("cleaning status") };
}

// ---- fridges and freezers --------------------------------------------------------------

const stale = (minutes) => minutes !== null && minutes !== undefined && minutes > 30;
const ago = (minutes) => (minutes === null || minutes === undefined ? "at an unknown time" : minutes < 2 ? "just now" : minutes < 60 ? `${minutes} minutes ago` : minutes < 1440 ? `${Math.round(minutes / 60)} hours ago` : `${Math.round(minutes / 1440)} days ago`);

// units: [{ name, value, min, max, ageMinutes }]
export function coldChainOverview({ units = [] }) {
  if (!units.length) return { text: "I can't see any fridge or freezer readings yet.", followUps: [] };
  const state = (u) => {
    if (!Number.isFinite(u.value)) return "unknown";
    return u.value < u.min || u.value > u.max ? "out" : "ok";
  };
  const out = units.filter((u) => state(u) === "out");
  const old = units.filter((u) => state(u) === "ok" && stale(u.ageMinutes));
  const okCount = units.filter((u) => state(u) === "ok").length;
  if (!out.length && !old.length) {
    return { text: `All ${plural(units.length, "fridge and freezer")} ${verb(units.length, "is", "are")} in range. The most recent reading was ${ago(Math.min(...units.map((u) => u.ageMinutes ?? Infinity)))}.`, followUps: ask("active alerts") };
  }
  return {
    text: lines(
      out.length ? `${out.length} of ${units.length} units ${verb(out.length, "is", "are")} out of range: ${joinList(out.map((u) => `${u.name} at ${u.value}°C (should be ${u.min} to ${u.max}°C)`), 4)}.` : `${okCount} of ${units.length} units ${verb(okCount, "was", "were")} in range at their last reading.`,
      old.length ? `${joinList(old.map((u) => u.name), 4)} ${verb(old.length, "hasn't", "haven't")} reported for over 30 minutes, so it's worth checking by eye.` : "",
      out.length ? "Check the fridge and the stock inside it, and follow your cold chain procedure." : ""
    ),
    followUps: ask("active alerts"),
  };
}

export function coldChainUnitAnswer({ name, value, min, max, ageMinutes }) {
  if (!Number.isFinite(value)) return { text: `${name} is registered, but there's no recent reading, so I can't say whether it's in range.`, followUps: ask("all fridges") };
  const within = value >= min && value <= max;
  const old = stale(ageMinutes);
  return {
    text: lines(
      within ? `${name} is at ${value}°C, within its ${min} to ${max}°C range (reading ${ago(ageMinutes)}).` : `${name} is at ${value}°C, outside its ${min} to ${max}°C range (reading ${ago(ageMinutes)}).`,
      old ? "That reading is a while old, so it's worth checking the fridge in person." : "",
      !within ? "Check the fridge and the stock inside it, and follow your cold chain procedure." : ""
    ),
    followUps: ask("all fridges"),
  };
}

// ---- alerts, tasks, notes ------------------------------------------------------------------

export function alertsAnswer({ stock = { out: 0, low: 0, expired: 0, soon: 0 }, device = 0, unavailable = 0 }) {
  const bits = [];
  if (stock.out) bits.push(`${stock.out} ${verb(stock.out, "item", "items")} out of stock`);
  if (stock.low) bits.push(`${stock.low} running low`);
  if (stock.expired) bits.push(`${stock.expired} expired`);
  if (stock.soon) bits.push(`${stock.soon} close to expiry`);
  if (device) bits.push(`${plural(device, "device alert")}`);
  if (!bits.length) {
    return { text: unavailable ? "I didn't find any active alerts, but some alert sources couldn't be read, so I can't promise there are none." : "There are no active alerts right now.", followUps: ask("what needs attention") };
  }
  return { text: lines(`Active alerts: ${joinList(bits, 5)}.`, unavailable ? "Some alert sources couldn't be read, so this may not be everything." : ""), followUps: ask(stock.out || stock.low ? "low stock" : "", stock.expired || stock.soon ? "expiry dates" : "", device ? "all fridges" : "") };
}

export function tasksAnswer({ titles = [], total = 0, high = 0 }) {
  if (!total) return { text: "There are no open tasks.", followUps: ask("active alerts") };
  return {
    text: lines(`${plural(total, "open task")}${high ? `, ${high} of them high priority` : ""}:`, ...titles.slice(0, 6).map((t) => `• ${t}`), total > 6 ? `…and ${total - 6} more.` : ""),
    followUps: ask("active alerts"),
  };
}

export function quickNotesAnswer({ notes = [], overdue = 0 }) {
  if (!notes.length) return { text: "You have no open quick notes.", followUps: [] };
  return { text: lines(`You have ${plural(notes.length, "open quick note")}${overdue ? `, ${overdue} overdue` : ""}:`, ...notes.slice(0, 6).map((t) => `• ${t}`), notes.length > 6 ? `…and ${notes.length - 6} more.` : ""), followUps: [] };
}

// ---- the practice as a whole ------------------------------------------------------------------

export function operationsAnswer({ readiness, priorities = [] }) {
  const head = readiness === null || readiness === undefined ? "I don't have enough connected information to score the practice's readiness yet." : `The practice is ${readiness}% ready.`;
  return {
    text: lines(head, priorities.length ? `What needs attention: ${joinList(priorities.slice(0, 5), 5)}.` : "Nothing needs attention right now."),
    followUps: ask("active alerts", "cleaning status", "all fridges"),
  };
}

export function timelineAnswer({ titles = [] }) {
  if (!titles.length) return { text: "Nothing has been recorded in that time.", followUps: [] };
  return { text: lines(`${plural(titles.length, "thing")} happened:`, ...titles.slice(0, 8).map((t) => `• ${t}`), titles.length > 8 ? `…and ${titles.length - 8} more.` : ""), followUps: ask("what needs attention") };
}

export function spacesAnswer({ total = 0, attention = [] }) {
  if (!total) return { text: "No rooms or spaces are registered yet.", followUps: [] };
  return { text: attention.length ? lines(`${plural(total, "space")} ${verb(total, "is", "are")} registered. ${attention.length} ${verb(attention.length, "needs", "need")} a look: ${joinList(attention, 6)}.`) : `${plural(total, "space")} ${verb(total, "is", "are")} registered and none needs attention.`, followUps: ask("cleaning status") };
}

export function complianceAnswer({ assets = 0, checks = 0, failed = 0, incomplete = false, known = true }) {
  if (!known) return { text: "I can't see any compliance records, so I can't say whether the practice is compliant.", followUps: [] };
  return {
    text: lines(`${plural(assets, "compliance asset")} ${verb(assets, "is", "are")} registered, with ${plural(checks, "recorded check")}.`, failed ? `${plural(failed, "check")} ${verb(failed, "needs", "need")} review.` : "No failed checks are recorded.", incomplete ? "Some compliance sources couldn't be read, so this isn't a complete picture." : ""),
    followUps: [],
  };
}

export function usersAnswer({ total = 0, byRole = {} }) {
  const roles = Object.entries(byRole).sort((a, b) => b[1] - a[1]).map(([role, n]) => `${n} ${role}`);
  return { text: `${plural(total, "account")} ${verb(total, "is", "are")} registered: ${joinList(roles, 6)}.`, followUps: [] };
}

