import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { INTAKE_KINDS, cardFor, certificateCard, coshhCard, describeProblem, findRenewalTarget, imageToPdf, intakeOptions, matchName, needsChecking, ukDay } from "../src/modules/documents/documentIntake.js";
import { CERT_TYPES, validateCertificate } from "../src/modules/certificates/certificates.js";
import { FIRST_AID_OPTIONS, HAZARD_TYPES, PPE_OPTIONS, validateSubstance } from "../src/modules/coshh/coshh.js";

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };
const f = (value, evidence, verified = true) => ({ value, evidence, verified });
const SITES = ["Main Surgery", "Branch Surgery"];
const SUPPLIERS = ["Northern Gas Services Ltd", "CleanChem UK Ltd"];

const certResult = (over = {}) => ({
  kind: "certificate", fileName: "gas.pdf", warnings: [],
  fields: {
    type: f("gas_safety", "GAS SAFETY RECORD"), provider: f("Northern Gas Services", "Carried out by: Northern Gas Services"), reference: f("GSR-48213", "Certificate number: GSR-48213"),
    completedOn: f("2026-10-14", "Date of inspection: 14/10/2026"), expiryDate: f("2027-10-13", "Next inspection due by: 13 October 2027"), premises: f("Main Surgery, 1 High Street", "Premises: Main Surgery, 1 High Street"),
    ...over,
  },
});

await t("the lists sent to the server are the register forms' own, and every key is one the server accepts", () => {
  const o = intakeOptions();
  assert.deepEqual(o.certTypes.map((x) => x.key), CERT_TYPES.map((x) => x.key));
  assert.deepEqual(o.hazards.map((x) => x.key), HAZARD_TYPES.map((x) => x.key));
  assert.deepEqual(o.ppe.map((x) => x.key), PPE_OPTIONS.map((x) => x.key));
  assert.deepEqual(o.firstAid.map((x) => x.key), FIRST_AID_OPTIONS.map((x) => x.key));
  for (const x of [...o.certTypes, ...o.hazards, ...o.ppe, ...o.firstAid]) assert.match(x.key, /^[a-z0-9_-]{1,40}$/, x.key);
  assert.deepEqual(INTAKE_KINDS.map((k) => k.key), ["auto", "certificate", "coshh"]);
});

await t("a certificate pre-fills the register form, matching your own supplier and site names", () => {
  const card = certificateCard(certResult(), { siteNames: SITES, supplierNames: SUPPLIERS });
  assert.equal(card.initial.type, "gas_safety");
  assert.equal(card.initial.provider, "Northern Gas Services Ltd", "the supplier is the one on your list, not the way the certificate spells it");
  assert.equal(card.initial.site, "Main Surgery");
  assert.equal(card.initial.reference, "GSR-48213");
  assert.equal(card.initial.completedOn, "2026-10-14");
  assert.equal(card.initial.expiryDate, "2027-10-13");
  assert.ok(card.evidence.rows.every((r) => r.status === "found"));
  assert.equal(needsChecking(card.evidence), 0);
  assert.equal(card.evidence.rows.find((r) => r.key === "completedOn").display, "14/10/2026");
});

await t("an unrecognised kind becomes 'Other', so the person has to name it; an unmatched site or supplier is left for them to choose", () => {
  const card = certificateCard(certResult({ type: f(null, null, false), premises: f("Somewhere Else Entirely", "Premises: Somewhere Else Entirely"), provider: f("Unknown Contractor Ltd", "Carried out by: Unknown Contractor Ltd") }), { siteNames: SITES, supplierNames: SUPPLIERS });
  assert.equal(card.initial.type, "other");
  assert.equal(card.initial.site, "");
  assert.equal(card.initial.provider, "Unknown Contractor Ltd", "kept as written, offered as 'someone not in the list'");
  assert.match(card.evidence.rows.find((r) => r.key === "premises").note, /choose the site yourself/);
  assert.equal(card.evidence.rows.find((r) => r.key === "type").status, "missing");
});

await t("a date that could not be confirmed is pre-filled but marked 'Check this'; a missing expiry is filled with the usual length and said NOT to come from the document", () => {
  const card = certificateCard(certResult({ completedOn: f("2026-10-14", "Date of inspection: 15/10/2026", false), expiryDate: f(null, null, false) }), { siteNames: SITES, supplierNames: SUPPLIERS });
  assert.equal(card.initial.completedOn, "2026-10-14");
  assert.equal(card.evidence.rows.find((r) => r.key === "completedOn").status, "check");
  const expiry = card.evidence.rows.find((r) => r.key === "expiryDate");
  assert.equal(card.initial.expiryDate, "2027-10-14", "the usual 12 months for a gas safety certificate");
  assert.equal(expiry.status, "check", "never shown as found: it is not on the document");
  assert.equal(expiry.display, "14/10/2027");
  assert.match(expiry.note, /No expiry or next-due date is written on the document/);
  assert.equal(expiry.evidence, "", "there is no quote, because there is nothing on the document");
  assert.equal(needsChecking(card.evidence), 2);
  const noDate = certificateCard(certResult({ completedOn: f(null, null, false), expiryDate: f(null, null, false) }), { siteNames: SITES });
  assert.equal(noDate.initial.expiryDate, "", "nothing to work it out from");
  assert.equal(noDate.evidence.rows.find((r) => r.key === "expiryDate").status, "missing");
  const unknownType = certificateCard(certResult({ type: f(null, null, false), expiryDate: f(null, null, false) }), { siteNames: SITES });
  assert.equal(unknownType.initial.expiryDate, "", "no usual length for a kind that is not known");
});

