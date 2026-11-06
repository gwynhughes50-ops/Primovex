// The made-up certificates, safety data sheets and other paperwork for trying Add a document (Document reading). EVERY one is invented: invented companies, numbers, addresses and
// dates, and each says so on the page. Nothing here is a real certificate, a real business or a real product.
// This file is the source of truth: scripts/make-test-documents.mjs writes the files and an answer sheet from it, and `npm run test:test-documents` checks that every answer
// it lists really is written on the page it belongs to (so the files can be trusted when Primovex gets one wrong).
//
// A document is a list of blocks: { t: "title" | "h" | "line" | "para" | "gap", text }. `expected` is what Primovex should find, with the exact words on the page that show it.

export const SAMPLE_FOOTER = "SAMPLE: a made-up document for testing Primovex. Not a real certificate. All names, numbers and dates are invented.";
export const SITE = "Main Surgery, 1 High Street, Mold, CH7 1AB";

const company = (name, lines) => [{ t: "title", text: name }, ...lines.map((text) => ({ t: "line", text })), { t: "gap" }];
const kv = (label, value) => ({ t: "line", text: `${label}: ${value}` });

const cert = (o) => ({
  kind: "certificate",
  blocks: [
    ...company(o.issuer, o.issuerLines || ["Unit 4, Mill Lane Trading Estate, Mold, CH7 0XX (invented address)", "Tel 01000 000000 (invented)"]),
    { t: "h", text: o.title },
    ...o.rows.map(([l, v]) => kv(l, v)),
    ...(o.extra || []).map((text) => ({ t: "para", text })),
    { t: "gap" },
    { t: "line", text: "Premises: " + SITE },
  ],
  expected: o.expected,
  tests: o.tests,
  notes: o.notes || "",
});

const q = (iso, quote) => ({ iso, quote });
const pick = (key, quote) => ({ key, quote });
// a check the certificate records: what it is called, the answer, and whether that answer is a PROBLEM; the quote is the line as it is on the page
const chk = (label, answer, problem = false) => ({ label, answer, problem, quote: `${label}: ${answer}` });
const eng = (value, quote) => ({ value, quote });

