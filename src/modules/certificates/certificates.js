// Certificates and servicing register: the gas safety certificate, the electrical test, the fire risk assessment, the
// extinguisher service and so on, each with who did it, when, when it runs out, and the PDF. The point is that nothing
// quietly expires. Pure rules (no Firestore, no screens).

import { addMonths, dateKey, parseDateKey } from "../coshh/coshh.js";

export const WARN_DAYS = 60; // "due soon" this many days before it runs out, so there is time to book the contractor

// months: how long the usual one lasts, used only to suggest the expiry from the date it was done
export const CERT_TYPES = [
  { key: "gas_safety", label: "Gas safety certificate", months: 12 },
  { key: "eicr", label: "Fixed electrical wiring test (EICR)", months: 60 },
  { key: "fire_risk_assessment", label: "Fire risk assessment (review)", months: 12 },
  { key: "fire_extinguisher_service", label: "Fire extinguisher service", months: 12 },
  { key: "emergency_lighting_cert", label: "Emergency lighting certificate", months: 12 },
  { key: "fire_alarm_service", label: "Fire alarm servicing", months: 6 },
  { key: "legionella_risk_assessment", label: "Legionella risk assessment (review)", months: 24 },
  { key: "asbestos_survey", label: "Asbestos survey (review)", months: 12 },
  { key: "lift_loler", label: "Lift inspection (LOLER)", months: 6 },
  { key: "boiler_service", label: "Boiler service", months: 12 },
  { key: "insurance_el", label: "Employers' liability insurance", months: 12 },
  { key: "other", label: "Other certificate or service", months: 12 },
];

const trim = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const typeOf = (key) => CERT_TYPES.find((t) => t.key === key) || CERT_TYPES.at(-1);

export const certLabel = (cert) => (cert?.type === "other" && trim(cert?.name, 80)) || typeOf(cert?.type).label;

// ---------- the checks a certificate records ----------
// Besides who and when, many certificates record RESULTS: the engineer who did it, and pass/fail or yes/no checks ("Gas supply tightness test: Pass", "Boiler safe to use: No").
// A check is { label, answer, problem }: what it is called on the document, the answer as written, and whether that answer means something is wrong. A certificate with a problem
// check is flagged however far off its expiry is, because "boiler safe to use: No" is not made better by being in date.
export const ANSWERS = ["Yes", "No", "Pass", "Fail", "Satisfactory", "Unsatisfactory", "Safe", "Unsafe", "None", "N/A"];
export const COMMON_CHECKS = ["Gas supply tightness test", "Boiler safe to use", "Appliance safe to use", "Flue and ventilation satisfactory", "Carbon monoxide alarm fitted", "Overall assessment", "Defects found", "Panel fault found"];
export const MAX_CHECKS = 12;

const words = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const NEGATIVE_ANSWER = /^(fail|failed|failure|unsafe|unsatisfactory|not satisfactory|not safe|not safe to use|dangerous|immediately dangerous|at risk|danger present|potentially dangerous)( |$)/;
// a plain pass; "Satisfactory with advisories" and the like are NOT plain, so they are left to the AI's reading
const POSITIVE_ANSWER = /^(pass|passed)( |$)|^(satisfactory|safe|safe to use|ok|compliant|none|n a|not applicable|nil)$/;
const GOOD_THING = /\b(safe|satisfactory|pass|passed|compliant|working|operating|serviceable|fit|acceptable|tight|sound)\b/;
const BAD_THING = /\b(defect|defects|fault|faults|leak|leaks|danger|dangerous|fail|failed|unsafe|escape|spillage|damage|corrosion|remedial|action required|requiring action|requires action|non compliant|noncompliant)\b/;

// Does this answer mean something is wrong? Unambiguous answers decide it ("Fail", "Unsatisfactory", "Pass"); a yes or no depends on what was asked ("Boiler safe to use: No" is a problem,
// "Panel fault found: No" is not, "Defects found: Yes" is); anything else is left to `modelSays` (the AI's own reading), else it is not a problem. The same rule is on the server (checked by a test).
export function judgeCheck(label, answer, modelSays = null) {
  const a = words(answer);
  const l = words(label);
  if (NEGATIVE_ANSWER.test(a)) return true;
  if (POSITIVE_ANSWER.test(a)) return false;
  if (a === "no" || a.startsWith("no ") || a === "not") return GOOD_THING.test(l) && !BAD_THING.test(l);
  if (a === "yes" || a.startsWith("yes ")) return BAD_THING.test(l);
  return modelSays === true;
}

