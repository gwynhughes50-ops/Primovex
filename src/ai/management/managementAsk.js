// Management questions for the Orb: when a check was last done, water temperatures, when someone last
// signed in, what a person has outstanding, and where SARs and concerns are up to. Everything here is
// pure (no React, no Firestore): the lookups in readOnlyTools.js read the records and hand them in.
//
// Privacy: these answers name staff and reference numbers, never patients, and none of them is offered
// to the language assistant (see scripts/verify-orb-catalog.mjs NEVER_SENT).

const DAY = 86400000;

// ---- dates ---------------------------------------------------------------------------------------

export function asDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const startOfDay = (date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
export const daysBetween = (later, earlier) => Math.round((startOfDay(later) - startOfDay(earlier)) / DAY);

export function dayLabel(date, now = new Date()) {
  const options = { weekday: "long", day: "numeric", month: "long" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return date.toLocaleDateString("en-GB", options);
}
const shortDay = (date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const timeLabel = (date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function agoLabel(date, now = new Date()) {
  const days = daysBetween(now, date);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cap = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

// ---- who: names and pronouns --------------------------------------------------------------------

const PRONOUNS = new Set(["he", "she", "they", "him", "her", "them", "his", "hers", "their"]);
const NOT_NAMES = new Set([
  "a", "an", "the", "i", "we", "you", "me", "my", "our", "us", "it", "is", "are", "was", "were", "be", "been", "do", "does", "did", "have", "has", "had",
  "when", "what", "whats", "where", "who", "how", "many", "much", "last", "latest", "recent", "recently", "ever", "again", "still", "currently", "now", "today",
  "sar", "sars", "subject", "access", "request", "requests", "concern", "concerns", "complaint", "complaints", "outstanding", "open", "overdue", "due", "assigned",
  "log", "logged", "login", "logins", "logon", "sign", "signed", "signin", "seen", "active", "online", "in", "on", "into", "to", "of", "for", "with", "at", "by",
  "primovex", "app", "system", "orb", "please", "can", "could", "tell", "show", "give", "got", "any", "all", "up", "left", "still", "yet", "anything", "this", "that",
  "week", "month", "year", "which", "got", "get", "gets", "and", "or", "not", "no", "yes", "tap", "water", "fire", "alarm",
]);

const tokensOf = (text) => String(text || "").toLowerCase().replace(/[’‘]/g, "'").replace(/'s\b/g, "").replace(/[^a-z'\s-]/g, " ").split(/\s+/).filter(Boolean);

// The name in a question: whatever is left once the question words are taken away.
export function nameFromQuestion(text) {
  const tokens = tokensOf(text).filter((word) => !NOT_NAMES.has(word));
  const name = tokens.filter((word) => !PRONOUNS.has(word));
  return { name: name.slice(0, 2).join(" "), pronoun: !name.length && tokens.some((word) => PRONOUNS.has(word)) };
}

// "he", "she" and "they" mean the last person mentioned earlier in the conversation.
export function lastPersonMentioned(conversation = []) {
  const earlier = [...(Array.isArray(conversation) ? conversation : [])].reverse().filter((message) => message?.role === "user");
  for (const message of earlier) {
    const asked = parseManagementQuestion(String(message.content || ""), []);
    if (asked?.input?.person) return asked.input.person;
    if (asked?.input?.name) return asked.input.name;
  }
  return "";
}

// ---- reading the question ------------------------------------------------------------------------

const hasCaseId = (text) => /\b(?:cn|sar)-\d{4}-\d+\b/i.test(text) || /\b\d{5,}\b/.test(text);

// kinds of check: the asset types in compliance_checks that count towards each
export const CHECK_KINDS = {
  fire_alarm: { label: "fire alarm test", types: ["fire_point"], legacy: "fire_weekly_checks" },
  fire_door: { label: "fire door check", types: ["fire_door"] },
  defibrillator: { label: "defibrillator check", types: ["aed"] },
  emergency_equipment: { label: "emergency equipment check", types: ["emergency_equipment"] },
  water: { label: "water temperature check", types: ["water_hot", "water_cold"], legacy: "water_temp_rounds" },
};

function checkKindOf(text) {
  if (/\b(?:fire\s*(?:alarm|point|call\s*point|test|drill|bell)s?|call\s*points?|alarm\s*test)\b/.test(text)) return "fire_alarm";
  if (/\bfire\s*doors?\b/.test(text)) return "fire_door";
  if (/\b(?:aed|defib|defibrillator)s?\b/.test(text)) return "defibrillator";
  if (/\bemergency\s*equipment\b/.test(text)) return "emergency_equipment";
  if (/\b(?:water|legionella|tap|taps|outlets?)\b/.test(text)) return "water";
  return null;
}

function daysFromQuestion(text, fallback = 30) {
  if (/\b(?:today)\b/.test(text)) return 1;
  if (/\b(?:this|past|last)\s+week\b|\bseven days\b|\b7 days\b/.test(text)) return 7;
  if (/\bfortnight\b/.test(text)) return 14;
  const months = text.match(/\b(?:last|past|previous)\s+(\d+|two|three|four|six)\s+months?\b/);
  if (months) { const n = { two: 2, three: 3, four: 4, six: 6 }[months[1]] || Number(months[1]); return Math.min(365, n * 30); }
  if (/\b(?:last|past|this)\s+(?:month|30 days|four weeks|4 weeks)\b/.test(text)) return 30;
  if (/\b(?:this|last|past)\s+year\b/.test(text)) return 365;
  return fallback;
}

// null when it isn't a management question. Otherwise { toolId, input }.
export function parseManagementQuestion(prompt, conversation = []) {
  const text = String(prompt || "").toLowerCase().replace(/[’‘]/g, "'").trim();
  if (!text) return null;

  // when did <someone> last sign in?
  const loginWord = /\b(?:log(?:ged|ging)?\s*(?:in|on)|sign(?:ed|ing)?\s*(?:in|on)|logins?|logons?|last\s+seen|last\s+(?:been\s+)?(?:active|online)|been\s+(?:in|online|on)\s+(?:primovex|the\s+app|the\s+system))\b/.test(text);
  if (loginWord && /\b(?:when|last|latest|recently|has|did|was|since)\b/.test(text) && !/\b(?:how\s+(?:do|to|can)|reset|forgot|password|pin)\b/.test(text)) {
    let { name, pronoun } = nameFromQuestion(text);
    if (!name && pronoun) name = lastPersonMentioned(conversation);
    return { toolId: "security.lastLogin", input: { name } };
  }

  // which fridges have been checked today
  if (/\b(?:fridges?|freezers?)\b/.test(text) && /\b(?:checked|check|checks|logged|recorded|readings?)\b/.test(text) && /\b(?:today|yet|this morning|so far|missed|outstanding|not been)\b/.test(text)) {
    return { toolId: "coldChain.checksToday", input: {} };
  }

  // water temperatures
  if (/\b(?:water|tap|taps|legionella|hot\s+tap|cold\s+tap|outlets?)\b/.test(text) && /\b(?:temp|temps|temperatures?|degrees|readings?|legionella|results?)\b/.test(text)) {
    return { toolId: "compliance.waterTemps", input: { days: daysFromQuestion(text, 30) } };
  }

  // when was the last <check> done?
  const kind = checkKindOf(text);
  if (kind && /\b(?:when|last|latest|most\s+recent|previous|overdue|due)\b/.test(text) && /\b(?:done|tested|test|checked|check|carried|completed|run|rung|did|happened|due|overdue|was|were)\b/.test(text)) {
    return { toolId: "compliance.lastCheck", input: { kind } };
  }

  // SARs
  if ((/\bsars?\b/.test(text) || /subject access/.test(text)) && !hasCaseId(text)) {
    let { name, pronoun } = nameFromQuestion(text.replace(/\bsars?\b/g, " "));
    if (!name && pronoun) name = lastPersonMentioned(conversation);
    return { toolId: "governance.sarOverview", input: { person: name } };
  }

  // concerns: where are we up to
  if (/\b(?:concerns?|complaints?|listening to people)\b/.test(text) && !hasCaseId(text)
    && /\b(?:where|up\s+to|status|how\s+many|outstanding|open|overdue|progress|update|summary|overview|any|all|current|ongoing|live)\b/.test(text)) {
    return { toolId: "governance.concernsOverview", input: {} };
  }

  return null;
}

// ---- when was the last check -----------------------------------------------------------------------

const FREQUENCY_DAYS = { daily: 1, weekly: 7, monthly: 30, quarterly: 91, annually: 365 };
const KIND_DEFAULT_FREQUENCY = { fire_alarm: "weekly", fire_door: "weekly", defibrillator: "weekly", emergency_equipment: "monthly", water: "monthly" };

const checkTime = (check) => asDate(check.performedAt) || asDate(check.createdAt);

export function lastCheckAnswer({ kind, checks = [], assets = [], legacy = [], now = new Date() }) {
  const info = CHECK_KINDS[kind];
  if (!info) return { text: "I'm not sure which check you mean. I can tell you about the fire alarm, fire doors, defibrillator, emergency equipment and water temperatures." };
  const mine = checks.filter((check) => info.types.includes(check.assetType)).map((check) => ({ check, at: checkTime(check) })).filter((row) => row.at).sort((a, b) => b.at - a.at);
  const legacyRows = legacy.map((row) => ({ legacy: row, at: asDate(row.performedAt) || asDate(row.createdAt) || asDate(row.date) })).filter((row) => row.at).sort((a, b) => b.at - a.at);
  const assetStamps = assets.filter((asset) => info.types.includes(asset.assetType) && asset.active !== false).map((asset) => ({ asset, at: asDate(asset.lastCheckAt) })).filter((row) => row.at).sort((a, b) => b.at - a.at);
  const best = [mine[0], assetStamps[0], legacyRows[0]].filter(Boolean).sort((a, b) => b.at - a.at)[0];
  if (!best) return { text: `I can't find any ${info.label}s recorded yet.`, found: false };

  const who = best.check?.actor?.displayName || best.asset?.lastCheckedByName || best.legacy?.actor?.displayName || best.legacy?.createdByName || "";
  const what = best.check ? best.check.assetLabel || best.check.assetCode : best.asset ? best.asset.label || best.asset.assetCode : "";
  const where = best.check?.location || best.asset?.location || "";
  const result = best.check?.result || best.asset?.lastCheckResult || "";
  const failed = result === "fail";

  const frequency = (best.check && assets.find((a) => a.id === best.check.assetId)?.frequency) || KIND_DEFAULT_FREQUENCY[kind];
  // Fire points and outlets are tested in rotation, so "due" is measured from the latest test of any of them.
  const everyDays = FREQUENCY_DAYS[frequency] || FREQUENCY_DAYS[KIND_DEFAULT_FREQUENCY[kind]];
  const dueOn = new Date(best.at.getTime() + everyDays * DAY);
  const overdue = daysBetween(now, dueOn);

  const parts = [`The last ${info.label} was ${dayLabel(best.at, now)} (${agoLabel(best.at, now)})${what ? `: ${what}${where && !String(what).includes(where) ? `, ${where}` : ""}` : ""}${failed ? ", and it failed" : result === "pass" ? ", and it passed" : ""}${who ? `, done by ${who}` : ""}.`];
  if (kind === "water") {
    const recent = mine.filter((row) => daysBetween(now, row.at) <= 30).length;
    if (recent) parts.push(`${plural(recent, "outlet reading")} in the last 30 days.`);
  }
  parts.push(overdue > 0
    ? `The next one was due ${plural(overdue, "day")} ago, so it is overdue.`
    : overdue === 0 ? "The next one is due today." : `The next one is due by ${dayLabel(dueOn, now)}.`);
  return { text: parts.join(" "), found: true, overdue: overdue > 0, failed, lastAt: best.at };
}

// ---- water temperatures ---------------------------------------------------------------------------------

const rangeLabel = (min, max) => {
  if (min != null && max != null && Number(min) > 0) return `${min}–${max}°C`;
  if (max != null) return `under ${max}°C`;
  if (min != null) return `over ${min}°C`;
  return "";
};

export function waterTempsAnswer({ checks = [], assets = [], days = 30, now = new Date() }) {
  const since = now.getTime() - days * DAY;
  const readings = checks
    .filter((check) => ["water_hot", "water_cold"].includes(check.assetType) && Number.isFinite(Number(check.tempC)))
    .map((check) => ({ ...check, at: checkTime(check), temp: Number(check.tempC) }))
    .filter((check) => check.at && check.at.getTime() >= since)
    .sort((a, b) => b.at - a.at);
  const window = days === 1 ? "today" : days === 7 ? "in the last week" : days === 30 ? "in the last month" : days === 14 ? "in the last fortnight" : `in the last ${plural(days, "day")}`;
  const outlets = assets.filter((asset) => ["water_hot", "water_cold"].includes(asset.assetType) && asset.active !== false);
  if (!readings.length) {
    return { text: outlets.length ? `There are no water temperature readings ${window}. ${plural(outlets.length, "outlet")} ${outlets.length === 1 ? "is" : "are"} set up to be checked.` : "I can't find any water outlets or readings set up yet.", found: false };
  }
  const latest = new Map();
  readings.forEach((reading) => { if (!latest.has(reading.assetId)) latest.set(reading.assetId, reading); });
  const rows = [...latest.values()].sort((a, b) => String(a.assetLabel).localeCompare(String(b.assetLabel), undefined, { numeric: true }));
  const hot = readings.filter((r) => r.assetType === "water_hot");
  const cold = readings.filter((r) => r.assetType === "water_cold");
  const spread = (list) => { const t = list.map((r) => r.temp); return `${Math.min(...t).toFixed(1)}–${Math.max(...t).toFixed(1)}°C`; };
  const outOfRange = readings.filter((r) => r.result === "fail" || (r.maxTempC != null && r.temp > Number(r.maxTempC)) || (r.minTempC != null && r.temp < Number(r.minTempC)));
  const checkedIds = new Set(readings.map((r) => r.assetId));
  const missed = outlets.filter((asset) => !checkedIds.has(asset.id));

  const lines = [`Water temperatures ${window}: ${plural(readings.length, "reading")} across ${plural(latest.size, "outlet")}.`];
  if (hot.length) lines.push(`Hot: ${spread(hot)}${rangeLabel(hot[0].minTempC, hot[0].maxTempC) ? ` (should be ${rangeLabel(hot[0].minTempC, hot[0].maxTempC)})` : ""}.`);
  if (cold.length) lines.push(`Cold: ${spread(cold)}${rangeLabel(cold[0].minTempC, cold[0].maxTempC) ? ` (should be ${rangeLabel(cold[0].minTempC, cold[0].maxTempC)})` : ""}.`);
  lines.push(outOfRange.length
    ? `Outside the safe range: ${outOfRange.slice(0, 5).map((r) => `${r.assetLabel} ${r.temp.toFixed(1)}°C on ${shortDay(r.at)}`).join("; ")}${outOfRange.length > 5 ? ` and ${outOfRange.length - 5} more` : ""}.`
    : "Every reading was inside the safe range.");
  if (missed.length) lines.push(`Not checked ${window}: ${missed.slice(0, 6).map((a) => a.label || a.assetCode).join(", ")}${missed.length > 6 ? ` and ${missed.length - 6} more` : ""}.`);
  lines.push("Latest at each outlet:", ...rows.slice(0, 12).map((r) => `• ${r.assetLabel}: ${r.temp.toFixed(1)}°C (${shortDay(r.at)})`));
  if (rows.length > 12) lines.push(`…and ${rows.length - 12} more outlets.`);
  return { text: lines.join("\n"), found: true, outOfRange: outOfRange.length, missed: missed.length, readings: readings.length };
}

// ---- when did someone last sign in -----------------------------------------------------------------------

const clientLabel = (session) => {
  const bits = [];
  const platform = String(session.platform || session.client || "").toLowerCase();
  if (/android|mobile|phone/.test(platform)) bits.push("on the phone app");
  else if (/desktop|windows|tauri|electron/.test(platform)) bits.push("on the desktop app");
  else if (platform) bits.push(`on ${session.platform || session.client}`);
  return bits.join(" ");
};

// people: [{ uid, name, role, lastSignIn, lastSeen, sessionCount, sessions: [...] }] from usageReport.summariseUsers
export function lastLoginAnswer({ name = "", people = [], days = 90, now = new Date() }) {
  const wanted = tokensOf(name);
  if (!wanted.length) return { text: "Whose sign-in do you want to know about? Ask me something like “when did Craig last log in?”.", found: false };
  const matches = people.filter((person) => {
    const words = tokensOf(person.name);
    return wanted.every((w) => words.some((word) => word.startsWith(w)));
  });
  if (!matches.length) return { text: `I can't find a sign-in for “${name}” in the last ${days} days. They may not have used Primovex in that time, or the name is spelt differently on their account.`, found: false };
  if (matches.length > 1) {
    return { text: `More than one person matches “${name}”: ${matches.slice(0, 5).map((p) => p.name).join(", ")}. Which one do you mean?`, found: false, ambiguous: true, choices: matches.slice(0, 4).map((p) => p.name) };
  }
  const person = matches[0];
  const latest = person.sessions?.[0];
  const signedIn = asDate(person.lastSignIn);
  const seen = asDate(person.lastSeen);
  const active = latest?.status === "active";
  const parts = [`${person.name} last signed in on ${dayLabel(signedIn, now)} at ${timeLabel(signedIn)} (${agoLabel(signedIn, now)})${latest ? ` ${clientLabel(latest)}`.trimEnd() : ""}.`];
  if (active) parts.push("They are in Primovex right now.");
  else if (seen && seen - signedIn > 5 * 60000) parts.push(`They were last active at ${timeLabel(seen)}${daysBetween(seen, signedIn) ? ` on ${shortDay(seen)}` : ""}.`);
  if (person.sessionCount > 1) parts.push(`${plural(person.sessionCount, "session")} in the last ${days} days.`);
  return { text: parts.join(" "), found: true, person: person.name };
}

// ---- SARs ----------------------------------------------------------------------------------------------

const SAR_LABELS = { new: "New", assigned: "Assigned", in_progress: "In progress", quality_check: "Quality check", completed: "Completed", archived: "Archived" };
export const sarOpen = (sar) => !["completed", "archived"].includes(sar.status || "new");
export const sarDays = (sar, now) => { const due = asDate(sar.dueDate || sar.due_date); return due ? daysBetween(due, now) : null; };
const sarWhen = (days) => (days === null ? "no due date" : days < 0 ? `overdue by ${plural(Math.abs(days), "day")}` : days === 0 ? "due today" : `${plural(days, "day")} left`);

export function sarOverviewAnswer({ person = "", sars = [], now = new Date() }) {
  const open = sars.filter(sarOpen).map((sar) => ({ sar, days: sarDays(sar, now) }));
  const byDue = (a, b) => (a.days ?? 9999) - (b.days ?? 9999);
  const line = ({ sar, days }) => `• ${sar.reference || "SAR"}: ${SAR_LABELS[sar.status] || sar.status || "New"}, ${sarWhen(days)}${sar.urgent ? ", urgent" : ""}${person ? "" : sar.assignedToName ? `, with ${sar.assignedToName}` : ", not assigned"}`;

  if (person) {
    const wanted = tokensOf(person);
    const mine = open.filter(({ sar }) => { const words = tokensOf(sar.assignedToName); return wanted.length && wanted.every((w) => words.some((word) => word.startsWith(w))); }).sort(byDue);
    const known = sars.some((sar) => { const words = tokensOf(sar.assignedToName); return wanted.every((w) => words.some((word) => word.startsWith(w))); });
    if (!mine.length) {
      return { text: known ? `${cap(person)} has no outstanding SARs.` : `I can't find any SARs assigned to “${person}”, so none are outstanding for them. If they go by another name on the register, try that.`, count: 0 };
    }
    const overdue = mine.filter((row) => row.days !== null && row.days < 0).length;
    const name = mine[0].sar.assignedToName;
    return {
      text: [`${name} has ${plural(mine.length, "outstanding SAR")}${overdue ? `, ${overdue} of them overdue` : ""}.`, ...mine.slice(0, 8).map(line), ...(mine.length > 8 ? [`…and ${mine.length - 8} more.`] : [])].join("\n"),
      count: mine.length, overdue,
    };
  }

  if (!open.length) return { text: "There are no outstanding SARs.", count: 0 };
  const overdue = open.filter((row) => row.days !== null && row.days < 0);
  const soon = open.filter((row) => row.days !== null && row.days >= 0 && row.days <= 7);
  const unassigned = open.filter(({ sar }) => !sar.assignedToName && !sar.assignedToUid);
  const byStatus = {};
  open.forEach(({ sar }) => { const label = SAR_LABELS[sar.status] || sar.status || "New"; byStatus[label] = (byStatus[label] || 0) + 1; });
  const byPerson = {};
  open.forEach(({ sar }) => { const who = sar.assignedToName || "Not assigned"; byPerson[who] = (byPerson[who] || 0) + 1; });
  const lines = [
    `${plural(open.length, "SAR")} outstanding: ${Object.entries(byStatus).map(([label, n]) => `${n} ${label.toLowerCase()}`).join(", ")}.`,
    overdue.length ? `${overdue.length} overdue${soon.length ? `, ${soon.length} more due within a week` : ""}.` : soon.length ? `None overdue; ${soon.length} due within a week.` : "None overdue or due within a week.",
    `By person: ${Object.entries(byPerson).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([who, n]) => `${who} ${n}`).join(", ")}.`,
  ];
  if (unassigned.length) lines.push(`${plural(unassigned.length, "SAR")} not assigned to anyone.`);
  const urgent = [...open].sort(byDue).slice(0, 4);
  lines.push("Closest to the deadline:", ...urgent.map(line));
  return { text: lines.join("\n"), count: open.length, overdue: overdue.length };
}

// ---- concerns ------------------------------------------------------------------------------------------

const CONCERN_STAGE_LABELS = { received: "received", acknowledged: "acknowledged", listening: "listening discussion", early_resolution: "early resolution", investigation: "being investigated", response: "response being written", learning: "learning", closed: "closed", archived: "archived" };
export const concernOpen = (concern) => !["closed", "archived"].includes(concern.status || "received");

export function concernDeadline(concern, now) {
  const final = asDate(concern.finalResponseDueAt);
  const ack = asDate(concern.acknowledgementDueAt);
  if (!concern.acknowledgedAt && ack && concern.status === "received") {
    const d = daysBetween(ack, now);
    if (d < 0) return { days: d, label: `acknowledgement overdue by ${plural(Math.abs(d), "day")}`, overdue: true };
  }
  if (!final) return { days: null, label: "no final response date", overdue: false };
  const d = daysBetween(final, now);
  return { days: d, label: d < 0 ? `final response overdue by ${plural(Math.abs(d), "day")}` : d === 0 ? "final response due today" : `final response in ${plural(d, "day")}`, overdue: d < 0 };
}

export function concernsOverviewAnswer({ concerns = [], now = new Date() }) {
  const open = concerns.filter(concernOpen).map((concern) => ({ concern, deadline: concernDeadline(concern, now) }));
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const closedThisYear = concerns.filter((c) => !concernOpen(c) && (asDate(c.closedAt) || asDate(c.updatedAt) || yearStart) >= yearStart).length;
  if (!open.length) return { text: `There are no open concerns.${closedThisYear ? ` ${closedThisYear} closed so far this year.` : ""}`, count: 0 };
  const byStage = {};
  open.forEach(({ concern }) => { const label = CONCERN_STAGE_LABELS[concern.status] || concern.status; byStage[label] = (byStage[label] || 0) + 1; });
  const overdue = open.filter((row) => row.deadline.overdue);
  const soon = open.filter((row) => !row.deadline.overdue && row.deadline.days !== null && row.deadline.days <= 5);
  const unacknowledged = open.filter(({ concern }) => !concern.acknowledgedAt);
  const lines = [
    `${plural(open.length, "open concern")}: ${Object.entries(byStage).map(([label, n]) => `${n} ${label}`).join(", ")}.`,
    overdue.length ? `${overdue.length} ${overdue.length === 1 ? "is" : "are"} overdue.` : "None are overdue.",
  ];
  if (soon.length) lines.push(`${plural(soon.length, "concern")} due within 5 days.`);
  if (unacknowledged.length) lines.push(`${plural(unacknowledged.length, "concern")} not yet acknowledged.`);
  if (closedThisYear) lines.push(`${closedThisYear} closed so far this year.`);
  const worst = [...open].sort((a, b) => (a.deadline.days ?? 9999) - (b.deadline.days ?? 9999)).slice(0, 4);
  lines.push("Closest to a deadline:", ...worst.map(({ concern, deadline }) => `• ${concern.reference || "Concern"}: ${CONCERN_STAGE_LABELS[concern.status] || concern.status}, ${deadline.label}${concern.ownerName ? `, owner ${concern.ownerName}` : ", no owner"}`));
  return { text: lines.join("\n"), count: open.length, overdue: overdue.length };
}
