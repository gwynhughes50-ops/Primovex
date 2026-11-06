import { CERT_TYPES, cleanChecks, emptyCertificate, suggestedExpiry } from "../certificates/certificates.js";
import { FIRST_AID_OPTIONS, HAZARD_TYPES, PPE_OPTIONS, emptySubstance, firstAidLabel, hazardLabel, nextReviewFrom, dateKey, ppeLabel } from "../coshh/coshh.js";

// Document intake, the app's side: turn what the server read from a dropped certificate or COSHH safety data sheet into a pre-filled form
// and a "what was read" panel. Pure (no Firestore, no screens) so it can be tested.
//
// The rules this keeps:
//  - the AI only suggests. Everything lands on the normal register form, and the person must tick that they have checked it against the document.
//  - a text or date value is pre-filled even when it could not be confirmed (marked "Check this"), because it is easy to see and fix;
//    a hazard, protective item or first-aid step is pre-filled ONLY when the document's own words back it, because a missed hazard is the dangerous mistake.
//  - a site or supplier is only pre-filled when it matches one on the practice's own list; otherwise the person picks it.

export const INTAKE_KINDS = [
  { key: "auto", label: "Let Primovex work out what it is" },
  { key: "certificate", label: "Certificate, test or service record" },
  { key: "coshh", label: "COSHH safety data sheet" },
];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

// the lists the server may choose from: the same ones the register forms offer
export function intakeOptions() {
  const list = (items) => items.map(({ key, label }) => ({ key, label }));
  return { certTypes: list(CERT_TYPES), hazards: list(HAZARD_TYPES), ppe: list(PPE_OPTIONS), firstAid: list(FIRST_AID_OPTIONS) };
}

export const ukDay = (key) => (/^\d{4}-\d{2}-\d{2}$/.test(String(key || "")) ? String(key).split("-").reverse().join("/") : "");
const norm = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// the ONE name on the practice's own list that this text is (or contains, or is part of); none if there are none or several
export function matchName(text, names = []) {
  const wanted = norm(text);
  if (wanted.length < 3) return "";
  const exact = names.filter((name) => norm(name) === wanted);
  if (exact.length === 1) return exact[0];
  const near = names.filter((name) => { const n = norm(name); return n.length >= 3 && (wanted.includes(n) || n.includes(wanted)); });
  return near.length === 1 ? near[0] : "";
}

const statusOf = (field) => (field?.value ? (field.verified ? "found" : "check") : "missing");
export const STATUS_WORDS = { found: "Read from the document", check: "Check this: not confirmed in the document's text", missing: "Not found on the document" };

function row(key, label, field, display) {
  const status = statusOf(field);
  return { key, label, status, display: status === "missing" ? "" : display, evidence: field?.evidence || "" };
}