// a clean list of checks: wording trimmed, answers kept short, at most MAX_CHECKS, and nothing without a name
export function cleanChecks(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => ({ label: trim(c?.label, 80), answer: trim(c?.answer, 30), problem: c?.problem === true }))
    .filter((c) => c.label && c.answer)
    .slice(0, MAX_CHECKS);
}
export const problemChecks = (cert) => cleanChecks(cert?.findings).filter((c) => c.problem);
export const hasProblem = (cert) => problemChecks(cert).length > 0;
export const checkText = (c) => `${c.label}: ${c.answer}`;

export const emptyCertificate = () => ({
  id: "", type: "gas_safety", name: "", site: "", provider: "", engineer: "", findings: [], reference: "", completedOn: "", expiryDate: "",
  certUrl: "", certPath: "", certFileName: "", active: true, previous: [],
});

export function normaliseCertificate(id, data = {}) {
  return {
    ...emptyCertificate(),
    id,
    type: CERT_TYPES.some((t) => t.key === data.type) ? data.type : "other",
    name: trim(data.name, 80),
    site: trim(data.site, 120),
    provider: trim(data.provider, 120),
    engineer: trim(data.engineer, 80),
    findings: cleanChecks(data.findings),
    reference: trim(data.reference, 80),
    completedOn: parseDateKey(data.completedOn) ? data.completedOn : "",
    expiryDate: parseDateKey(data.expiryDate) ? data.expiryDate : "",
    certUrl: String(data.certUrl || ""),
    certPath: String(data.certPath || ""),
    certFileName: String(data.certFileName || ""),
    active: data.active !== false,
    previous: Array.isArray(data.previous) ? data.previous : [],
    lastRenewedByName: data.lastRenewedByName || "",
    retiredReason: data.retiredReason || "",
  };
}

// the usual expiry for a certificate of this type done on this day
export function suggestedExpiry(type, completedOn) {
  return completedOn ? addMonths(completedOn, typeOf(type).months) : "";
}

export function validateCertificate(form) {
  const problems = [];
  if (!CERT_TYPES.some((t) => t.key === form?.type)) problems.push("Choose what kind of certificate it is.");
  if (form?.type === "other" && !trim(form?.name, 80)) problems.push("Say what this certificate or service is.");
  if (!trim(form?.site, 120)) problems.push("Choose the site it covers.");
  if (!trim(form?.provider, 120)) problems.push("Choose who did it (the contractor or insurer).");
  if (form?.completedOn && !parseDateKey(form.completedOn)) problems.push("The date it was done isn't a date.");
  if (!parseDateKey(form?.expiryDate)) problems.push("Set the date it runs out or is next due.");
  if (form?.completedOn && form?.expiryDate && form.expiryDate < form.completedOn) problems.push("It can't run out before it was done.");
  if (!form?.certUrl) problems.push("Attach the certificate (PDF).");
  return problems;
}

// the document written to Firestore: only the known fields
export function toRecord(form) {
  const c = normaliseCertificate(form.id, form);
  return {
    type: c.type, name: c.type === "other" ? c.name : "", site: c.site, provider: c.provider, engineer: c.engineer, findings: c.findings, reference: c.reference,
    completedOn: c.completedOn, expiryDate: c.expiryDate, certUrl: c.certUrl, certPath: c.certPath, certFileName: c.certFileName, active: c.active,
  };
}