// ---------- certificates and service records (PDF) ----------
export const DOCUMENTS = [
  { file: "01-gas-safety-record-2025-OLD.pdf", ...cert({
    issuer: "Northgate Gas Services Ltd", title: "Landlord / Homeowner Gas Safety Record",
    rows: [["Record number", "GSR-31877"], ["Date of inspection", "14/10/2025"], ["Next inspection due by", "13/10/2026"], ["Engineer", "A. Sample (registration 000000, invented)"], ["Gas supply tightness test", "Pass"], ["Boiler: safe to use", "Yes"]],
    expected: { type: "gas_safety", provider: "Northgate Gas Services Ltd", reference: "GSR-31877", completedOn: q("2025-10-14", "Date of inspection: 14/10/2025"), expiryDate: q("2026-10-13", "Next inspection due by: 13/10/2026"), engineer: eng("A. Sample", "Engineer: A. Sample (registration 000000, invented)"), findings: [chk("Gas supply tightness test", "Pass"), chk("Boiler: safe to use", "Yes")] },
    tests: "A normal gas safety record. Last year's, so it has just run out: add it first, then drop file 08 to try the Renew offer. It also has the ENGINEER and two CHECKS (gas supply tightness test: Pass; boiler safe to use: Yes), which should be read onto the form and shown as green chips on the register.",
  }) },
  { file: "02-eicr-electrical-test.pdf", ...cert({
    issuer: "Brightspark Electrical Contractors Ltd", title: "Electrical Installation Condition Report (EICR)",
    rows: [["Report number", "EICR-2026-0377"], ["Date of inspection", "2 September 2026"], ["Recommended date for next inspection", "2 September 2031"], ["Overall assessment of the installation", "SATISFACTORY"]],
    expected: { type: "eicr", provider: "Brightspark Electrical Contractors Ltd", reference: "EICR-2026-0377", completedOn: q("2026-09-02", "Date of inspection: 2 September 2026"), expiryDate: q("2031-09-02", "Recommended date for next inspection: 2 September 2031"), findings: [chk("Overall assessment of the installation", "SATISFACTORY")] },
    tests: "Dates written as words. A five-year certificate.",
  }) },
  { file: "03-fire-extinguisher-service.pdf", ...cert({
    issuer: "Safeguard Fire Protection Ltd", title: "Fire Extinguisher Service Certificate",
    rows: [["Certificate number", "FES-55120"], ["Date of service", "21/09/2026"], ["Next service due", "21/09/2027"], ["Extinguishers serviced", "14"]],
    expected: { type: "fire_extinguisher_service", provider: "Safeguard Fire Protection Ltd", reference: "FES-55120", completedOn: q("2026-09-21", "Date of service: 21/09/2026"), expiryDate: q("2027-09-21", "Next service due: 21/09/2027") },
    tests: "A plain annual service certificate.",
  }) },
  { file: "04-legionella-risk-assessment-review.pdf", ...cert({
    issuer: "Aquasure Water Hygiene Ltd", title: "Legionella Risk Assessment: Review",
    rows: [["Report reference", "LRA-9087"], ["Date of review", "5 October 2026"], ["Next review due", "5 October 2028"], ["Risk rating", "Low"]],
    expected: { type: "legionella_risk_assessment", provider: "Aquasure Water Hygiene Ltd", reference: "LRA-9087", completedOn: q("2026-10-05", "Date of review: 5 October 2026"), expiryDate: q("2028-10-05", "Next review due: 5 October 2028") },
    tests: "A two-year review certificate.",
  }) },
  { file: "05-boiler-service-NO-EXPIRY-DATE.pdf", ...cert({
    issuer: "Hearthside Heating Ltd", title: "Boiler Service Record",
    rows: [["Job number", "BS-20871"], ["Date of service", "30/10/2026"], ["Engineer comments", "Boiler operating correctly. No faults found."]],
    expected: { type: "boiler_service", provider: "Hearthside Heating Ltd", reference: "BS-20871", completedOn: q("2026-10-30", "Date of service: 30/10/2026"), expiryDate: null, suggestedExpiry: "2027-10-30" },
    tests: "NO expiry or next-due date is written. Primovex must not invent one: the form should show the usual 12 months (30/10/2027) marked 'Check this', saying it is not from the document.",
  }) },
  { file: "06-employers-liability-insurance-2026.pdf", ...cert({
    issuer: "Harbourstone Insurance Ltd", title: "Employers' Liability Insurance Certificate",
    rows: [["Policy number", "EL-7733019"], ["Policyholder", "Greenfield Surgery (invented)"], ["Policy start date", "01/01/2026"], ["Policy end date", "31/12/2026"], ["Limit of indemnity", "10,000,000 pounds"]],
    expected: { type: "insurance_el", provider: "Harbourstone Insurance Ltd", reference: "EL-7733019", completedOn: q("2026-01-01", "Policy start date: 01/01/2026"), expiryDate: q("2026-12-31", "Policy end date: 31/12/2026") },
    tests: "Insurance: the 'done' date is the start of cover and the expiry is the end. It runs out soon, so it should show as running out.",
  }) },
  { file: "07-lift-inspection-LOLER.pdf", ...cert({
    issuer: "Liftsafe Inspections Ltd", title: "Report of Thorough Examination of a Lift (LOLER)",
    rows: [["Report number", "LE-1204"], ["Date of examination", "3rd November 2026"], ["Next examination due by", "3rd May 2027"], ["Defects requiring action", "None"]],
    expected: { type: "lift_loler", provider: "Liftsafe Inspections Ltd", reference: "LE-1204", completedOn: q("2026-11-03", "Date of examination: 3rd November 2026"), expiryDate: q("2027-05-03", "Next examination due by: 3rd May 2027"), findings: [chk("Defects requiring action", "None")] },
    tests: "Dates with 'rd' after the day. A six-month certificate.",
  }) },
  { file: "08-gas-safety-record-2026-RENEWAL.pdf", ...cert({
    issuer: "Northgate Gas Services Ltd", title: "Landlord / Homeowner Gas Safety Record",
    rows: [["Record number", "GSR-48213"], ["Date of inspection", "14/10/2026"], ["Next inspection due by", "13/10/2027"], ["Engineer", "A. Sample (registration 000000, invented)"], ["Gas supply tightness test", "Pass"], ["Boiler: safe to use", "Yes"]],
    expected: { type: "gas_safety", provider: "Northgate Gas Services Ltd", reference: "GSR-48213", completedOn: q("2026-10-14", "Date of inspection: 14/10/2026"), expiryDate: q("2027-10-13", "Next inspection due by: 13/10/2027"), engineer: eng("A. Sample", "Engineer: A. Sample (registration 000000, invented)"), findings: [chk("Gas supply tightness test", "Pass"), chk("Boiler: safe to use", "Yes")] },
    tests: "The renewal of file 01. Once 01 is saved, Primovex should say 'This looks like a renewal' and offer Renew, rather than adding a second gas record.",
  }) },
  { file: "09-photo-of-fire-alarm-certificate.png", format: "photo-png", ...cert({
    issuer: "Ember Fire & Security Ltd", title: "Fire Detection and Alarm System: Service Certificate",
    rows: [["Certificate number", "FA-20418"], ["Date of service", "08/10/2026"], ["Next service due", "08/04/2027"], ["Panel fault found", "No"]],
    expected: { type: "fire_alarm_service", provider: "Ember Fire & Security Ltd", reference: "FA-20418", completedOn: q("2026-10-08", "Date of service: 08/10/2026"), expiryDate: q("2027-04-08", "Next service due: 08/04/2027"), findings: [chk("Panel fault found", "No")] },
    tests: "A PHOTO (a slightly tilted picture of a page on a table), as if taken on a phone. It is turned into a PDF on your device and read. A six-month certificate. 'Panel fault found: No' is a NO that is fine, so it must NOT be flagged as a problem.",
  }) },
  { file: "23-gas-safety-record-UNSAFE-BOILER-FAILED.pdf", ...cert({
    issuer: "Northgate Gas Services Ltd", title: "Landlord / Homeowner Gas Safety Record",
    rows: [["Record number", "GSR-60214"], ["Date of inspection", "21/10/2026"], ["Next inspection due by", "20/10/2027"], ["Engineer", "R. Example (registration 000000, invented)"], ["Gas supply tightness test", "Fail"], ["Boiler: safe to use", "No"], ["Carbon monoxide alarm fitted", "Yes"]],
    expected: { type: "gas_safety", provider: "Northgate Gas Services Ltd", reference: "GSR-60214", completedOn: q("2026-10-21", "Date of inspection: 21/10/2026"), expiryDate: q("2027-10-20", "Next inspection due by: 20/10/2027"), engineer: eng("R. Example", "Engineer: R. Example (registration 000000, invented)"), findings: [chk("Gas supply tightness test", "Fail", true), chk("Boiler: safe to use", "No", true), chk("Carbon monoxide alarm fitted", "Yes")] },
    tests: "A gas record that records a FAILURE: the tightness test failed and the boiler is NOT safe to use. Primovex should put both on the form and show a big red warning that it is not a pass; after saving, the certificate shows red at the top of the register, in the compliance 'needs attention' list and on the phone, even though its dates are fine. The carbon monoxide alarm 'Yes' is fine.",
  }) },
  { file: "10-emergency-lighting-DATES-CONFLICT.pdf", ...cert({
    issuer: "Beacon Emergency Lighting Ltd", title: "Emergency Lighting Annual Test Certificate",
    rows: [["Certificate number", "EL-66012"], ["Date of test", "14/10/2026"], ["Valid until", "13/10/2025"]],
    expected: { type: "emergency_lighting_cert", provider: "Beacon Emergency Lighting Ltd", reference: "EL-66012", completedOn: q("2026-10-14", "Date of test: 14/10/2026"), expiryDate: q("2025-10-13", "Valid until: 13/10/2025"), warning: "The expiry date is before the date it was done" },
    tests: "The expiry is before the date done. Primovex should warn that one has been misread and mark both dates 'Check this', not present them as found.",
  }) },
  { file: "12-NOT-a-certificate-lunch-menu.pdf", kind: "other",
    blocks: [{ t: "title", text: "The Corner Cafe: Lunch Menu" }, { t: "para", text: "Soup of the day 4.50. Cheese and ham toastie 5.25. Jacket potato with beans 5.00. Tea and coffee 1.80." }, { t: "para", text: "Open Monday to Friday, 8am to 3pm (invented cafe)." }],
    expected: { kind: "other" }, tests: "Not a certificate or a data sheet. With the kind left to Primovex it should say it could not tell what the document is, and offer to read it as a certificate or a data sheet.", notes: "" },

  // ---------- COSHH safety data sheets ----------
  { file: "13-SDS-surface-cleaner-FLAMMABLE-IRRITANT.pdf", kind: "coshh", blocks: sds({
    product: "ClearShield Surface Cleaner", supplier: "BrightClean Supplies UK Ltd",
    hazard: ["Flammable liquid, category 3. H226 Flammable liquid and vapour.", "Eye irritation, category 2. H319 Causes serious eye irritation.", "Skin irritation, category 2. H315 Causes skin irritation."],
    firstAid: ["Eye contact: rinse with plenty of water for at least 15 minutes.", "Skin contact: wash with plenty of soap and water.", "Inhalation: move to fresh air.", "Ingestion: rinse mouth. Do NOT induce vomiting."],
    protection: ["Hand protection: wear protective gloves.", "Eye protection: wear safety glasses or goggles."],
  }), expected: { productName: q(null, "Product name: ClearShield Surface Cleaner"), supplier: q(null, "Supplier: BrightClean Supplies UK Ltd"), hazards: [pick("flammable", "H226 Flammable liquid and vapour"), pick("irritant", "H319 Causes serious eye irritation")], ppe: [pick("gloves", "wear protective gloves"), pick("eye-protection", "wear safety glasses or goggles")], firstAid: [pick("eyes", "Eye contact: rinse with plenty of water"), pick("skin", "Skin contact: wash with plenty of soap and water"), pick("inhaled", "Inhalation: move to fresh air"), pick("swallowed", "Ingestion: rinse mouth")] },
    tests: "A normal hazardous cleaner. Hazards and protection should be ticked, each with a quote from the sheet." },
  { file: "14-SDS-limescale-remover-CORROSIVE.pdf", kind: "coshh", blocks: sds({
    product: "DescaleMax Limescale Remover", supplier: "Fenwick Hygiene Products Ltd",
    hazard: ["Corrosive to metals, category 1. H290 May be corrosive to metals.", "Skin corrosion, category 1B. H314 Causes severe skin burns and eye damage."],
    firstAid: ["Eye contact: rinse cautiously with water for several minutes and get medical help.", "Skin contact: take off contaminated clothing and rinse skin with water.", "Ingestion: rinse mouth. Do NOT induce vomiting. Call a doctor.", "Inhalation: remove to fresh air."],
    protection: ["Hand protection: wear chemical resistant gloves.", "Eye and face protection: wear goggles and a face shield.", "Body protection: wear a chemical resistant apron."],
  }), expected: { productName: q(null, "Product name: DescaleMax Limescale Remover"), supplier: q(null, "Supplier: Fenwick Hygiene Products Ltd"), hazards: [pick("corrosive", "H314 Causes severe skin burns and eye damage")], ppe: [pick("gloves", "wear chemical resistant gloves"), pick("eye-protection", "wear goggles and a face shield"), pick("face-shield", "wear goggles and a face shield"), pick("apron", "wear a chemical resistant apron")], firstAid: [pick("eyes", "Eye contact: rinse cautiously with water"), pick("skin", "Skin contact: take off contaminated clothing"), pick("swallowed", "Ingestion: rinse mouth"), pick("inhaled", "Inhalation: remove to fresh air")] },
    tests: "A corrosive product with the most protection. Check the face shield and apron are picked." },
  { file: "15-SDS-hand-soap-NOT-HAZARDOUS.pdf", kind: "coshh", blocks: sds({
    product: "PureWash Hand Soap", supplier: "BrightClean Supplies UK Ltd",
    hazard: ["Not a hazardous substance or mixture according to Regulation (EC) No 1272/2008."],
    firstAid: ["General advice: no special measures required.", "Eye contact: rinse with water.", "Skin contact: wash with water."],
    protection: ["No special protective equipment required."],
  }), expected: { productName: q(null, "Product name: PureWash Hand Soap"), supplier: q(null, "Supplier: BrightClean Supplies UK Ltd"), hazards: [], notHazardous: "Not a hazardous substance or mixture", ppe: [pick("none", "No special protective equipment required")], firstAid: [pick("eyes", "Eye contact: rinse with water"), pick("skin", "Skin contact: wash with water")] },
    tests: "Not hazardous. Primovex should tick 'Not classified as hazardous' ONLY because the sheet says so, and still tell you to read section 2 yourself." },
  { file: "16-SDS-aerosol-disinfectant-AEROSOL.pdf", kind: "coshh", blocks: sds({
    product: "FreshGuard Aerosol Disinfectant", supplier: "Fenwick Hygiene Products Ltd",
    hazard: ["Aerosol, category 1. H222 Extremely flammable aerosol. H229 Pressurised container: may burst if heated.", "Eye irritation, category 2. H319 Causes serious eye irritation.", "Specific target organ toxicity. H336 May cause drowsiness or dizziness."],
    firstAid: ["Inhalation: move to fresh air. If unwell, call 111.", "Eye contact: rinse with water for at least 10 minutes."],
    protection: ["Hand protection: wear protective gloves.", "Ventilation: use only in a well-ventilated area."],
  }), expected: { productName: q(null, "Product name: FreshGuard Aerosol Disinfectant"), supplier: q(null, "Supplier: Fenwick Hygiene Products Ltd"), hazards: [pick("flammable", "H222 Extremely flammable aerosol"), pick("gas-under-pressure", "H229 Pressurised container"), pick("irritant", "H319 Causes serious eye irritation")], ppe: [pick("gloves", "wear protective gloves"), pick("ventilation", "use only in a well-ventilated area")], firstAid: [pick("inhaled", "Inhalation: move to fresh air"), pick("eyes", "Eye contact: rinse with water")] },
    tests: "An aerosol. Several hazards: any it cannot back with the sheet's words should be shown as 'Check this' and NOT ticked." },

  // ---------- other formats (made by the maker from these) ----------
  { file: "17-fire-risk-assessment-review-WORD.docx", format: "docx", ...cert({
    issuer: "Cobalt Fire Safety Consultants Ltd", title: "Fire Risk Assessment: Annual Review",
    rows: [["Report reference", "FRA-2026-114"], ["Date of review", "19 October 2026"], ["Next review due", "19 October 2027"], ["Overall risk level", "Tolerable"]],
    expected: { type: "fire_risk_assessment", provider: "Cobalt Fire Safety Consultants Ltd", reference: "FRA-2026-114", completedOn: q("2026-10-19", "Date of review: 19 October 2026"), expiryDate: q("2027-10-19", "Next review due: 19 October 2027") },
    tests: "A Word file. It is read, and the record kept is a text copy PDF (labelled), with a note saying to use Replace PDF for the real one.",
  }) },
  { file: "18-email-from-contractor-WITH-PDF-ATTACHED.eml", format: "eml-with-attachment", attachment: "07-lift-inspection-LOLER.pdf",
    kind: "certificate", blocks: [], expected: { usesAttachment: "07-lift-inspection-LOLER.pdf" },
    tests: "An email with the lift report attached (and a tiny logo picture). Primovex should use the PDF attachment, ignore the logo, and say which attachment it used. The result should match file 07." },
  { file: "19-email-text-only-NO-ATTACHMENT.eml", format: "eml-text", ...cert({
    issuer: "Clearair Surveys Ltd", title: "Asbestos Management Survey: Re-inspection",
    rows: [["Survey reference", "AS-3301"], ["Date of re-inspection", "12 October 2026"], ["Next re-inspection due", "12 October 2027"]],
    expected: { type: "asbestos_survey", provider: "Clearair Surveys Ltd", reference: "AS-3301", completedOn: q("2026-10-12", "Date of re-inspection: 12 October 2026"), expiryDate: q("2027-10-12", "Next re-inspection due: 12 October 2027") },
    tests: "An email with the details in its text and NOTHING attached. Primovex should use the email's text and say so.",
  }) },
  { file: "20-pasted-insurance-renewal-2027.txt", format: "txt", ...cert({
    issuer: "Harbourstone Insurance Ltd", title: "Employers' Liability Insurance Certificate (renewal)",
    rows: [["Policy number", "EL-7733020"], ["Policyholder", "Greenfield Surgery (invented)"], ["Policy start date", "01/01/2027"], ["Policy end date", "31/12/2027"]],
    expected: { type: "insurance_el", provider: "Harbourstone Insurance Ltd", reference: "EL-7733020", completedOn: q("2027-01-01", "Policy start date: 01/01/2027"), expiryDate: q("2027-12-31", "Policy end date: 31/12/2027") },
    tests: "A plain text file (as if pasted from an email). It becomes a PDF of the text. It renews file 06, so after saving 06 you should be offered Renew.",
  }) },
  { file: "21-emergency-lighting-test-log.xlsx", format: "xlsx", ...cert({
    issuer: "Beacon Emergency Lighting Ltd", title: "Emergency Lighting Test Log",
    rows: [["Certificate number", "EL-70555"], ["Date of test", "26/10/2026"], ["Next test due", "26/10/2027"], ["Luminaires tested", "38"]],
    expected: { type: "emergency_lighting_cert", provider: "Beacon Emergency Lighting Ltd", reference: "EL-70555", completedOn: q("2026-10-26", "Date of test: 26/10/2026"), expiryDate: q("2027-10-26", "Next test due: 26/10/2027") },
    tests: "An Excel file. Read like the Word file, with a text-copy record.",
  }) },
  { file: "22-OLD-FORMAT-should-be-refused.doc", format: "old-doc", kind: "refused", blocks: [], expected: { refused: true },
    tests: "Pretends to be an old Word 97-2003 file. Primovex cannot read it and should say so, with what to do (Save as PDF or .docx). Nothing is read or sent." },
];