// ---------- a certificate ----------
export function certificateCard(result, { siteNames = [], supplierNames = [] } = {}) {
  const f = result?.fields || {};
  const typeKnown = CERT_TYPES.some((t) => t.key === f.type?.value);
  const provider = f.provider?.value ? matchName(f.provider.value, supplierNames) || f.provider.value : "";
  const site = f.premises?.value ? matchName(f.premises.value, siteNames) : "";
  const initial = {
    ...emptyCertificate(),
    // an unrecognised type is "Other", so the person has to say what it is, rather than it quietly becoming a gas certificate
    type: typeKnown ? f.type.value : "other",
    provider,
    reference: f.reference?.value || "",
    completedOn: f.completedOn?.value || "",
    expiryDate: f.expiryDate?.value || "",
    site,
    engineer: f.engineer?.value || "",
    // The checks the certificate records. One that is a PROBLEM is always put on the form, confirmed or not: missing a failed or unsafe result is the dangerous mistake, and a false
    // alarm is easy to remove. One that is fine is put on only when the document's own words back it.
    findings: cleanChecks((f.findings || []).filter((c) => c.problem || c.verified)),
  };
  const typeLabel = typeKnown ? CERT_TYPES.find((t) => t.key === f.type.value).label : "";
  const rows = [
    row("type", "Kind of certificate", f.type, typeLabel),
    row("provider", "Done by", f.provider, f.provider?.value),
    row("reference", "Certificate number", f.reference, f.reference?.value),
    row("completedOn", "Date it was done", f.completedOn, ukDay(f.completedOn?.value)),
    row("expiryDate", "Runs out or next due", f.expiryDate, ukDay(f.expiryDate?.value)),
    { ...row("premises", "Site or address on it", f.premises, f.premises?.value), note: f.premises?.value ? (site ? `Matched to your site "${site}".` : "Not matched to one of your sites: choose the site yourself.") : "" },
  ];
  // No expiry written on it: the form's own usual length for this kind is filled in so there is something to check, and it is said plainly that it is not from the document
  rows.push(row("engineer", "Engineer", f.engineer, f.engineer?.value));
  const checks = f.findings || [];
  for (const [i, c] of checks.entries()) {
    rows.push({
      key: `check:${i}`, label: c.label, status: c.verified ? "found" : "check", display: c.problem ? `${c.answer}: this is a problem` : c.answer, evidence: c.evidence || "",
      note: c.problem ? (c.verified ? "This answer means something is wrong, unsafe or failed. It has been added to the form." : "This looks like a problem, but the document's words do not confirm it. It has been added to the form: check the document.")
        : c.verified ? "" : "Not added for you, because the document's words do not back it. Add it yourself if it is on the document.",
    });
  }
  if (!f.expiryDate?.value) {
    const suggested = typeKnown && initial.completedOn ? suggestedExpiry(initial.type, initial.completedOn) : "";
    initial.expiryDate = suggested;
    rows[4] = { ...rows[4], status: suggested ? "check" : "missing", display: suggested ? ukDay(suggested) : "", note: suggested ? "No expiry or next-due date is written on the document. This is the usual length for this kind, worked out from the date it was done: check it." : "No expiry or next-due date is written on the document. Set it yourself." };
  }
  // a failed or unsafe result is said loudly, above everything else
  const alerts = checks.filter((c) => c.problem).map((c) => `${c.label}: ${c.answer}`);
  return { kind: "certificate", initial, evidence: { kind: "certificate", title: "What was read from the certificate", rows, warnings: (result?.warnings || []).filter((w) => !/failed or unsafe result/.test(w)), alerts, fileName: result?.fileName || "" } };
}

// ---------- a COSHH safety data sheet ----------
export function coshhCard(result, { supplierNames = [], today = new Date() } = {}) {
  const f = result?.fields || {};
  const verifiedKeys = (picks) => (picks || []).filter((p) => p.verified).map((p) => p.key);
  const hazards = f.notHazardous?.value ? ["none"] : verifiedKeys(f.hazards);
  const supplier = f.supplier?.value ? matchName(f.supplier.value, supplierNames) : "";
  const initial = {
    ...emptySubstance(),
    name: f.productName?.value || "",
    supplier,
    hazards,
    ppe: verifiedKeys(f.ppe),
    firstAid: verifiedKeys(f.firstAid),
    reviewDate: nextReviewFrom(dateKey(today)),
  };
  const pickRows = (key, label, picks, labelOf, prefilled) => {
    const list = picks || [];
    if (!list.length) return [{ key, label, status: "missing", display: "", evidence: "", note: "Nothing found on the document. Choose from the list." }];
    return list.map((p) => ({
      key: `${key}:${p.key}`, label, status: p.verified ? "found" : "check", display: labelOf(p.key), evidence: p.evidence || "",
      note: p.verified ? (prefilled.includes(p.key) ? "Ticked for you." : "") : "Not ticked for you, because the document's words do not back it. Decide yourself.",
    }));
  };
  const rows = [
    { ...row("productName", "Product name", f.productName, f.productName?.value) },
    { ...row("supplier", "Supplier", f.supplier, f.supplier?.value), note: f.supplier?.value ? (supplier ? `Matched to your supplier "${supplier}".` : "Not on your supplier list: choose one, or add the supplier first.") : "" },
  ];
  if (f.notHazardous?.value) rows.push({ key: "notHazardous", label: "Hazards", status: "found", display: "The sheet says it is not classified as hazardous", evidence: f.notHazardous.evidence || "", note: "Read section 2 yourself before relying on this." });
  else rows.push(...pickRows("hazards", "Hazard", f.hazards, hazardLabel, initial.hazards));
  rows.push(...pickRows("ppe", "Protection", f.ppe, ppeLabel, initial.ppe), ...pickRows("firstAid", "First aid", f.firstAid, firstAidLabel, initial.firstAid));
  return { kind: "coshh", initial, evidence: { kind: "coshh", title: "What was read from the safety data sheet", rows, warnings: result?.warnings || [], fileName: result?.fileName || "" } };
}

