// Clinical waste collections on record: what each consignment note says, and the figures an inspector asks for (when was
// waste last collected, how much, how regularly). Pure, so the page, the inspection pack and the tests share it.
//
//   consignment: { id, consignmentCode, collectionDate "YYYY-MM-DD", collectionTime, lines: [...], totalKg, voided, ... }

import { codeKey, quarterRange } from "./returnParse";

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const round = (n) => Math.round(n * 1000) / 1000;

// how long a collection can go without one before it is worth a second look
export const LONG_GAP_DAYS = 60;

export function normaliseConsignment(id, data = {}) {
  const lines = Array.isArray(data.lines) ? data.lines : [];
  return {
    id, siteId: data.siteId || "", siteName: data.siteName || "", siteAddress: data.siteAddress || "", consignmentCode: data.consignmentCode || "", documentRef: data.documentRef || "", customerSite: data.customerSite || "", premisesCode: data.premisesCode || "",
    collectionDate: data.collectionDate || "", collectionTime: data.collectionTime || "", producer: data.producer || "", carrier: data.carrier || "", destination: data.destination || "",
    lines, totalKg: Number(data.totalKg) || round(lines.reduce((sum, l) => sum + (Number(l.kg) || 0), 0)),
    fileName: data.fileName || "", filePath: data.filePath || "", fileUrl: data.fileUrl || "", voided: data.voided === true, voidReason: data.voidReason || "",
    addedByName: data.addedByName || "", notes: data.notes || "",
  };
}

