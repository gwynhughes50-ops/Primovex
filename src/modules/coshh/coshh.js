// COSHH register: the pure rules (no Firestore, no screens). One entry per hazardous substance the practice
// keeps (cleaning products, descaler, sanitiser...). Hazards, PPE and first aid are picked from the lists below,
// never typed, so every entry reads the same and a cleaner can find "what do I wear" at a glance.

// The hazard types come from the GHS pictograms printed on the label and in section 2 of the safety data sheet.
export const HAZARD_TYPES = [
  { key: "corrosive", label: "Corrosive (burns skin, damages eyes)" },
  { key: "irritant", label: "Irritant or harmful (skin, eyes, lungs)" },
  { key: "toxic", label: "Toxic (poisonous)" },
  { key: "flammable", label: "Flammable" },
  { key: "oxidising", label: "Oxidising" },
  { key: "gas-under-pressure", label: "Gas under pressure (aerosol)" },
  { key: "health-hazard", label: "Serious long-term health hazard" },
  { key: "environmental", label: "Harmful to the environment" },
  { key: "explosive", label: "Explosive" },
  { key: "sensitiser", label: "May cause an allergic reaction" },
  { key: "none", label: "Not classified as hazardous" },
];

export const PPE_OPTIONS = [
  { key: "gloves", label: "Gloves" },
  { key: "eye-protection", label: "Eye protection (goggles or glasses)" },
  { key: "face-shield", label: "Face shield" },
  { key: "apron", label: "Apron" },
  { key: "mask", label: "Mask or respirator" },
  { key: "footwear", label: "Non-slip or protective footwear" },
  { key: "ventilation", label: "Use in a well-ventilated area" },
  { key: "none", label: "No special protection needed" },
];

export const FIRST_AID_OPTIONS = [
  { key: "skin", label: "Skin contact: wash with plenty of water" },
  { key: "eyes", label: "Eye contact: rinse with water for at least 10 minutes" },
  { key: "swallowed", label: "Swallowed: rinse mouth, do not make them sick, get medical help" },
  { key: "inhaled", label: "Breathed in: move to fresh air" },
  { key: "clothing", label: "Splashed on clothing: take contaminated clothing off" },
  { key: "burns", label: "Burns: cool with running water" },
  { key: "fire", label: "Fire: raise the alarm, do not fight it" },
  { key: "ring-111", label: "Feeling unwell afterwards: call 111 or 999" },
];

const labelFor = (list) => Object.fromEntries(list.map((o) => [o.key, o.label]));
const HAZARD_LABEL = labelFor(HAZARD_TYPES);
const PPE_LABEL = labelFor(PPE_OPTIONS);
const FIRST_AID_LABEL = labelFor(FIRST_AID_OPTIONS);

export const hazardLabel = (key) => HAZARD_LABEL[key] || key;
export const ppeLabel = (key) => PPE_LABEL[key] || key;
export const firstAidLabel = (key) => FIRST_AID_LABEL[key] || key;

// "Corrosive" rather than "Corrosive (burns skin, damages eyes)" for chips
export const shortLabel = (label) => String(label || "").split(" (")[0].split(":")[0];

// How long a COSHH assessment can go before it needs looking at again. HSE: review when anything changes, and at
// least yearly is the usual practice rule.
export const REVIEW_MONTHS = 12;
export const DUE_SOON_DAYS = 30;

const pad = (n) => String(n).padStart(2, "0");
export const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function parseDateKey(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

// the date a review made today falls due again, clamped for short months (31 Jan + 1 month stays in Feb)
export function addMonths(key, months) {
  const base = parseDateKey(key);
  if (!base) return "";
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(base.getDate(), lastDay));
  return dateKey(target);
}

export function nextReviewFrom(reviewedOn) {
  return addMonths(reviewedOn, REVIEW_MONTHS);
}

export function daysUntilReview(reviewDate, now = new Date()) {
  const due = parseDateKey(reviewDate);
  if (!due) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// "missing" = no review date was ever set, which is itself something to put right
export function reviewStatus(substance, now = new Date()) {
  const days = daysUntilReview(substance?.reviewDate, now);
  if (days === null) return "missing";
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_DAYS) return "due-soon";
  return "ok";
}

export const REVIEW_STATUS_LABEL = {
  overdue: "Review overdue",
  "due-soon": "Review due soon",
  missing: "No review date",
  ok: "In date",
};

