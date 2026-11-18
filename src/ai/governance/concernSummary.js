import { findIdentifiers } from "../guard/patientGuard.js";

// "Ask Primovex AI" beside a concern's Anonymised summary: turns what someone typed ("concerns re entries of medical information on notes") into a
// clearer, factual, anonymised summary, and says what else would make it a good one. Worked out here on this device, like the rest of Ask Primovex:
// nothing is sent anywhere. Anything that identifies a person (a name, NHS or EMIS number, date of birth, phone, email, postcode, street address) is
// taken out and the person is told what was taken out. It only ever suggests: the form shows it and nothing changes until they press Use this.
// It never adds facts that were not typed. Pure, so it can be tested.

const CATEGORY_LABELS = {
  access: "Access", communication: "Communication", clinical_care: "Clinical care", medication: "Medication", results: "Results",
  confidentiality: "Confidentiality", attitude: "Staff attitude", records: "Records", referral: "Referral", bereavement: "Bereavement",
  safeguarding: "Safeguarding", other: "",
};

const REMOVED = {
  name: "[name removed]", nhsNumber: "[NHS number removed]", phone: "[phone number removed]", email: "[email removed]", postcode: "[postcode removed]",
  address: "[address removed]", dateOfBirth: "[date of birth removed]", emisNumber: "[EMIS number removed]",
};
const KIND_WORDS = {
  name: "a name", nhsNumber: "an NHS number", phone: "a phone number", email: "an email address", postcode: "a postcode", address: "a street address",
  dateOfBirth: "a date of birth", emisNumber: "an EMIS number",
};

// Shorthand people type in a hurry, written out. Whole words only, any case.
const SHORTHAND = [
  [/\bre\b(?=\s)/gi, "regarding"], [/\bpts\b/gi, "patients"], [/\bpt\b/gi, "patient"], [/\bappts?\b/gi, (m) => (/s$/i.test(m) ? "appointments" : "appointment")],
  [/\bmeds\b/gi, "medication"], [/\brx\b/gi, "prescription"], [/\bpresc\b/gi, "prescription"], [/\bdx\b/gi, "diagnosis"], [/\bhx\b/gi, "history"],
  [/\breq\b/gi, "request"], [/\binfo\b/gi, "information"], [/\btel\b/gi, "telephone"], [/\bw\/(?=\s)/gi, "with"], [/\bb\/c\b/gi, "because"],
  [/\bthru\b/gi, "through"], [/\b[Dd]r\b(?!\.?\s+[A-Z])/g, "doctor"], [/\s&\s/g, " and "], [/\bcomp\b/gi, "complaint"],
  [/\bon (the )?(?:medical )?notes\b/gi, "in the medical records"], [/\bin (the )?notes\b/gi, "in the medical records"],
  [/\brecpt\b/gi, "reception"], [/\bpharm\b/gi, "pharmacy"], [/\bwks?\b/gi, (m) => (/s$/i.test(m) ? "weeks" : "week")], [/\bmins\b/gi, "minutes"],
  [/\bgp\b/g, "GP"], [/\bnhs\b/g, "NHS"], [/\bdoc\b/gi, "doctor"],
];