// a short plain label for a waste line
export function wasteLabel(line) {
  const text = `${line.description || ""} ${line.component || ""}`.toUpperCase();
  if (/SHARPS/.test(text) && !/ALTERNATE/.test(text)) return "Sharps";
  if (/ALTERNATE TREATMENT|CLINICAL WASTE/.test(text)) return "Clinical waste";
  if (/ANATOMICAL/.test(text)) return "Anatomical";
  if (/CYTO/.test(text)) return "Cytotoxic";
  if (/MEDICINE|PHARMA/.test(text)) return "Medicines";
  return (line.description || line.ewc || "Waste").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export function summaryOf(consignment) {
  return consignment.lines.map((l) => `${wasteLabel(l)} ${l.kg === null || l.kg === undefined ? "?" : Number(l.kg).toFixed(1)} kg`).join(" · ");
}

export const live = (list) => list.filter((c) => !c.voided);

// the notes for one site ("" = every site; NO_SITE = those with no site recorded yet)
export const NO_SITE = "none";
export const forSite = (list, siteId) => (!siteId ? list : list.filter((c) => (c.siteId || NO_SITE) === siteId));
// the notes grouped by site, in name order, with the notes that have no site last
export function siteGroups(list) {
  const groups = new Map();
  for (const c of list) {
    const id = c.siteId || NO_SITE;
    const group = groups.get(id) || { siteId: id, name: c.siteName || (id === NO_SITE ? "No site recorded" : id), notes: [] };
    group.notes.push(c);
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => (a.siteId === NO_SITE) - (b.siteId === NO_SITE) || a.name.localeCompare(b.name));
}
export const newestFirst = (list) => [...list].sort((a, b) => (b.collectionDate || "").localeCompare(a.collectionDate || "") || (b.collectionTime || "").localeCompare(a.collectionTime || ""));

export const duplicateOf = (list, code) => list.find((c) => c.consignmentCode && code && c.consignmentCode.toUpperCase() === String(code).trim().toUpperCase()) || null;

// per month: collections, kilograms, bags and sharps boxes
export function monthly(list) {
  const months = new Map();
  for (const c of live(list)) {
    if (!/^\d{4}-\d{2}/.test(c.collectionDate)) continue;
    const key = c.collectionDate.slice(0, 7);
    const row = months.get(key) || { month: key, collections: 0, kg: 0, bags: 0, sharpsBoxes: 0 };
    row.collections += 1;
    row.kg = round(row.kg + c.totalKg);
    for (const l of c.lines) { row.bags += Number(l.bags) || 0; row.sharpsBoxes += Number(l.sharpsBoxes) || 0; }
    months.set(key, row);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

// what an inspector asks: the last collection, how many and how much in the last 12 months, the longest gap between collections
export function stats(list, now = new Date()) {
  const recent = live(list).filter((c) => parseKey(c.collectionDate));
  const sorted = [...recent].sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yearAgo = dateKey(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
  const lastYear = sorted.filter((c) => c.collectionDate >= yearAgo && c.collectionDate <= dateKey(today));
  const last = sorted.filter((c) => c.collectionDate <= dateKey(today)).slice(-1)[0] || null;
  let longestGap = 0;
  for (let i = 1; i < lastYear.length; i += 1) longestGap = Math.max(longestGap, Math.round((parseKey(lastYear[i].collectionDate) - parseKey(lastYear[i - 1].collectionDate)) / DAY));
  return {
    total: recent.length,
    last,
    daysSinceLast: last ? Math.round((today - parseKey(last.collectionDate)) / DAY) : null,
    collectionsLastYear: lastYear.length,
    kgLastYear: round(lastYear.reduce((sum, c) => sum + c.totalKg, 0)),
    longestGap,
  };
}

// ---- checking a quarterly return against the notes that are saved ---------------------------------------------------------------

const digits = (text) => String(text || "").replace(/[^0-9]/g, "");
const siteNumberKey = (text) => digits(text);
const plus = (a, b) => Math.round((a + b) * 1000) / 1000;
// the weight on a note that counts toward the hazardous (18 01 03) figure Stericycle reports
const hazardousKg = (note) => {
  const lines = (note.lines || []).filter((l) => digits(l.ewc).startsWith("180103"));
  return lines.length ? lines.reduce((n, l) => plus(n, Number(l.kg) || 0), 0) : Number(note.totalKg) || 0;
};

// The return lists each consignment Stericycle received from a site in a quarter. Each is matched to a saved note by its code (ignoring
// slashes and spacing). What comes back:
//   matched   on the return and saved; with whether the date and the weight agree
//   missing   on the return but not saved: the note still has to be added
//   extra     saved for this site in the quarter but not on the return (it may be received next quarter, if collected near the end)
export function compareReturn({ rows = [], notes = [], customerSite = "", siteId = "", year, quarter }) {
  const range = quarterRange(year, quarter);
  const live = notes.filter((n) => !n.voided);
  const byKey = new Map(live.map((n) => [codeKey(n.consignmentCode), n]));
  const groups = new Map();
  for (const r of rows) groups.set(codeKey(r.code), [...(groups.get(codeKey(r.code)) || []), r]);
  const matched = [];
  const missing = [];
  for (const [key, list] of groups) {
    const note = byKey.get(key);
    const returnKg = list.reduce((n, r) => plus(n, Number(r.kg) || 0), 0);
    if (!note) { missing.push({ code: list[0].code, date: list[0].date, kg: returnKg }); continue; }
    const noteKg = hazardousKg(note);
    matched.push({ code: list[0].code, note, returnKg, noteKg, returnDate: list[0].date, dateOk: note.collectionDate === list[0].date, weightOk: Math.abs(returnKg - noteKg) <= 0.06 });
  }
  const here = (n) => (siteId && n.siteId === siteId) || (customerSite && siteNumberKey(n.customerSite) === siteNumberKey(customerSite));
  const extra = live.filter((n) => here(n) && n.collectionDate >= range.from && n.collectionDate <= range.to && !groups.has(codeKey(n.consignmentCode)))
    .map((n) => {
      const nearEdge = (parseDay(range.to) - parseDay(n.collectionDate)) / DAY <= 7;
      return { note: n, nearEdge };
    });
  const problems = matched.filter((m) => !m.dateOk || !m.weightOk).length;
  return { range, total: groups.size, matched, missing, extra, problems, complete: missing.length === 0 && problems === 0 };
}
const parseDay = (key) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || "")); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : 0; };
