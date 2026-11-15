// The practice's desktop PCs (IT equipment > PCs): each PC's number, where it is, who or what uses it, the printer beside it and which programs are installed. Pure (no Firestore, no screens)
// so it can be tested. The laptops have their own register (modules/laptops); PCs are not lent out and have no update reminders, so they are kept apart from it.
//
// A PC is one record. Where it is comes from the practice's own list of sites (picked, never typed). "Who or what uses it" is kept as written on the practice's sheet ("Room 12", "Phones",
// "Dave"), and a name that matches one member of staff is also linked to them. Software is a list of fixed keys, so every PC reads the same.

import { ORIGIN, addDays, dayKey, daysBetween, isDay, ukDay } from "../laptops/laptops.js";

export const STATUS = { in_use: "In use", spare: "Spare", decommissioned: "Decommissioned" };

// the programs on the practice's sheet, in the order the sheet has them. "Patches" is the sheet's own column for whether the PC's patches are done.
export const SOFTWARE = [
  { key: "emis", label: "EMIS", match: /^emis$/i },
  { key: "docman", label: "Docman", match: /^docman$/i },
  { key: "labeltrace", label: "Label Trace", match: /^label\s*trace$/i },
  { key: "expressinvoice", label: "Express Invoice", match: /^express\s*invoice$/i },
  { key: "inrstar", label: "INR Star", match: /^inr\s*star$/i },
  { key: "spirotrac", label: "Spirotrac", match: /^spirotrac$/i },
  { key: "bp24", label: "24hr BP", match: /^24\s*h(?:ou)?r\s*bp$/i },
  { key: "seca", label: "Seca (ECG)", match: /^seca(?:\s*\(?\s*ecg\s*\)?)?$/i },
  { key: "lexacom", label: "Lexacom", match: /^lexacom$/i },
  { key: "patches", label: "Patches", match: /^patch(?:es)?$/i },
];
export const softwareLabel = (key) => SOFTWARE.find((s) => s.key === key)?.label || key;
const SOFTWARE_KEYS = new Set(SOFTWARE.map((s) => s.key));

const text = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const has = (map, key) => Object.prototype.hasOwnProperty.call(map, key);

export const isLive = (pc) => pc?.active !== false && pc?.status !== "decommissioned";