// Dates of birth and EMIS numbers: the patient guard lets these through (Primovex identifies a patient by them), but an anonymised summary must not.
function extraIdentifiers(text) {
  const found = [];
  const add = (kind, value) => { if (value && !found.some((f) => f.text === value)) found.push({ kind, text: value.trim() }); };
  for (const m of text.matchAll(/\b(?:d\.?o\.?b\.?|date of birth|born(?: on)?)\s*[:\-]?\s*(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})/gi)) add("dateOfBirth", m[0]);
  for (const m of text.matchAll(/\bemis(?:\s*(?:no\.?|number|#|id))?\s*[:\-]?\s*\d{3,}\b/gi)) add("emisNumber", m[0]);
  for (const m of text.matchAll(/(?:\bnhs(?:\s*(?:no\.?|number|#))?\s*[:-]?\s*)?\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/gi)) add("nhsNumber", m[0]); // any NHS-shaped number, valid check digit or not
  return found;
}

export function findSummaryIdentifiers(text, { allow = [] } = {}) {
  const extra = extraIdentifiers(text);
  const guard = findIdentifiers(text, { allow }).filter((p) => !extra.some((e) => e.text.includes(p.text) || p.text.includes(e.text)));
  return [...extra, ...guard];
}

function removeIdentifiers(text, problems) {
  let out = text;
  // longest first, so "Mrs Jones" goes before "Jones"
  for (const p of [...problems].sort((a, b) => b.text.length - a.text.length)) out = out.split(p.text).join(REMOVED[p.kind] || "[removed]");
  // several details in a row ("[address removed] [postcode removed]") read as one
  return out.replace(/\[[a-zA-Z ]+ removed\](?:[\s,]+\[[a-zA-Z ]+ removed\])+/g, "[personal details removed]");
}

const capitalise = (s) => s.replace(/^\s*([a-z])/, (m, c) => m.replace(c, c.toUpperCase()));

function tidy(text) {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  for (const [pattern, to] of SHORTHAND) t = t.replace(pattern, to);
  t = t.replace(/\bi\b/g, "I").replace(/\s+([,.;:!?])/g, "$1").replace(/([,.;:!?])(?=[A-Za-z])/g, "$1 ");
  t = t.replace(/!+/g, ".").replace(/\.{2,}/g, ".");
  // sentences start with a capital and the whole thing ends with a full stop
  t = t.split(/(?<=[.?])\s+/).map(capitalise).join(" ");
  if (t && !/[.?]$/.test(t)) t += ".";
  return t;
}

// "concerns re X" / "complaint about X" / "unhappy with X" as the whole opening: rewritten as a proper sentence about the person raising it.
function openingSentence(text) {
  const m = text.match(/^(?:(?:a|the)\s+)?(?:concerns?|complaints?|issues?|unhappy|upset|dissatisfied|worried)\s+(?:raised\s+)?(?:regarding|about|over|with|that|around|in relation to)\s+(.+)$/i);
  if (!m) return text;
  const rest = m[1].replace(/^\s*the\s+/i, "the ");
  return `The person raising this concern is concerned about ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
}

const words = (s) => (String(s || "").match(/[A-Za-z0-9]+/g) || []).length;

// Coaching: what would make the summary more useful, from what is (and isn't) in it. Shown under the suggestion, never written into it.
function tipsFor(text, { category, priority, desiredOutcome }) {
  const t = text.toLowerCase();
  const tips = [];
  if (words(text) < 12) tips.push("Add a little more: what happened, and what the impact was for the person.");
  if (!/\b(19|20)\d{2}\b|\b(january|february|march|april|may|june|july|august|september|october|november|december|week|month|year|yesterday|today|recently|since|ago)\b/.test(t)) tips.push("Say roughly when it happened (a month or week is enough; no exact dates of birth).");
  if (priority === "high" && !/\b(harm|risk|safety|injur|delay|missed|wrong|error|deteriorat)/.test(t)) tips.push("It is marked HIGH: say what harm or risk to patient safety was identified.");
  if (category === "records" && !/\b(inaccura|incorrect|wrong|missing|error|amend|correct|remov|delet)/.test(t)) tips.push("For a records concern, say whether the entry is thought to be inaccurate, missing or in the wrong record, and whether an amendment is being asked for.");
  if ((category === "clinical_care" || category === "medication") && !/\b(review|clinician|doctor|nurse|pharmacist|gp|prescri)/.test(t)) tips.push("Say which part of the care or prescribing is in question, so the right clinical reviewer can be found.");
  if (category === "confidentiality" && !/\b(disclos|shared|sent|seen|access|breach)/.test(t)) tips.push("Say what information is thought to have been shared or seen, and by whom (role, not name).");
  if (!String(desiredOutcome || "").trim()) tips.push("Fill in Desired outcome below if you know what the person wants from this.");
  return tips;
}

// { ok: true, text, removed: [{ kind, text, label }], tips } or { ok: false, reason }
export function suggestConcernSummary({ summary, category, priority, desiredOutcome, allow = [] } = {}) {
  const raw = String(summary || "").trim();
  if (words(raw) < 2) return { ok: false, reason: "Type a few words about what the concern is about first, then ask again." };

  const problems = findSummaryIdentifiers(raw, { allow });
  let body = tidy(removeIdentifiers(raw, problems));
  const first = body.split(/(?<=[.?])\s+/);
  first[0] = capitalise(openingSentence(first[0]));
  body = first.join(" ");

  const label = CATEGORY_LABELS[category] ?? "";
  const text = label && !body.toLowerCase().startsWith(label.toLowerCase()) ? `${label} concern. ${body}` : body;

  // belt and braces: whatever is suggested must itself pass the check
  const left = findSummaryIdentifiers(text, { allow });
  if (left.length) return { ok: false, reason: "Ask Primovex could not make an anonymised version of this. Please take out any names or personal details and try again." };

  return {
    ok: true,
    text,
    removed: problems.map((p) => ({ ...p, label: KIND_WORDS[p.kind] || "a personal detail" })),
    tips: tipsFor(text, { category, priority, desiredOutcome }),
    unchanged: text === raw,
  };
}