export function reviewText(substance, now = new Date()) {
  const days = daysUntilReview(substance?.reviewDate, now);
  if (days === null) return "No review date set";
  if (days < 0) return `Review was due ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Review due today";
  return `Review due in ${days} day${days === 1 ? "" : "s"}`;
}

const keysIn = (list, options) => {
  const allowed = new Set(options.map((o) => o.key));
  return [...new Set((Array.isArray(list) ? list : []).filter((k) => allowed.has(k)))];
};

// "none" can't sit next to a real hazard or PPE choice
function tidyNone(keys) {
  return keys.length > 1 ? keys.filter((k) => k !== "none") : keys;
}

export const emptySubstance = () => ({
  id: "",
  name: "",
  supplier: "",
  hazards: [],
  ppe: [],
  firstAid: [],
  site: "",
  location: "",
  reviewDate: "",
  sdsUrl: "",
  sdsPath: "",
  sdsFileName: "",
  active: true,
});

export function normaliseSubstance(id, data = {}) {
  return {
    ...emptySubstance(),
    id,
    name: String(data.name || "").trim(),
    supplier: String(data.supplier || "").trim(),
    hazards: tidyNone(keysIn(data.hazards, HAZARD_TYPES)),
    ppe: tidyNone(keysIn(data.ppe, PPE_OPTIONS)),
    firstAid: keysIn(data.firstAid, FIRST_AID_OPTIONS),
    site: String(data.site || "").trim(),
    location: String(data.location || "").trim(),
    reviewDate: parseDateKey(data.reviewDate) ? data.reviewDate : "",
    sdsUrl: String(data.sdsUrl || ""),
    sdsPath: String(data.sdsPath || ""),
    sdsFileName: String(data.sdsFileName || ""),
    lastReviewedAt: data.lastReviewedAt || "",
    lastReviewedByName: data.lastReviewedByName || "",
    active: data.active !== false,
  };
}

// problems to fix before saving: a list of plain sentences, empty when it is fine to save
export function validateSubstance(form) {
  const problems = [];
  if (!String(form?.name || "").trim()) problems.push("Enter the product name as it appears on the label.");
  if (!String(form?.supplier || "").trim()) problems.push("Choose the supplier.");
  if (!(form?.hazards || []).length) problems.push("Choose at least one hazard type (or 'Not classified as hazardous').");
  if (!(form?.ppe || []).length) problems.push("Choose the protective equipment (or 'No special protection needed').");
  const hazardous = (form?.hazards || []).some((k) => k !== "none");
  if (hazardous && !(form?.firstAid || []).length) problems.push("Choose the first-aid steps.");
  if (!String(form?.location || "").trim()) problems.push("Choose where it is stored.");
  if (!parseDateKey(form?.reviewDate)) problems.push("Set the review date.");
  if (!form?.sdsUrl) problems.push("Attach the safety data sheet (PDF).");
  return problems;
}

// the document written to Firestore: only the known fields
export function toRecord(form) {
  const clean = normaliseSubstance(form.id, form);
  return {
    name: clean.name,
    supplier: clean.supplier,
    hazards: clean.hazards,
    ppe: clean.ppe,
    firstAid: clean.firstAid,
    site: clean.site,
    location: clean.location,
    reviewDate: clean.reviewDate,
    sdsUrl: clean.sdsUrl,
    sdsPath: clean.sdsPath,
    sdsFileName: clean.sdsFileName,
    active: clean.active,
  };
}

export const isHazardous = (substance) => (substance?.hazards || []).some((k) => k !== "none");

// the order a list reads in: most urgent review first, then by name
const RANK = { overdue: 0, missing: 1, "due-soon": 2, ok: 3 };
export function sortSubstances(list, now = new Date()) {
  return [...list].sort((a, b) => {
    const r = RANK[reviewStatus(a, now)] - RANK[reviewStatus(b, now)];
    if (r) return r;
    const d = (a.reviewDate || "9999").localeCompare(b.reviewDate || "9999");
    return d || String(a.name).localeCompare(String(b.name));
  });
}

export function reviewSummary(list, now = new Date()) {
  const active = list.filter((s) => s.active !== false);
  const count = (status) => active.filter((s) => reviewStatus(s, now) === status).length;
  const overdue = count("overdue") + count("missing");
  const dueSoon = count("due-soon");
  return { total: active.length, overdue, dueSoon, needsAttention: overdue + dueSoon };
}

// text search across name, supplier and place, so a cleaner can type "bleach" or "cupboard"
export function searchSubstances(list, text) {
  const words = String(text || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((s) => {
    const hay = `${s.name} ${s.supplier} ${s.site} ${s.location}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// ---- the QR code on a storage cupboard ---------------------------------------------------------------------
// The code names a place (site + room), the same place the substances were filed under, so scanning it lists
// exactly what is stored there.
export function locationKey(site, location) {
  return `${String(site || "").trim()}|${String(location || "").trim()}`;
}

export function parseLocationKey(key) {
  const text = String(key || "");
  const at = text.indexOf("|");
  if (at < 0) return { site: "", location: text.trim() };
  return { site: text.slice(0, at).trim(), location: text.slice(at + 1).trim() };
}

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export function substancesAt(list, key) {
  const place = parseLocationKey(key);
  return list.filter((s) => s.active !== false && same(s.location, place.location) && (!place.site || !s.site || same(s.site, place.site)));
}

// every place something is stored, for printing one label per cupboard
export function storagePlaces(list) {
  const seen = new Map();
  for (const s of list) {
    if (s.active === false || !s.location) continue;
    const key = locationKey(s.site, s.location);
    const id = key.toLowerCase();
    const entry = seen.get(id) || { key, site: String(s.site || "").trim(), location: String(s.location || "").trim(), count: 0 };
    entry.count += 1;
    seen.set(id, entry);
  }
  return [...seen.values()].sort((a, b) => `${a.site} ${a.location}`.localeCompare(`${b.site} ${b.location}`));
}

// Who sees the register. Cleaners read it; the caretaker and practice manager keep it up to date.
export const COSHH_CAPABILITIES = { read: "coshh.read", manage: "coshh.manage" };