await t("once the person adds what a document cannot give (the site, the PDF), the pre-filled certificate passes the register's own checks", () => {
  const card = certificateCard(certResult({ premises: f(null, null, false) }), { siteNames: SITES, supplierNames: SUPPLIERS });
  assert.deepEqual(validateCertificate({ ...card.initial, certUrl: "pending" }), ["Choose the site it covers."]);
  assert.deepEqual(validateCertificate({ ...card.initial, site: "Main Surgery", certUrl: "pending" }), []);
});

const sdsResult = (over = {}) => ({
  kind: "coshh", fileName: "sds.pdf", warnings: [],
  fields: {
    productName: f("Hospital Surface Cleaner", "Product name: Hospital Surface Cleaner"), supplier: f("CleanChem UK Ltd", "Supplier: CleanChem UK Ltd"),
    hazards: [{ key: "flammable", evidence: "H226 Flammable liquid", verified: true }, { key: "irritant", evidence: null, verified: false }],
    notHazardous: { value: false, evidence: null, verified: false },
    ppe: [{ key: "gloves", evidence: "Wear protective gloves", verified: true }],
    firstAid: [{ key: "eyes", evidence: "eye contact rinse", verified: true }],
    ...over,
  },
});

await t("a safety data sheet ticks only the hazards, protection and first aid the document's own words back", () => {
  const card = coshhCard(sdsResult(), { supplierNames: SUPPLIERS, today: new Date(2026, 10, 6) });
  assert.equal(card.initial.name, "Hospital Surface Cleaner");
  assert.equal(card.initial.supplier, "CleanChem UK Ltd");
  assert.deepEqual(card.initial.hazards, ["flammable"], "the unconfirmed 'irritant' is NOT ticked");
  assert.deepEqual(card.initial.ppe, ["gloves"]);
  assert.deepEqual(card.initial.firstAid, ["eyes"]);
  assert.equal(card.initial.reviewDate, "2027-11-06");
  const irritant = card.evidence.rows.find((r) => r.key === "hazards:irritant");
  assert.equal(irritant.status, "check");
  assert.match(irritant.note, /Not ticked for you/);
  assert.match(card.evidence.rows.find((r) => r.key === "hazards:flammable").note, /Ticked for you/);
});

await t("'not classified as hazardous' ticks that one option, with a prompt to read section 2; nothing found is said plainly", () => {
  const safe = coshhCard(sdsResult({ notHazardous: { value: true, evidence: "Not a hazardous substance", verified: true }, hazards: [] }), { supplierNames: SUPPLIERS });
  assert.deepEqual(safe.initial.hazards, ["none"]);
  assert.match(safe.evidence.rows.find((r) => r.key === "notHazardous").note, /Read section 2 yourself/);
  const empty = coshhCard(sdsResult({ hazards: [], ppe: [], firstAid: [] }), { supplierNames: SUPPLIERS });
  assert.deepEqual([empty.initial.hazards, empty.initial.ppe, empty.initial.firstAid], [[], [], []]);
  assert.equal(empty.evidence.rows.find((r) => r.key === "hazards").status, "missing");
});

await t("an unlisted supplier is left for the person to choose, and the pre-filled sheet needs the rest before it passes the register's checks", () => {
  const card = coshhCard(sdsResult({ supplier: f("Some Other Chemicals Ltd", "Supplier: Some Other Chemicals Ltd") }), { supplierNames: SUPPLIERS });
  assert.equal(card.initial.supplier, "");
  assert.match(card.evidence.rows.find((r) => r.key === "supplier").note, /Not on your supplier list/);
  const good = coshhCard(sdsResult(), { supplierNames: SUPPLIERS });
  const problems = validateSubstance({ ...good.initial, location: "Cleaning cupboard", sdsUrl: "pending" });
  assert.deepEqual(problems, [], "name, supplier, hazard, protection, first aid and review date are all filled");
  assert.ok(validateSubstance({ ...good.initial, sdsUrl: "pending" }).some((p) => /where it is stored/.test(p)), "the storage place is the person's to choose");
});

await t("anything that is not a certificate or a data sheet has no card", () => {
  assert.equal(cardFor({ kind: "other", fields: {} }), null);
  assert.equal(cardFor(null), null);
  assert.equal(cardFor(certResult(), { siteNames: SITES }).kind, "certificate");
  assert.equal(cardFor(sdsResult(), {}).kind, "coshh");
});