export function daysUntilExpiry(cert, now = new Date()) {
  const due = parseDateKey(cert?.expiryDate);
  if (!due) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// missing = no date, expired = past it, due-soon = within the warning window, ok
export function certStatus(cert, now = new Date(), warnDays = WARN_DAYS) {
  const days = daysUntilExpiry(cert, now);
  if (days === null) return "missing";
  if (days < 0) return "expired";
  if (days <= warnDays) return "due-soon";
  return "ok";
}

export const STATUS_LABEL = { expired: "Expired", "due-soon": "Running out", missing: "No date", ok: "In date" };

export function expiryText(cert, now = new Date()) {
  const days = daysUntilExpiry(cert, now);
  if (days === null) return "No expiry date set";
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Runs out today";
  return `Runs out in ${days} day${days === 1 ? "" : "s"}`;
}

const RANK = { expired: 0, missing: 1, "due-soon": 2, ok: 3 };
const rankOf = (c, now) => (hasProblem(c) ? -1 : RANK[certStatus(c, now)]);
export function sortCertificates(list, now = new Date()) {
  return [...list].sort((a, b) => rankOf(a, now) - rankOf(b, now) || (a.expiryDate || "9999").localeCompare(b.expiryDate || "9999") || certLabel(a).localeCompare(certLabel(b)));
}

export function certSummary(list, now = new Date()) {
  const live = list.filter((c) => c.active !== false);
  const count = (status) => live.filter((c) => certStatus(c, now) === status).length;
  const expired = count("expired") + count("missing");
  const dueSoon = count("due-soon");
  const problems = live.filter(hasProblem).length;
  // needing attention: expired, missing a date, running out, or recording a problem (counted once)
  const needsAttention = live.filter((c) => certStatus(c, now) !== "ok" || hasProblem(c)).length;
  return { total: live.length, expired, dueSoon, problems, noPdf: live.filter((c) => !c.certUrl).length, ok: count("ok"), needsAttention };
}

// A renewal: the new date it was done and next due, a new PDF, and the old one kept as history.
//   { patch, previousEntry } the caller writes patch and appends previousEntry to `previous`
export function renewal(cert, { completedOn, expiryDate, provider, reference, engineer = "", findings = [], certUrl, certPath, certFileName }, actor = {}, now = new Date()) {
  const problems = [];
  if (!parseDateKey(completedOn)) problems.push("Enter the date it was done.");
  if (!parseDateKey(expiryDate)) problems.push("Set the new date it runs out.");
  if (completedOn && expiryDate && expiryDate < completedOn) problems.push("It can't run out before it was done.");
  if (parseDateKey(cert?.expiryDate) && parseDateKey(expiryDate) && expiryDate <= cert.expiryDate) problems.push("The new date has to be later than the one it replaces.");
  if (!certUrl) problems.push("Attach the new certificate (PDF).");
  if (problems.length) throw new Error(problems[0]);
  const by = trim(actor.displayName || actor.name || actor.email, 80) || "Unknown";
  return {
    patch: { completedOn, expiryDate, provider: trim(provider, 120) || cert.provider, reference: trim(reference, 80), engineer: trim(engineer, 80), findings: cleanChecks(findings), certUrl, certPath, certFileName, lastRenewedByName: by, lastRenewedOn: dateKey(now) },
    previousEntry: { completedOn: cert.completedOn || "", expiryDate: cert.expiryDate || "", provider: cert.provider || "", engineer: cert.engineer || "", findings: cleanChecks(cert.findings), reference: cert.reference || "", certUrl: cert.certUrl || "", certPath: cert.certPath || "", certFileName: cert.certFileName || "", replacedOn: dateKey(now), replacedBy: by },
  };
}

export function searchCertificates(list, text) {
  const words = String(text || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((c) => words.every((w) => `${certLabel(c)} ${c.provider} ${c.engineer || ""} ${c.site} ${c.reference}`.toLowerCase().includes(w)));
}

// the register on paper: one row per certificate, for the inspector or the contractor
export function registerRows(list, now = new Date()) {
  return sortCertificates(list.filter((c) => c.active !== false), now).map((c) => ({
    what: certLabel(c), site: c.site, provider: c.provider, engineer: c.engineer || "", reference: c.reference, done: c.completedOn, expires: c.expiryDate, status: STATUS_LABEL[certStatus(c, now)], hasPdf: Boolean(c.certUrl),
    problem: hasProblem(c), result: hasProblem(c) ? `PROBLEM: ${problemChecks(c).map(checkText).join("; ")}` : cleanChecks(c.findings).length ? "No problems recorded" : "",
  }));
}
