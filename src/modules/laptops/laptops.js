// The practice's laptops, and lending them out. Pure (no Firestore, no screens) so it can be tested.
//
// A laptop is one record: its asset code, who has it day to day (picked from the staff list, never typed), its condition, whether Windows 11 and Office 365 are on it, when it was last updated
// and when it is next due. Lending a laptop is a loan on the record (who, until when), and every change is also written as a line in a log that is never edited.
// Days are plain "2026-11-04" text, so there is no time zone to get wrong. A BitLocker recovery key is never kept here: the import drops that column.

export const STATUS = { in_use: "In use", spare: "Spare", on_loan: "On loan", decommissioned: "Decommissioned" };
export const CONDITION = { excellent: "Excellent", very_good: "Very good", good: "Good", old: "Old", slow: "Slow", faulty: "Faulty", unknown: "Not recorded" };
export const WIN11 = { yes: "Windows 11", no: "Not Windows 11", unknown: "Not recorded" };
export const DUE_SOON_DAYS = 7;
export const ORIGIN = "https://app.primovex.co.uk";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const isDay = (value) => DAY.test(String(value || "")) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()) && dayKey(new Date(`${value}T12:00:00`)) === value;
export const ukDay = (key) => (isDay(key) ? key.split("-").reverse().join("/") : "");
const dayNumber = (key) => { const [y, m, d] = String(key).split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export const daysBetween = (fromKey, toKey) => dayNumber(toKey) - dayNumber(fromKey);
export const addDays = (key, n) => dayKey(new Date(new Date(`${key}T12:00:00`).getTime() + n * 86400000));
const text = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const has = (map, key) => Object.prototype.hasOwnProperty.call(map, key);

export const isLive = (laptop) => laptop?.active !== false && laptop?.status !== "decommissioned";
export const isOnLoan = (laptop) => isLive(laptop) && laptop?.status === "on_loan" && Boolean(laptop?.loan);

// "none" (no date, or not in use), "ok", "soon" (within a week), "overdue"; days is how many days away (negative when late)
function stateOf(dueOn, today) {
  if (!isDay(dueOn)) return { state: "none", days: null };
  const days = daysBetween(today, dueOn);
  return { state: days < 0 ? "overdue" : days <= DUE_SOON_DAYS ? "soon" : "ok", days };
}
export const updateState = (laptop, today = dayKey()) => (isLive(laptop) ? stateOf(laptop?.nextUpdateDue, today) : { state: "none", days: null });
export const loanState = (laptop, today = dayKey()) => (isOnLoan(laptop) ? stateOf(laptop.loan?.dueBackOn, today) : { state: "none", days: null });

// who has it, in words
export function holderText(laptop) {
  if (!laptop) return "";
  if (laptop.status === "decommissioned") return "Decommissioned";
  if (isOnLoan(laptop)) return `On loan to ${laptop.loan.borrowerName || "someone"} until ${ukDay(laptop.loan.dueBackOn) || "a date to be set"}`;
  if (laptop.currentUserName) return laptop.currentUserName;
  return laptop.status === "spare" ? "Spare" : "Nobody assigned";
}

// the person who should be told about this laptop: whoever has it on loan, otherwise whoever it is assigned to
export const holderUid = (laptop) => (isOnLoan(laptop) ? laptop.loan.borrowerUid : laptop?.currentUserUid) || "";

// ---------- links on the QR label ----------
export const buildLaptopLink = (laptop, origin = ORIGIN) => `${String(origin).replace(/\/+$/, "")}/sense/open/laptop/${encodeURIComponent(laptop?.id || laptop?.assetCode || "")}`;
export function parseLaptopLink(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const m = new URL(value).pathname.match(/^\/sense\/open\/laptop\/([^/]+)\/?$/i);
    if (m) return { id: decodeURIComponent(m[1]), raw: value };
  } catch { /* not a link */ }
  const code = /^MEDTRAK:LAPTOP:(.+)$/i.exec(value);
  return code ? { id: code[1], raw: value } : null;
}

// ---------- changes: each returns { patch, event } or throws a sentence for the person ----------
const person = (p, what) => { const uid = text(p?.uid, 80); const name = text(p?.name, 80); if (!uid || !name) throw new Error(`Choose ${what} from the staff list.`); return { uid, name }; };
const by = (actor) => ({ byUid: text(actor?.uid, 80), byName: text(actor?.displayName || actor?.name || actor?.email, 80) });
const line = (laptop, type, summary, today, actor, detail = {}) => ({ laptopId: laptop.id || "", assetCode: laptop.assetCode || "", type, text: summary, onDay: today, ...by(actor), detail });