function sds({ product, supplier, hazard, firstAid, protection }) {
  return [
    { t: "title", text: "SAFETY DATA SHEET" },
    { t: "line", text: "According to Regulation (EC) No 1907/2006 (sample layout)" }, { t: "gap" },
    { t: "h", text: "SECTION 1: Identification of the substance or mixture" },
    kv("Product name", product), kv("Supplier", supplier), { t: "line", text: "Address: Unit 9, Riverside Park, Chester, CH1 0ZZ (invented)" }, { t: "line", text: "Emergency telephone: 01000 000000 (invented)" }, { t: "gap" },
    { t: "h", text: "SECTION 2: Hazards identification" }, ...hazard.map((text) => ({ t: "line", text })), { t: "gap" },
    { t: "h", text: "SECTION 4: First-aid measures" }, ...firstAid.map((text) => ({ t: "line", text })), { t: "gap" },
    { t: "h", text: "SECTION 8: Exposure controls and personal protection" }, ...protection.map((text) => ({ t: "line", text })),
  ];
}

// the plain text of a document, the way it reads on the page
export function plainText(doc) {
  return (doc.blocks || []).map((b) => (b.t === "gap" ? "" : b.text)).join("\n");
}

// the text of the email files (made by the maker; kept here so the test can check it)
export function emailText(doc) {
  const body = plainText(doc);
  if (doc.format === "eml-text") {
    return ["From: Priya Sample <priya@clearair-sample.example>", "To: practice.manager@greenfield-sample.example", "Subject: Asbestos re-inspection complete", "Date: Fri, 6 Nov 2026 10:05:00 +0000", "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", "Hello,", "", "The re-inspection is complete. The details are below.", "", body, "", "Kind regards,", "Priya (invented sender)", "", SAMPLE_FOOTER, ""].join("\r\n");
  }
  return null;
}

export const kindOf = (doc) => doc.kind;

// the checks and engineer a document is expected to give (certificates only)
export const expectedChecks = (doc) => (doc.expected?.findings || []);