// "PRESCRIBING SUPERVISOR" -> "Prescribing Supervisor", "PCA" stays "PCA", "KAREN B" -> "Karen B": the sheet is in capitals; the register reads better in words
const SMALL = new Set(["and", "of", "the", "to", "a", "at", "in"]);
export function tidy(value) {
  const s = text(value, 80);
  if (!s) return "";
  if (s !== s.toUpperCase()) return s; // already written with care: leave it
  return s.replace(/[A-Za-z][A-Za-z']*/g, (word) => {
    if (SMALL.has(word.toLowerCase())) return word.toLowerCase();
    if (word.length <= 3 && /^(?:PCA|CMC|BP|ECG|IT|PC|GP)$/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).replace(/^./, (c) => c.toUpperCase());
}

// the software a form or a sheet gave, as fixed keys, each once, in the sheet's order
export const cleanSoftware = (list) => SOFTWARE.map((s) => s.key).filter((key) => (Array.isArray(list) ? list : []).includes(key));

// ---- making and changing a PC ----
// Each change returns { patch, event } (or, for a new PC, { computer, event }) or throws a sentence for the person. The event is a line in the PC's own history, which is never edited.
const holderOf = (holder) => (holder?.uid ? { uid: String(holder.uid), name: text(holder.name || holder.displayName, 80) } : null);
const by = (actor) => ({ byUid: text(actor?.uid, 80), byName: text(actor?.displayName || actor?.name || actor?.email, 80) });
const line = (pc, type, summary, today, actor, detail = {}) => ({ computerId: pc.id || "", assetNumber: pc.assetNumber || "", type, text: summary, onDay: today, ...by(actor), detail });

// input: { assetNumber, site: { id, name }, department, label, printerSerial, status, holder: { uid, name }, software: [keys], notes }
export function buildNewComputer(input = {}, { today = dayKey(), actor = {}, imported = false } = {}) {
  const assetNumber = text(input.assetNumber, 40).toUpperCase();
  if (!assetNumber) throw new Error("Give the PC its number.");
  const status = has(STATUS, input.status) ? input.status : "in_use";
  const holder = status === "in_use" ? holderOf(input.holder) : null;
  const computer = {
    assetNumber, status, active: true,
    siteId: text(input.site?.id, 80), siteName: text(input.site?.name, 80),
    department: tidy(input.department), label: tidy(input.label),
    printerSerial: text(input.printerSerial, 40).toUpperCase(),
    currentUserUid: holder?.uid || "", currentUserName: holder?.name || "",
    software: cleanSoftware(input.software), notes: text(input.notes, 200),
    lastCheckedOn: "", lastCheckedByName: "", lastCheckNote: "",
  };
  return { computer, event: line({ assetNumber }, imported ? "imported" : "added", `PC ${assetNumber} ${imported ? "added from a sheet" : "added"}${computer.siteName ? ` at ${computer.siteName}` : ""}`, today, actor) };
}

// the facts that describe the PC. changes: any of { site, department, label, printerSerial, status, holder, software, notes }
export function buildEditComputer({ computer, changes = {}, today = dayKey(), actor = {} } = {}) {
  const patch = {}; const said = [];
  if (has(changes, "site")) { patch.siteId = text(changes.site?.id, 80); patch.siteName = text(changes.site?.name, 80); said.push("site"); }
  if (has(changes, "department")) { patch.department = tidy(changes.department); said.push("department"); }
  if (has(changes, "label")) { patch.label = tidy(changes.label); said.push("who or what uses it"); }
  if (has(changes, "printerSerial")) { patch.printerSerial = text(changes.printerSerial, 40).toUpperCase(); said.push("printer"); }
  if (has(changes, "software")) { patch.software = cleanSoftware(changes.software); said.push("software"); }
  if (has(changes, "notes")) { patch.notes = text(changes.notes, 200); said.push("notes"); }
  if (has(changes, "status")) {
    if (!has(STATUS, changes.status)) throw new Error("Choose a status.");
    patch.status = changes.status; said.push("status");
    if (changes.status !== "in_use") { patch.currentUserUid = ""; patch.currentUserName = ""; }
  }
  if (has(changes, "holder")) {
    const status = patch.status || computer?.status;
    const holder = status === "in_use" ? holderOf(changes.holder) : null;
    patch.currentUserUid = holder?.uid || ""; patch.currentUserName = holder?.name || ""; said.push("who has it");
  }
  if (!said.length) throw new Error("Nothing was changed.");
  return { patch, event: line(computer, patch.status === "decommissioned" ? "status" : "edited", `PC ${computer?.assetNumber || ""}: ${said.join(", ")} changed${patch.status ? ` (now ${STATUS[patch.status].toLowerCase()})` : ""}`, today, actor) };
}

// ---- going round and checking each PC ----
// A check is the IT team standing at the PC (after scanning its label), confirming what is installed and that it is working. A PC is due a check every CHECK_EVERY_DAYS days.
export const CHECK_EVERY_DAYS = 90;
export const DUE_SOON_DAYS = 14;

// "none" (not a live PC), "never" (not checked yet), "ok", "soon" (within DUE_SOON_DAYS of its next check) or "overdue"; days is how many days away (negative when late)
export function checkState(pc, today = dayKey()) {
  if (!isLive(pc)) return { state: "none", days: null, dueOn: "" };
  if (!isDay(pc?.lastCheckedOn)) return { state: "never", days: null, dueOn: "" };
  const dueOn = addDays(pc.lastCheckedOn, CHECK_EVERY_DAYS);
  const days = daysBetween(today, dueOn);
  return { state: days < 0 ? "overdue" : days <= DUE_SOON_DAYS ? "soon" : "ok", days, dueOn };
}
export const needsCheck = (pc, today = dayKey()) => ["never", "overdue", "soon"].includes(checkState(pc, today).state);

// opts: { checkedOn (a day, today by default), software (the programs found on it, if the person ticked them), note }
export function buildChecked({ computer, checkedOn, software, note = "", today = dayKey(), actor = {} } = {}) {
  if (!isLive(computer)) throw new Error("A decommissioned PC cannot be checked.");
  const on = checkedOn || today;
  if (!isDay(on)) throw new Error("That is not a date.");
  if (on > today) throw new Error("A check cannot be in the future.");
  const patch = { lastCheckedOn: on, lastCheckedByName: by(actor).byName, lastCheckNote: text(note, 200) };
  let changed = [];
  if (Array.isArray(software)) {
    const next = cleanSoftware(software); const before = cleanSoftware(computer.software);
    if (next.join() !== before.join()) {
      patch.software = next;
      changed = [...next.filter((k) => !before.includes(k)).map((k) => `${softwareLabel(k)} added`), ...before.filter((k) => !next.includes(k)).map((k) => `${softwareLabel(k)} removed`)];
    }
  }
  const words = `PC ${computer.assetNumber} checked${changed.length ? `, ${changed.join(", ")}` : ""}${patch.lastCheckNote ? `: ${patch.lastCheckNote}` : ""}`;
  return { patch, event: line(computer, "checked", words, today, actor, changed.length ? { softwareChanged: changed } : {}) };
}

// ---- links on the QR label ----
export const buildComputerLink = (pc, origin = ORIGIN) => `${String(origin).replace(/\/+$/, "")}/sense/open/pc/${encodeURIComponent(pc?.id || pc?.assetNumber || "")}`;
export function parseComputerLink(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const m = new URL(value, "https://scan.invalid").pathname.match(/^\/sense\/open\/pc\/([^/]+)\/?$/i);
    if (m) return { id: decodeURIComponent(m[1]), raw: value };
  } catch { /* not a link */ }
  const code = /^MEDTRAK:PC:(.+)$/i.exec(value);
  return code ? { id: code[1], raw: value } : null;
}

// ---- finding, filtering, counting ----
export const searchText = (pc) => [pc.assetNumber, pc.label, pc.department, pc.printerSerial, pc.currentUserName, pc.siteName].filter(Boolean).join(" ").toLowerCase();

// software that nearly every live PC has (at least 95%): a PC without it is worth a look
export function usualSoftware(list = []) {
  const live = list.filter(isLive);
  if (live.length < 5) return [];
  return SOFTWARE.map((s) => s.key).filter((key) => live.filter((pc) => (pc.software || []).includes(key)).length / live.length >= 0.95);
}
export const missingSoftware = (pc, usual) => (usual || []).filter((key) => !(pc.software || []).includes(key));

// filters: { term, siteId, department, missing (a software key, or "usual" for any of the usual ones), has (a software key), status ("live", "due" = needs a check, "all", or a status), today }
export function filterComputers(list = [], filters = {}) {
  const usual = usualSoftware(list);
  const term = String(filters.term || "").trim().toLowerCase();
  return list.filter((pc) => {
    if (term && !term.split(/\s+/).every((word) => searchText(pc).includes(word))) return false;
    if (filters.siteId && pc.siteId !== filters.siteId) return false;
    if (filters.department && pc.department !== filters.department) return false;
    if (filters.status === "live" && !isLive(pc)) return false;
    if (filters.status === "due" && !needsCheck(pc, filters.today)) return false;
    if (filters.status && !["live", "due", "all"].includes(filters.status) && pc.status !== filters.status) return false;
    if (filters.has && !(pc.software || []).includes(filters.has)) return false;
    if (filters.missing === "usual" && !missingSoftware(pc, usual).length) return false;
    if (filters.missing && filters.missing !== "usual" && (pc.software || []).includes(filters.missing)) return false;
    return true;
  });
}

export function summariseComputers(list = []) {
  const live = list.filter(isLive);
  const usual = usualSoftware(list);
  const counts = Object.fromEntries(SOFTWARE.map((s) => [s.key, live.filter((pc) => (pc.software || []).includes(s.key)).length]));
  const sites = new Map();
  for (const pc of live) { const k = pc.siteId || ""; sites.set(k, { id: k, name: pc.siteName || "No site", count: (sites.get(k)?.count || 0) + 1 }); }
  return {
    total: live.length, inUse: live.filter((pc) => pc.status === "in_use").length, spare: live.filter((pc) => pc.status === "spare").length,
    decommissioned: list.length - live.length, usual, counts, withGaps: live.filter((pc) => missingSoftware(pc, usual).length).length,
    sites: [...sites.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ---- reading the practice's own spreadsheet ----
// sheet: { name, rows: [{ r, cells: { columnNumber: value } }] } as readWorkbook gives it. The sheet has a heading row with DEPARTMENT, SERIAL NUMBER (the printer), USER and PC, and the program
// names across the top; one row per PC; a row holding only a name part-way down ("Ty-Elan") starts a new section (another site). A tick under a program means it is installed (the symbol does not matter).
// staff: [{ uid, displayName }].  existingNumbers: PC numbers already in the register.
const cell = (row, col) => (col ? String(row.cells[col] ?? "").trim() : "");
const COLUMN = { department: /^department$/i, printer: /^serial\s*(?:number|no\.?)?$/i, user: /^user$/i, pc: /^pc(?:\s*no'?s?)?$/i };

function staffMatch(label, staff) {
  const tokens = String(label || "").toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 3) return null;
  const hits = staff.filter((s) => {
    const parts = String(s.displayName || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!parts.length) return false;
    if (parts.join(" ") === tokens.join(" ")) return true;
    if (parts[0] !== tokens[0]) return false;
    return tokens.length === 1 || (tokens.length === 2 && tokens[1].length === 1 && (parts[parts.length - 1] || "").startsWith(tokens[1]));
  });
  return hits.length === 1 ? { uid: hits[0].uid, name: hits[0].displayName } : null;
}

export function parseComputersSheet(sheet, { staff = [], existingNumbers = [] } = {}) {
  const rows = [...(sheet?.rows || [])].sort((a, b) => a.r - b.r);
  if (!rows.length) return { rows: [], groups: [], problem: "That sheet is empty." };
  const columns = {}; const software = {}; let lastHeader = 0;
  for (const row of rows.slice(0, 14)) {
    for (const [col, value] of Object.entries(row.cells)) {
      const word = String(value).trim();
      const kind = Object.keys(COLUMN).find((k) => COLUMN[k].test(word));
      if (kind && columns[kind] === undefined) { columns[kind] = Number(col); lastHeader = Math.max(lastHeader, row.r); }
      const known = SOFTWARE.find((s) => s.match.test(word));
      if (known && software[known.key] === undefined) { software[known.key] = Number(col); lastHeader = Math.max(lastHeader, row.r); }
    }
  }
  if (!columns.pc) return { rows: [], groups: [], problem: "I can't find a column headed PC. Choose the sheet with the PC numbers." };
  if (!Object.keys(software).length) return { rows: [], groups: [], problem: "I can't find the program names (EMIS, Docman and so on) across the top of that sheet." };

  const known = new Set(existingNumbers.map((n) => String(n).toUpperCase()));
  const seen = new Set(); const printers = new Map();
  const out = []; const groups = []; let group = ""; let started = false;
  const groupFor = (key, label) => { if (!groups.some((g) => g.key === key)) groups.push({ key, label, count: 0 }); return groups.find((g) => g.key === key); };
  groupFor("", "First section");

  for (const row of rows) {
    if (row.r <= lastHeader) continue;
    const pcRaw = cell(row, columns.pc);
    const dept = cell(row, columns.department);
    const others = Object.entries(row.cells).filter(([c]) => Number(c) !== columns.department && String(row.cells[c]).trim() !== "").length;
    if (!pcRaw) {
      // a name on its own, after the PCs have started, is a new section (another site); anything else with no PC number is skipped
      if (started && dept && !others) { group = dept; groupFor(group, tidy(dept)); }
      else if (started && others) out.push({ line: row.r, assetNumber: "", groupKey: group, computer: null, errors: ["No PC number."], warnings: [] });
      continue;
    }
    started = true;
    const numbers = (typeof row.cells[columns.pc] === "number" ? [String(row.cells[columns.pc])] : pcRaw.split(/\s*(?:&|\/|,|\+|\band\b)\s*/i)).map((n) => text(n, 40).toUpperCase()).filter(Boolean);
    const label = cell(row, columns.user);
    const printer = text(cell(row, columns.printer), 40).toUpperCase();
    const installed = Object.entries(software).filter(([, col]) => cell(row, col) !== "").map(([key]) => key);
    const holder = /^spare$/i.test(label) ? null : staffMatch(label, staff);
    numbers.forEach((assetNumber) => {
      const errors = []; const warnings = [];
      if (known.has(assetNumber)) errors.push("Already in the register.");
      else if (seen.has(assetNumber)) errors.push("Listed twice in this sheet.");
      seen.add(assetNumber);
      if (numbers.length > 1) warnings.push(`Listed together with ${numbers.filter((n) => n !== assetNumber).join(" and ")} on one row: added as separate PCs, each with this row's details.`);
      if (printer) {
        const first = printers.get(printer);
        if (first && first.line !== row.r) warnings.push(`Printer ${printer} is also listed for PC ${first.pc}: check it is not a typing slip.`); // the same row listing two PCs is not a slip
        else if (!first) printers.set(printer, { pc: assetNumber, line: row.r });
      }
      if (assetNumber.length > 10) warnings.push("A long number like this is usually the computer's asset name.");
      const computer = {
        assetNumber, status: /^spare$/i.test(label) ? "spare" : "in_use", department: dept, label, printerSerial: printer,
        holder, software: cleanSoftware(installed), notes: "",
      };
      groupFor(group, tidy(group) || "First section").count += errors.length ? 0 : 1;
      out.push({ line: row.r, assetNumber, groupKey: group, computer, errors, warnings });
    });
  }
  if (!out.length) return { rows: [], groups: [], problem: "There are no PCs under the headings." };
  return { rows: out, groups: groups.filter((g) => g.count > 0 || out.some((o) => o.groupKey === g.key)), problem: "", softwareFound: Object.keys(software), usedColumns: Object.keys(columns) };
}
export { SOFTWARE_KEYS, ukDay };