export function buildNewLaptop(input = {}, { today = dayKey(), actor = {} } = {}) {
  const assetCode = text(input.assetCode, 40).toUpperCase();
  if (!assetCode) throw new Error("Give the laptop its asset code.");
  const status = has(STATUS, input.status) ? input.status : "spare";
  if (status === "on_loan") throw new Error("A new laptop cannot start on loan: add it, then loan it out.");
  const holder = status === "in_use" && input.currentUser ? person(input.currentUser, "who has it") : null;
  const laptop = {
    assetCode, status, active: true,
    currentUserUid: holder?.uid || "", currentUserName: holder?.name || "", borrowerUid: "",
    condition: has(CONDITION, input.condition) ? input.condition : "unknown",
    win11: has(WIN11, input.win11) ? input.win11 : "unknown",
    office365: input.office365 === true, upgraded: input.upgraded === true,
    lastUpdatedOn: isDay(input.lastUpdatedOn) && input.lastUpdatedOn <= today ? input.lastUpdatedOn : "",
    nextUpdateDue: isDay(input.nextUpdateDue) ? input.nextUpdateDue : "",
    loan: null, notes: text(input.notes, 200),
  };
  return { laptop, event: line({ assetCode }, input.imported ? "imported" : "added", `${assetCode} added to the register (${STATUS[status].toLowerCase()})`, today, actor) };
}

export function buildLoanOut({ laptop, borrower, dueBackOn, today = dayKey(), actor = {}, conditionOut } = {}) {
  if (!isLive(laptop)) throw new Error("A decommissioned laptop cannot be loaned out.");
  if (isOnLoan(laptop)) throw new Error(`${laptop.assetCode} is already on loan to ${laptop.loan.borrowerName}.`);
  if (laptop.condition === "faulty") throw new Error("This laptop is marked faulty. Change its condition first if it has been fixed.");
  const who = person(borrower, "who is borrowing it");
  if (!isDay(dueBackOn)) throw new Error("Say when it is due back.");
  if (dueBackOn < today) throw new Error("The due-back date is in the past.");
  const cond = has(CONDITION, conditionOut) ? conditionOut : laptop.condition || "unknown";
  const loan = { borrowerUid: who.uid, borrowerName: who.name, borrowedOn: today, dueBackOn, conditionOut: cond, ...{ recordedByUid: by(actor).byUid, recordedByName: by(actor).byName } };
  return { patch: { status: "on_loan", loan, borrowerUid: who.uid, previousStatus: laptop.status === "on_loan" ? "spare" : laptop.status }, event: line(laptop, "loan_out", `${laptop.assetCode} loaned to ${who.name}, due back ${ukDay(dueBackOn)}`, today, actor, { borrowerUid: who.uid, dueBackOn }) };
}

export function buildReturn({ laptop, condition, today = dayKey(), actor = {} } = {}) {
  if (!isOnLoan(laptop)) throw new Error("This laptop is not on loan.");
  if (!has(CONDITION, condition) || condition === "unknown") throw new Error("Say what condition it came back in.");
  const back = laptop.previousStatus && laptop.previousStatus !== "on_loan" ? laptop.previousStatus : "spare";
  const late = daysBetween(laptop.loan.dueBackOn, today);
  return {
    patch: { status: back === "in_use" && !laptop.currentUserUid ? "spare" : back, loan: null, borrowerUid: "", previousStatus: "", condition },
    event: line(laptop, "returned", `${laptop.assetCode} returned by ${laptop.loan.borrowerName} (${CONDITION[condition].toLowerCase()})${late > 0 ? `, ${late} day${late === 1 ? "" : "s"} late` : ""}`, today, actor, { borrowerUid: laptop.loan.borrowerUid, condition, daysLate: Math.max(0, late) }),
  };
}

// "Updated": the day it was updated (never in the future) and the day it is next due (after that)
export function buildUpdated({ laptop, updatedOn, nextDueOn, today = dayKey(), actor = {} } = {}) {
  if (!isLive(laptop)) throw new Error("A decommissioned laptop is not updated.");
  if (!isDay(updatedOn)) throw new Error("Give the day it was updated.");
  if (updatedOn > today) throw new Error("That day has not happened yet.");
  if (!isDay(nextDueOn)) throw new Error("Give the day it is next due for an update.");
  if (nextDueOn <= updatedOn) throw new Error("The next update must be after the one just done.");
  return { patch: { lastUpdatedOn: updatedOn, nextUpdateDue: nextDueOn, lastUpdatedByUid: by(actor).byUid, lastUpdatedByName: by(actor).byName }, event: line(laptop, "updated", `${laptop.assetCode} updated on ${ukDay(updatedOn)}, next due ${ukDay(nextDueOn)}`, today, actor, { updatedOn, nextDueOn }) };
}