await t("names are matched only when exactly one of the practice's own names fits", () => {
  assert.equal(matchName("main surgery", SITES), "Main Surgery");
  assert.equal(matchName("The Main Surgery, 1 High St", SITES), "Main Surgery");
  assert.equal(matchName("Surgery", SITES), "", "two sites contain 'surgery': not guessed");
  assert.equal(matchName("", SITES), "");
  assert.equal(matchName("ab", ["Ab"]), "", "too short to trust");
  assert.equal(ukDay("2027-10-13"), "13/10/2027");
  assert.equal(ukDay("nonsense"), "");
});

await t("a phone photo becomes a valid one-page PDF with the picture inside it, unaltered", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  const pdf = imageToPdf(jpeg, 3024, 4032);
  const text = Buffer.from(pdf).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text, /\/Filter \/DCTDecode \/Length 22 /);
  // every cross-reference entry points at its own object
  const xref = text.slice(text.indexOf("xref\n0 6\n"));
  const entries = [...xref.matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
  assert.equal(entries.length, 5);
  entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
  assert.equal(Number(/startxref\n(\d+)/.exec(text)[1]), text.indexOf("xref\n0 6\n"));
  const doc = await PDFDocument.load(pdf);
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()], [595, 842]);
  // the bytes of the photo are in the file exactly as they came
  assert.ok(Buffer.from(pdf).includes(Buffer.from(jpeg)));
});

await t("the photo fits the page with a margin whatever its shape, and a file that is not a JPEG is refused", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  for (const [w, h] of [[4000, 3000], [3000, 4000], [500, 500], [10, 5000]]) {
    const text = Buffer.from(imageToPdf(jpeg, w, h)).toString("latin1");
    const [, dw, dh, x, y] = /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/.exec(text).map(Number);
    assert.ok(x >= 23.9 && y >= 23.9, `${w}x${h} stays inside the margin`);
    assert.ok(x + dw <= 595 - 23.9 && y + dh <= 842 - 23.9, `${w}x${h} stays on the page`);
    assert.ok(Math.abs(dw / dh - w / h) < 0.02, `${w}x${h} keeps its shape`);
  }
  assert.throws(() => imageToPdf(new Uint8Array([1, 2, 3, 4]), 10, 10), /not a JPEG/);
  assert.throws(() => imageToPdf("text", 10, 10), /not a JPEG/);
});

await t("a failure from the server is put in words the person can act on", () => {
  assert.match(describeProblem({ code: "functions/permission-denied", message: "Document reading is switched off for this practice." }), /switched off/);
  assert.match(describeProblem({ code: "permission-denied", message: "permission-denied" }), /not switched on for you/);
  assert.match(describeProblem({ code: "functions/failed-precondition", message: "I could not read any text from that." }), /could not read any text/);
  assert.match(describeProblem({ code: "functions/resource-exhausted" }), /most documents/);
  assert.match(describeProblem({ code: "functions/internal", message: "INTERNAL" }), /fill the form in by hand/);
  assert.match(describeProblem(new Error("boom")), /fill the form in by hand/);
});

await t("a certificate is offered as a renewal only when it is the same kind at the same site as an active one", () => {
  const regs = [
    { id: "a", type: "gas_safety", site: "Main Surgery", expiryDate: "2026-10-01", active: true },
    { id: "b", type: "gas_safety", site: "Main Surgery", expiryDate: "2025-10-01", active: true },
    { id: "c", type: "gas_safety", site: "Branch Surgery", expiryDate: "2027-01-01", active: true },
    { id: "d", type: "eicr", site: "Main Surgery", expiryDate: "2030-01-01", active: true },
    { id: "e", type: "gas_safety", site: "Main Surgery", expiryDate: "2030-01-01", active: false },
    { id: "f", type: "other", name: "Pest control contract", site: "Main Surgery", expiryDate: "2026-12-01", active: true },
  ];
  assert.equal(findRenewalTarget(regs, { type: "gas_safety", site: "Main Surgery" }).id, "a", "the one running out last, not a retired one");
  assert.equal(findRenewalTarget(regs, { type: "gas_safety", site: "Branch Surgery" }).id, "c");
  assert.equal(findRenewalTarget(regs, { type: "boiler_service", site: "Main Surgery" }), null);
  assert.equal(findRenewalTarget(regs, { type: "gas_safety", site: "" }), null, "no site named, so nothing is guessed");
  assert.equal(findRenewalTarget(regs, { type: "gas_safety", site: "Nowhere" }), null);
  assert.equal(findRenewalTarget(regs, { type: "other", name: "pest control contract", site: "Main Surgery" }).id, "f");
  assert.equal(findRenewalTarget(regs, { type: "other", name: "Window cleaning", site: "Main Surgery" }), null);
  assert.equal(findRenewalTarget([], { type: "gas_safety", site: "Main Surgery" }), null);
  assert.equal(findRenewalTarget(null, {}), null);
});

console.log(`\n${n} passed`);