// the pre-filled card for whatever the server found, or null when it is neither
export function cardFor(result, lists = {}) {
  if (result?.kind === "certificate") return certificateCard(result, lists);
  if (result?.kind === "coshh") return coshhCard(result, lists);
  return null;
}

// how many rows still need the person's eyes
export const needsChecking = (evidence) => (evidence?.rows || []).filter((r) => r.status !== "found").length;

// ---------- a photo as a PDF ----------
// A phone photo (a JPEG) wrapped in a one-page A4 PDF, so it can be kept in the register like any other certificate. The picture fits the page with a margin and is not altered.
const enc = new TextEncoder();
const bytesOf = (text) => enc.encode(text);

export function imageToPdf(jpeg, width, height) {
  const w = Math.max(1, Math.floor(Number(width) || 0));
  const h = Math.max(1, Math.floor(Number(height) || 0));
  if (!(jpeg instanceof Uint8Array) || jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("That is not a JPEG photo.");
  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 24;
  const scale = Math.min((PAGE_W - 2 * MARGIN) / w, (PAGE_H - 2 * MARGIN) / h);
  const drawW = +(w * scale).toFixed(2);
  const drawH = +(h * scale).toFixed(2);
  const x = +((PAGE_W - drawW) / 2).toFixed(2);
  const y = +((PAGE_H - drawH) / 2).toFixed(2);
  const content = `q ${drawW} 0 0 ${drawH} ${x} ${y} cm /Im0 Do Q`;

  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => { const b = chunk instanceof Uint8Array ? chunk : bytesOf(chunk); parts.push(b); length += b.length; };
  const object = (n, head, stream) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${head}\n`);
    if (stream) { push("stream\n"); push(stream); push("\nendstream\n"); }
    push("endobj\n");
  };
  push("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  object(5, `<< /Length ${bytesOf(content).length} >>`, bytesOf(content));
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const b of parts) { out.set(b, at); at += b.length; }
  return out;
}

// what a failure from the server means to the person
export function describeProblem(error) {
  const code = String(error?.code || "").replace("functions/", "");
  const message = String(error?.message || "");
  if (code === "permission-denied") return message && !/^permission/i.test(message) ? message : "Document reading is not switched on for you.";
  if (code === "failed-precondition") return message || "That document could not be read.";
  if (code === "invalid-argument") return message || "That file cannot be read.";
  if (code === "resource-exhausted") return "That is the most documents one person can read in a day. Try again tomorrow, or fill the form in by hand.";
  if (code === "unauthenticated") return "Sign in again, then try once more.";
  return "That document could not be read just now. Try again, or fill the form in by hand.";
}

// ---------- a renewal of something already on the register ----------
// The active certificate this one probably renews: the same kind, at the same site (a site the document did not name is never guessed), and for "Other" the same name.
// If several fit, the one running out last. Used to offer "Renew it" so the register does not end up with two gas safety records.
export function findRenewalTarget(certificates = [], initial = {}) {
  if (!initial.type || !initial.site) return null;
  const same = (certificates || []).filter((c) => c && c.active !== false && c.type === initial.type && c.site === initial.site
    && (initial.type !== "other" || (norm(c.name) && norm(c.name) === norm(initial.name))));
  if (!same.length) return null;
  return [...same].sort((a, b) => String(b.expiryDate || "").localeCompare(String(a.expiryDate || "")))[0];
}