// who has it day to day (nobody, for a spare)
export function buildAssign({ laptop, holder, today = dayKey(), actor = {} } = {}) {
  if (!isLive(laptop)) throw new Error("A decommissioned laptop cannot be assigned.");
  if (isOnLoan(laptop)) throw new Error("Return it from loan first.");
  if (!holder) return { patch: { currentUserUid: "", currentUserName: "", status: "spare" }, event: line(laptop, "assigned", `${laptop.assetCode} is now a spare`, today, actor) };
  const who = person(holder, "who has it");
  return { patch: { currentUserUid: who.uid, currentUserName: who.name, status: "in_use" }, event: line(laptop, "assigned", `${laptop.assetCode} assigned to ${who.name}`, today, actor, { holderUid: who.uid }) };
}

// the facts that describe the laptop (never its holder or its loan, which have their own changes)
export function buildEdit({ laptop, changes = {}, today = dayKey(), actor = {} } = {}) {
  const patch = {};
  if (has(changes, "condition")) { if (!has(CONDITION, changes.condition)) throw new Error("Choose a condition from the list."); patch.condition = changes.condition; }
  if (has(changes, "win11")) { if (!has(WIN11, changes.win11)) throw new Error("Choose a Windows 11 answer from the list."); patch.win11 = changes.win11; }
  if (has(changes, "office365")) patch.office365 = changes.office365 === true;
  if (has(changes, "upgraded")) patch.upgraded = changes.upgraded === true;
  if (has(changes, "notes")) patch.notes = text(changes.notes, 200);
  if (has(changes, "nextUpdateDue")) { if (changes.nextUpdateDue && !isDay(changes.nextUpdateDue)) throw new Error("That is not a date."); patch.nextUpdateDue = changes.nextUpdateDue || ""; }
  if (has(changes, "status")) {
    if (!has(STATUS, changes.status) || changes.status === "on_loan") throw new Error("To lend it, use Loan out.");
    if (isOnLoan(laptop)) throw new Error("Return it from loan first.");
    patch.status = changes.status;
    if (changes.status !== "in_use") { patch.currentUserUid = ""; patch.currentUserName = ""; }
    if (changes.status === "decommissioned") { patch.nextUpdateDue = ""; patch.loan = null; patch.borrowerUid = ""; }
  }
  if (!Object.keys(patch).length) throw new Error("Nothing was changed.");
  const names = Object.keys(patch).map((k) => ({ condition: "condition", win11: "Windows 11", office365: "Office 365", upgraded: "upgraded", notes: "notes", nextUpdateDue: "next update", status: "status", currentUserUid: "", currentUserName: "", loan: "" }[k])).filter(Boolean);
  return { patch, event: line(laptop, patch.status === "decommissioned" ? "status" : "edited", `${laptop.assetCode}: ${[...new Set(names)].join(", ")} changed${patch.status ? ` (now ${STATUS[patch.status].toLowerCase()})` : ""}`, today, actor, { fields: Object.keys(patch).join(",") }) };
}

// ---------- the paste import ----------
const HEADERS = {
  assetCode: ["laptop name", "asset code", "asset", "laptop", "asset tag", "name"],
  currentUser: ["current user", "user", "assigned to", "holder"],
  updated: ["updated", "last updated", "updated on"],
  office365: ["office 365", "office365"],
  upgraded: ["upgraded"],
  condition: ["condition"],
  win11: ["win 11 compatible", "win11", "windows 11", "win 11"],
  function: ["function / owner", "function", "owner"],
};
// columns that are deliberately not imported
const NEVER = { "bit locker code": "a BitLocker recovery key is never kept in Primovex", bitlocker: "a BitLocker recovery key is never kept in Primovex", "bitlocker code": "a BitLocker recovery key is never kept in Primovex", "bitlocker key": "a BitLocker recovery key is never kept in Primovex", "sim number": "not used", sim: "not used", borrowed: "loans are recorded here, from now on", returned: "loans are recorded here, from now on" };

function splitLine(line, delimiter) {
  if (delimiter === "\t") return line.split("\t");
  const out = []; let cell = ""; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted; } else if (c === "," && !quoted) { out.push(cell); cell = ""; } else cell += c;
  }
  out.push(cell);
  return out;
}

