// Clinical waste collections on record: what each consignment note says, and the figures an inspector asks for (when was
// waste last collected, how much, how regularly). Pure, so the page, the inspection pack and the tests share it.
//
//   consignment: { id, consignmentCode, collectionDate "YYYY-MM-DD", collectionTime, lines: [...], totalKg, voided, ... }

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