// a day as people write it (day first), or "" when it is not a real day
export function parseDay(value) {
  const s = String(value ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let y; let mo; let d;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) [d, mo, y] = [Number(m[1]), Number(m[2]), m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])];
  else return "";
  const key = `${y}-${pad(mo)}-${pad(d)}`;
  return isDay(key) ? key : "";
}
const yes = (v) => /^(y|yes|true|x|✓|✔|•|•)$/i.test(String(v ?? "").trim());
const conditionOf = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s || s === "n/a" || s === "na") return { condition: "unknown", note: "" };
  if (/^(v|very)\s*good$/.test(s)) return { condition: "very_good", note: "" };
  if (s === "excellent") return { condition: "excellent", note: "" };
  if (s === "good") return { condition: "good", note: "" };
  if (/slow/.test(s)) return { condition: "slow", note: "" };
  if (s === "old") return { condition: "old", note: "" };
  if (/faulty/.test(s)) return { condition: "faulty", note: text(s.replace(/faulty/, "").trim(), 60) };
  return { condition: "unknown", note: text(s, 60) };
};
const win11Of = (v) => { const s = String(v ?? "").trim().toLowerCase(); return /^(yes|win ?11|windows 11)$/.test(s) ? "yes" : s === "no" ? "no" : "unknown"; };

// staff: [{ uid, displayName }]. A name in the sheet ("BEN") matches one person by first name or full name; if it matches nobody, or more than one, the laptop is added without a holder and the row says so.
export function parseLaptopImport(raw, { today = dayKey(), staff = [], existingCodes = [] } = {}) {
  const lines = String(raw ?? "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], ignored: [], problem: "Paste the heading row and at least one laptop." };
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const heads = splitLine(lines[0], delimiter).map((h) => h.trim().toLowerCase());
  const at = {}; const ignored = [];
  heads.forEach((h, i) => {
    const key = Object.keys(HEADERS).find((k) => HEADERS[k].includes(h));
    if (key && at[key] === undefined) at[key] = i;
    else if (NEVER[h]) ignored.push({ column: h, why: NEVER[h] });
    else if (h) ignored.push({ column: h, why: "not recognised" });
  });
  if (at.assetCode === undefined) return { rows: [], ignored, problem: "There is no column for the laptop's name or asset code." };
  const known = new Set(existingCodes.map((c) => String(c).toUpperCase()));
  const seen = new Set();
  const rows = lines.slice(1).map((l, n) => {
    const cells = splitLine(l, delimiter).map((c) => c.trim());
    const get = (k) => (at[k] === undefined ? "" : cells[at[k]] || "");
    const errors = []; const warnings = [];
    const assetCode = text(get("assetCode"), 40).toUpperCase();
    if (!assetCode) errors.push("No asset code.");
    else if (known.has(assetCode)) errors.push("Already in the register.");
    else if (seen.has(assetCode)) errors.push("Listed twice in this paste.");
    seen.add(assetCode);
    const decommissioned = cells.some((c) => /decom+iss?ion/i.test(c));
    let holder = null;
    const who = (get("currentUser") || "").trim();
    const spareWord = /^spare$/i.test(who) || (!who && /spare/i.test(get("function")));
    const nobody = !who || /^(n\/a|na|-)$/i.test(who);
    if (!decommissioned && who && !/^(spare|n\/a|na|-)$/i.test(who)) {
      const w = who.toLowerCase();
      const hits = staff.filter((s) => String(s.displayName || "").toLowerCase() === w || String(s.displayName || "").toLowerCase().split(/\s+/)[0] === w);
      if (hits.length === 1) holder = { uid: hits[0].uid, name: hits[0].displayName };
      else warnings.push(hits.length ? `"${who}" matches more than one person: no holder set.` : `"${who}" is not in the staff list: no holder set.`);
    }
    let lastUpdatedOn = "";
    const rawDay = get("updated");
    if (rawDay) {
      const d = parseDay(rawDay);
      if (!d) warnings.push(`"${rawDay}" is not a date: left blank.`);
      else if (d > today) warnings.push(`${ukDay(d)} is in the future (the day and month may be the wrong way round): left blank.`);
      else lastUpdatedOn = d;
    }
    const { condition, note } = conditionOf(get("condition"));
    const status = decommissioned ? "decommissioned" : holder ? "in_use" : spareWord || nobody ? "spare" : "in_use"; // a name that matched nobody is still in use, just with no holder yet
    const laptop = { assetCode, status, currentUser: holder || null, condition, win11: win11Of(get("win11")), office365: yes(get("office365")), upgraded: yes(get("upgraded")), lastUpdatedOn, notes: note, imported: true };
    return { line: n + 2, assetCode, laptop, errors, warnings };
  });
  return { rows, ignored, problem: "" };
}
