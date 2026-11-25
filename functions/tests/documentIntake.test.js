const test = require("node:test");
const assert = require("node:assert/strict");
const { MAX_BYTES, READABLE, buildInstructions, cleanOptions, datesIn, decodeUpload, extractDocumentFields, verifyExtraction } = require("../services/documentIntakeService");
const { analyzeDocument } = require("../services/azureDocumentIntelligenceService");
const { documentsEnabledFor, clinFlowEnabledFor } = require("../services/moduleAccess");

const b64 = (buffer) => Buffer.from(buffer).toString("base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

const OPTIONS = {
  certTypes: [{ key: "gas_safety", label: "Gas safety certificate" }, { key: "eicr", label: "Fixed electrical wiring test (EICR)" }, { key: "other", label: "Other certificate or service" }],
  hazards: [{ key: "flammable", label: "Flammable" }, { key: "irritant", label: "Irritant" }, { key: "none", label: "Not classified as hazardous" }],
  ppe: [{ key: "gloves", label: "Gloves" }, { key: "eye", label: "Eye protection" }],
  firstAid: [{ key: "eyes", label: "Eyes: rinse" }, { key: "skin", label: "Skin: wash" }],
};

const GAS_TEXT = [
  "LANDLORD / HOMEOWNER GAS SAFETY RECORD",
  "Certificate number: GSR-48213",
  "Carried out by: Northern Gas Services Ltd",
  "Date of inspection: 14/10/2026",
  "Next inspection due by: 13 October 2027",
  "Premises: Main Surgery, 1 High Street",
].join("\n");

const SDS_TEXT = [
  "SAFETY DATA SHEET  Section 1: Product name: Hospital Surface Cleaner",
  "Supplier: CleanChem UK Ltd",
  "Section 2: Hazard statements: H226 Flammable liquid and vapour. H319 Causes serious eye irritation.",
  "Section 4: In case of eye contact rinse with water for 15 minutes.",
  "Section 8: Wear protective gloves and eye protection.",
].join("\n");

const field = (value, evidence) => ({ value, evidence });

test("only readable files are accepted, judged by the file's own first bytes", () => {
  assert.equal(decodeUpload({ base64: b64(PDF), mimeType: "application/pdf", fileName: "gas.pdf" }).kind, "pdf");
  assert.equal(decodeUpload({ base64: b64(JPEG), mimeType: "image/jpeg" }).kind, "jpeg");
  assert.equal(decodeUpload({ base64: `data:image/png;base64,${b64(PNG)}` }).kind, "png");
  assert.throws(() => decodeUpload({ base64: b64("hello there"), mimeType: "application/pdf" }), /cannot be read/);
  assert.throws(() => decodeUpload({ base64: b64(Buffer.concat([Buffer.from("MZ"), Buffer.alloc(40)])) }), /cannot be read/);
  assert.throws(() => decodeUpload({ base64: b64(PDF), mimeType: "text/html" }), /cannot be read/);
  assert.throws(() => decodeUpload({}), /No document/);
  assert.throws(() => decodeUpload({ base64: b64(Buffer.concat([PDF, Buffer.alloc(MAX_BYTES + 10)])) }), /over 10 MB/);
});

const zipOf = (...names) => Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from(["[Content_Types].xml", ...names].join("\0"), "latin1"), Buffer.alloc(40)]);
const BMP = Buffer.concat([Buffer.from("BM"), Buffer.alloc(40)]);
const TIFF_LE = Buffer.concat([Buffer.from([0x49, 0x49, 0x2a, 0]), Buffer.alloc(40)]);
const TIFF_BE = Buffer.concat([Buffer.from([0x4d, 0x4d, 0, 0x2a]), Buffer.alloc(40)]);
const heif = (brand) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp" + brand, "latin1"), Buffer.alloc(40)]);

test("Word, Excel and PowerPoint files, and TIFF, BMP and HEIC photos, are recognised from their contents", () => {
  assert.equal(decodeUpload({ base64: b64(zipOf("word/document.xml")), fileName: "cert.docx" }).kind, "docx");
  assert.equal(decodeUpload({ base64: b64(zipOf("xl/workbook.xml")), fileName: "log.xlsx" }).kind, "xlsx");
  assert.equal(decodeUpload({ base64: b64(zipOf("ppt/presentation.xml")), fileName: "deck.pptx" }).kind, "pptx");
  assert.equal(decodeUpload({ base64: b64(BMP) }).kind, "bmp");
  assert.equal(decodeUpload({ base64: b64(TIFF_LE) }).kind, "tiff");
  assert.equal(decodeUpload({ base64: b64(TIFF_BE) }).kind, "tiff");
  assert.equal(decodeUpload({ base64: b64(heif("heic")) }).kind, "heif");
  assert.equal(decodeUpload({ base64: b64(heif("mif1")) }).kind, "heif");
  assert.equal(decodeUpload({ base64: b64(zipOf("word/document.xml")), mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }).kind, "docx");
});

test("a zip that is not an Office file, an old Word file, a program or a web page is refused, however it is named", () => {
  assert.throws(() => decodeUpload({ base64: b64(Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from("just some files"), Buffer.alloc(40)])), fileName: "cert.docx" }), /cannot be read/, "a plain zip named .docx");
  assert.throws(() => decodeUpload({ base64: b64(Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from("[Content_Types].xml and some other part"), Buffer.alloc(40)])) }), /cannot be read/, "a zip with no Office part");
  assert.throws(() => decodeUpload({ base64: b64(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(100)])), fileName: "old.doc" }), /cannot be read/, "an old .doc or .xls");
  assert.throws(() => decodeUpload({ base64: b64("<html><body>hello</body></html>"), mimeType: "text/html" }), /cannot be read/);
  assert.throws(() => decodeUpload({ base64: b64(Buffer.concat([Buffer.from("MZ"), Buffer.alloc(80)])), mimeType: "application/octet-stream" }), /cannot be read/, "a program is refused whatever it claims to be");
  assert.match(READABLE, /Word, Excel or PowerPoint/);
});

test("only a PDF or TIFF is limited to its first pages, and only the kinds that cannot be kept as the record need a text copy", () => {
  const kinds = {
    pdf: [PDF, true, false], tiff: [TIFF_LE, true, true], jpeg: [JPEG, false, false], png: [PNG, false, false],
    docx: [zipOf("word/document.xml"), false, true], xlsx: [zipOf("xl/workbook.xml"), false, true], pptx: [zipOf("ppt/presentation.xml"), false, true], bmp: [BMP, false, true], heif: [heif("heic"), false, true],
  };
  for (const [kind, [buffer, pages, copy]] of Object.entries(kinds)) {
    const up = decodeUpload({ base64: b64(buffer) });
    assert.equal(up.kind, kind);
    assert.equal(up.canLimitPages, pages, `${kind} page limit`);
    assert.equal(up.needsTextCopy, copy, `${kind} text copy`);
  }
});

test("the upload gives a fingerprint and a safe file name, and never keeps a path", () => {
  const up = decodeUpload({ base64: b64(PDF), fileName: "../../etc/passwd<script>.pdf" });
  assert.match(up.sha256, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(up.fileName, /[<>/\\]/);
});

test("only well-formed choices from the app reach the prompt", () => {
  const cleaned = cleanOptions({ certTypes: [{ key: "gas_safety", label: "Gas" }, { key: "Bad Key!", label: "x" }, { key: "ok", label: "" }, null], hazards: "nope" });
  assert.deepEqual(cleaned.certTypes, [{ key: "gas_safety", label: "Gas" }]);
  assert.deepEqual(cleaned.hazards, []);
  assert.deepEqual(cleanOptions(undefined), { certTypes: [], hazards: [], ppe: [], firstAid: [] });
  // the real lists use hyphens in some keys (gas-under-pressure, eye-protection, ring-111): they must survive
  const real = cleanOptions({ hazards: [{ key: "gas-under-pressure", label: "Gas under pressure (aerosol)" }, { key: "health-hazard", label: "Serious long-term health hazard" }], ppe: [{ key: "eye-protection", label: "Eye protection" }], firstAid: [{ key: "ring-111", label: "Call 111" }] });
  assert.deepEqual(real.hazards.map((h) => h.key), ["gas-under-pressure", "health-hazard"]);
  assert.deepEqual(real.ppe.map((h) => h.key), ["eye-protection"]);
  assert.deepEqual(real.firstAid.map((h) => h.key), ["ring-111"]);
});

test("dates are read day first, in every common written form", () => {
  assert.deepEqual(datesIn("done 14/10/2026"), ["2026-10-14"]);
  assert.deepEqual(datesIn("done 04-03-2026"), ["2026-03-04"], "4 March, not 3 April");
  assert.deepEqual(datesIn("on 3.2.26"), ["2026-02-03"]);
  assert.deepEqual(datesIn("13 October 2027"), ["2027-10-13"]);
  assert.deepEqual(datesIn("1st of March 2027"), ["2027-03-01"]);
  assert.deepEqual(datesIn("Oct 13, 2027"), ["2027-10-13"]);
  assert.deepEqual(datesIn("2027-10-13"), ["2027-10-13"]);
  assert.deepEqual(datesIn("31/02/2026 and 45/13/2026"), [], "impossible dates are not dates");
  assert.deepEqual(datesIn("no dates here, ref 12345"), []);
});

test("the instructions tell the model to quote, never to calculate an expiry, and carry the lists", () => {
  const text = buildInstructions("auto", cleanOptions(OPTIONS));
  assert.match(text, /Never infer, calculate, correct or guess/);
  assert.match(text, /Do NOT work one out/);
  assert.match(text, /No evidence, no value/);
  assert.match(text, /gas_safety: Gas safety certificate/);
  assert.match(text, /flammable: Flammable/);
  assert.match(text, /"kind" is "certificate", "coshh", "delivery" or "other"/);
  assert.doesNotMatch(buildInstructions("certificate", cleanOptions(OPTIONS)), /SAFETY DATA SHEET/);
  assert.doesNotMatch(buildInstructions("coshh", cleanOptions(OPTIONS)), /CERTIFICATE \(a safety/);
});

test("a certificate whose every value is quoted from the document comes back verified", () => {
  const out = verifyExtraction({
    ocrText: GAS_TEXT, kind: "certificate", options: OPTIONS,
    parsed: { certificate: {
      type: field("gas_safety", "LANDLORD / HOMEOWNER GAS SAFETY RECORD"),
      provider: field("Northern Gas Services Ltd", "Carried out by: Northern Gas Services Ltd"),
      reference: field("GSR-48213", "Certificate number: GSR-48213"),
      completedOn: field("2026-10-14", "Date of inspection: 14/10/2026"),
      expiryDate: field("2027-10-13", "Next inspection due by: 13 October 2027"),
      premises: field("Main Surgery, 1 High Street", "Premises: Main Surgery, 1 High Street"),
    } },
  });
  for (const name of ["type", "provider", "reference", "completedOn", "expiryDate", "premises"]) assert.equal(out.fields[name].verified, true, name);
  assert.equal(out.fields.expiryDate.value, "2027-10-13");
  assert.deepEqual(out.warnings, []);
});

test("an invented value, a made-up quote, or a date that is not in its quote is never marked as found", () => {
  const out = verifyExtraction({
    ocrText: GAS_TEXT, kind: "certificate", options: OPTIONS,
    parsed: { certificate: {
      type: field("gas_safety", "Gas safety record issued by the council"),            // quote is not in the document
      provider: field("Southern Gas Ltd", "Carried out by: Northern Gas Services Ltd"), // value is not in its quote
      reference: field("GSR-99999", null),                                              // no quote at all
      completedOn: field("2026-10-15", "Date of inspection: 14/10/2026"),               // quote has a different date
      expiryDate: field("2028-10-13", "Next inspection due by: 13 October 2027"),       // quote has a different date
      premises: field(null, null),
    } },
  });
  assert.equal(out.fields.type.verified, false);
  assert.equal(out.fields.type.evidence, null, "a quote that is not in the document is dropped");
  assert.equal(out.fields.provider.verified, false);
  assert.equal(out.fields.reference.verified, false);
  assert.equal(out.fields.completedOn.verified, false);
  assert.equal(out.fields.expiryDate.verified, false);
  assert.equal(out.fields.premises.value, null);
});

test("a type the app does not offer is dropped, and an expiry before the date done is flagged", () => {
  const out = verifyExtraction({
    ocrText: GAS_TEXT, kind: "certificate", options: OPTIONS,
    parsed: { certificate: {
      type: field("made_up_type", "LANDLORD / HOMEOWNER GAS SAFETY RECORD"),
      completedOn: field("2027-10-13", "Next inspection due by: 13 October 2027"),
      expiryDate: field("2026-10-14", "Date of inspection: 14/10/2026"),
    } },
  });
  assert.equal(out.fields.type.value, null);
  assert.equal(out.fields.type.verified, false);
  assert.match(out.warnings[0], /expiry date is before/);
  assert.equal(out.fields.completedOn.verified, false);
  assert.equal(out.fields.expiryDate.verified, false);
});

test("a safety data sheet's hazards, protection and first aid are picked only from the lists, each with a real quote", () => {
  const out = verifyExtraction({
    ocrText: SDS_TEXT, kind: "coshh", options: OPTIONS,
    parsed: { coshh: {
      productName: field("Hospital Surface Cleaner", "Product name: Hospital Surface Cleaner"),
      supplier: field("CleanChem UK Ltd", "Supplier: CleanChem UK Ltd"),
      hazards: [{ key: "flammable", evidence: "H226 Flammable liquid and vapour" }, { key: "irritant", evidence: "H319 Causes serious eye irritation" }, { key: "corrosive", evidence: "H314" }, { key: "flammable", evidence: "again" }],
      ppe: [{ key: "gloves", evidence: "Wear protective gloves" }, { key: "eye", evidence: "a quote that is not on the sheet" }],
      firstAid: [{ key: "eyes", evidence: "In case of eye contact rinse with water" }],
    } },
  });
  assert.deepEqual(out.fields.hazards.map((h) => [h.key, h.verified]), [["flammable", true], ["irritant", true]], "unknown and repeated keys are dropped");
  assert.deepEqual(out.fields.ppe.map((h) => [h.key, h.verified, h.evidence === null]), [["gloves", true, false], ["eye", false, true]]);
  assert.equal(out.fields.firstAid[0].verified, true);
  assert.equal(out.fields.productName.verified, true);
  assert.equal(out.fields.supplier.verified, true);
});

test("'not hazardous' is only believed when the sheet's own words say so; otherwise it is a warning, and no hazards are invented", () => {
  const honest = verifyExtraction({
    ocrText: "Section 2: Not a hazardous substance or mixture. Section 1: Product name: Water",
    kind: "coshh", options: OPTIONS,
    parsed: { coshh: { productName: field("Water", "Product name: Water"), notHazardous: { value: true, evidence: "Not a hazardous substance or mixture" }, hazards: [{ key: "irritant", evidence: "Not a hazardous substance" }] } },
  });
  assert.equal(honest.fields.notHazardous.value, true);
  assert.deepEqual(honest.fields.hazards, [], "no hazards are listed for a product the sheet calls non-hazardous");
  const bluff = verifyExtraction({
    ocrText: SDS_TEXT, kind: "coshh", options: OPTIONS,
    parsed: { coshh: { notHazardous: { value: true, evidence: "This product is completely safe" }, hazards: [] } },
  });
  assert.equal(bluff.fields.notHazardous.value, false);
  assert.match(bluff.warnings[0], /no wording in the document backs that up/);
});

test("with the kind left to the AI, its guess decides which section is read, and anything else is refused", () => {
  const cert = verifyExtraction({ ocrText: GAS_TEXT, kind: "auto", options: OPTIONS, parsed: { kind: "certificate", certificate: { reference: field("GSR-48213", "Certificate number: GSR-48213") } } });
  assert.equal(cert.kind, "certificate");
  assert.equal(cert.fields.reference.verified, true);
  const other = verifyExtraction({ ocrText: "Menu of the day", kind: "auto", options: OPTIONS, parsed: { kind: "other" } });
  assert.equal(other.kind, "other");
  assert.deepEqual(other.fields, {});
  assert.match(other.warnings[0], /does not look like/);
  assert.equal(verifyExtraction({ ocrText: "x", kind: "auto", options: OPTIONS, parsed: { kind: "something else" } }).kind, "other");
  assert.equal(verifyExtraction({ ocrText: "x", kind: "auto", options: OPTIONS, parsed: "not an object" }).kind, "other");
});

function fakeModel(body, { status = 200, throttle = 0 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (calls.length <= throttle) return { status: 429, ok: false, headers: { get: (h) => (h === "x-ms-retry-after-ms" ? "1" : null) }, text: async () => "slow down" };
    return { status, ok: status === 200, headers: { get: () => null }, text: async () => "boom", json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: typeof body === "string" ? body : JSON.stringify(body) }] }] }) };
  };
  return { fetchImpl, calls };
}

test("the model is called once, with the document's text only, and its answer is checked before it is returned", async () => {
  const { fetchImpl, calls } = fakeModel({ certificate: { reference: field("GSR-48213", "Certificate number: GSR-48213"), provider: field("Southern Gas", "Carried out by: Northern Gas Services Ltd") } });
  const out = await extractDocumentFields({ endpoint: "https://example.cognitiveservices.azure.com", key: "k", deployment: "d", ocrText: GAS_TEXT, kind: "certificate", options: OPTIONS, fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.cognitiveservices.azure.com/openai/v1/responses");
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.temperature, 0);
  assert.match(sent.input, /json/i);
  assert.ok(sent.input.includes("GSR-48213"));
  assert.equal(calls[0].init.headers["api-key"], "k");
  assert.equal(out.fields.reference.verified, true);
  assert.equal(out.fields.provider.verified, false, "the model's value is not in its own quote");
});

test("a busy service is retried, a refusal and nonsense are errors, and bad settings are refused before any call", async () => {
  const busy = fakeModel({ certificate: {} }, { throttle: 2 });
  await extractDocumentFields({ endpoint: "https://x.azure.com", key: "k", deployment: "d", ocrText: GAS_TEXT, kind: "certificate", options: OPTIONS, fetchImpl: busy.fetchImpl });
  assert.equal(busy.calls.length, 3);
  await assert.rejects(extractDocumentFields({ endpoint: "https://x.azure.com", key: "k", deployment: "d", ocrText: "t", kind: "certificate", options: OPTIONS, fetchImpl: fakeModel({}, { status: 500 }).fetchImpl }), /rejected the request \(500\)/);
  await assert.rejects(extractDocumentFields({ endpoint: "https://x.azure.com", key: "k", deployment: "d", ocrText: "t", kind: "certificate", options: OPTIONS, fetchImpl: fakeModel("not json at all").fetchImpl }), /valid structured output/);
  const none = fakeModel({});
  await assert.rejects(extractDocumentFields({ endpoint: "http://not-https", key: "k", deployment: "d", ocrText: "t", options: OPTIONS, fetchImpl: none.fetchImpl }), /endpoint/);
  await assert.rejects(extractDocumentFields({ endpoint: "https://x.azure.com", key: "", deployment: "d", ocrText: "t", options: OPTIONS, fetchImpl: none.fetchImpl }), /key is missing/);
  await assert.rejects(extractDocumentFields({ endpoint: "https://x.azure.com", key: "k", deployment: "d", ocrText: "t", kind: "invoice", options: OPTIONS, fetchImpl: none.fetchImpl }), /Unknown kind/);
  assert.equal(none.calls.length, 0);
});

test("a long document is cut before it is sent, so cost and exposure stay bounded", async () => {
  const { fetchImpl, calls } = fakeModel({ certificate: {} });
  await extractDocumentFields({ endpoint: "https://x.azure.com", key: "k", deployment: "d", ocrText: "A".repeat(50000), kind: "certificate", options: OPTIONS, fetchImpl });
  assert.ok(JSON.parse(calls[0].init.body).input.length < 17000);
});

test("the reader can be limited to the first pages, and only a plain page range is accepted", async () => {
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(url);
    if (init?.method === "POST") return { status: 202, headers: { get: (h) => (h === "operation-location" ? "https://x.cognitiveservices.azure.com/op/1" : null) }, text: async () => "" };
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ status: "succeeded", analyzeResult: { content: "hi", pages: [] } }) };
  };
  await analyzeDocument({ endpoint: "https://x.cognitiveservices.azure.com", key: "k", base64Source: "AAAA", pages: "1-6", fetchImpl });
  assert.match(urls[0], /&pages=1-6$/);
  await analyzeDocument({ endpoint: "https://x.cognitiveservices.azure.com", key: "k", base64Source: "AAAA", pages: "1-6&x=1", fetchImpl });
  assert.doesNotMatch(urls[2], /pages=/, "anything that is not a page range is ignored");
  await analyzeDocument({ endpoint: "https://x.cognitiveservices.azure.com", key: "k", base64Source: "AAAA", fetchImpl });
  assert.doesNotMatch(urls[4], /pages=/, "no limit is the old behaviour, so ClinFlow is unchanged");
});

test("Document reading is off unless it has been deliberately switched on, and ClinFlow's switch is unchanged", () => {
  assert.equal(documentsEnabledFor(undefined, "u1"), false);
  assert.equal(documentsEnabledFor({ moduleToggles: {} }, "u1"), false);
  assert.equal(documentsEnabledFor({ moduleToggles: { documents: { disabled: true, allowUids: [] } } }, "u1"), false);
  assert.equal(documentsEnabledFor({ moduleToggles: { documents: { disabled: true, allowUids: ["u1"] } } }, "u1"), true, "only me");
  assert.equal(documentsEnabledFor({ moduleToggles: { documents: { disabled: true, allowUids: ["u1"] } } }, "u2"), false);
  assert.equal(documentsEnabledFor({ moduleToggles: { documents: { disabled: false } } }, "u2"), true, "everyone");
  assert.equal(documentsEnabledFor({ moduleToggles: { clinflow: { disabled: false } } }, "u2"), false, "turning ClinFlow on does not turn this on");
  assert.equal(clinFlowEnabledFor({ moduleToggles: { clinflow: { disabled: false } } }, "u2"), true);
  assert.equal(clinFlowEnabledFor({ moduleToggles: { documents: { disabled: false } } }, "u2"), false);
});

test("the kind of certificate is confirmed by a quote on the page, whatever words the kind's key happens to use", () => {
  const text = "EMPLOYERS' LIABILITY INSURANCE CERTIFICATE\nPolicy number: EL-7733019";
  const out = (type, evidence) => verifyExtraction({ ocrText: text, kind: "certificate", options: { ...OPTIONS, certTypes: [...OPTIONS.certTypes, { key: "insurance_el", label: "Employers' liability insurance" }] }, parsed: { certificate: { type: field(type, evidence) } } }).fields.type;
  assert.equal(out("insurance_el", "EMPLOYERS' LIABILITY INSURANCE CERTIFICATE").verified, true, "the key's words are not in the title, and that is fine");
  assert.equal(out("insurance_el", "A title that is not on the page").verified, false, "a made-up quote still fails");
  assert.equal(out("insurance_el", "A title that is not on the page").evidence, null);
  assert.equal(out("not_a_kind", "EMPLOYERS' LIABILITY INSURANCE CERTIFICATE").value, null, "a kind the app does not offer is still dropped");
  assert.equal(out("insurance_el", null).verified, false, "no quote, no confirmation");
});

// ---- the engineer and the checks a certificate records ----
const GSR_TEXT = [
  "LANDLORD / HOMEOWNER GAS SAFETY RECORD",
  "Record number: GSR-31877",
  "Engineer: A. Sample (registration 000000)",
  "Gas supply tightness test: Fail",
  "Boiler: safe to use: No",
  "Panel fault found: No",
  "Smoke alarm tested: Yes",
].join("\n");
const cert = (c) => verifyExtraction({ ocrText: GSR_TEXT, kind: "certificate", options: OPTIONS, parsed: { certificate: c } });

test("the engineer's name is read from the page, and each check needs a quote with its answer in it", () => {
  const out = cert({
    engineer: field("A. Sample", "Engineer: A. Sample (registration 000000)"),
    findings: [
      { label: "Gas supply tightness test", answer: "Fail", problem: true, evidence: "Gas supply tightness test: Fail" },
      { label: "Panel fault found", answer: "No", problem: false, evidence: "Panel fault found: No" },
    ],
  }).fields;
  assert.equal(out.engineer.value, "A. Sample");
  assert.equal(out.engineer.verified, true);
  assert.deepEqual(out.findings.map((f) => [f.label, f.answer, f.problem, f.verified]), [["Gas supply tightness test", "Fail", true, true], ["Panel fault found", "No", false, true]]);
  assert.equal(cert({ engineer: field("B. Invented", "Engineer: B. Invented") }).fields.engineer.verified, false, "a name that is not on the page");
});

test("a check with a made-up quote, or an answer the quote does not contain, is shown but never marked as confirmed", () => {
  const out = cert({ findings: [
    { label: "Boiler safe to use", answer: "No", problem: true, evidence: "The boiler is not safe" },
    { label: "Gas supply tightness test", answer: "Pass", problem: false, evidence: "Gas supply tightness test: Fail" },
    { label: "Smoke alarm tested", answer: "Yes", problem: false, evidence: null },
  ] }).fields.findings;
  assert.deepEqual(out.map((f) => f.verified), [false, false, false]);
  assert.equal(out[0].evidence, null, "a quote that is not on the page is dropped");
});

test("whether an answer is a problem is decided by the rule: the AI cannot call 'Safe to use: No' fine, or a 'Pass' a problem", () => {
  const out = cert({ findings: [
    { label: "Boiler: safe to use", answer: "No", problem: false, evidence: "Boiler: safe to use: No" },
    { label: "Gas supply tightness test", answer: "Fail", problem: false, evidence: "Gas supply tightness test: Fail" },
    { label: "Smoke alarm tested", answer: "Yes", problem: true, evidence: "Smoke alarm tested: Yes" },
    { label: "Panel fault found", answer: "No", problem: true, evidence: "Panel fault found: No" },
  ] }).fields.findings;
  assert.deepEqual(out.map((f) => f.problem), [true, true, false, false]);
});

test("a problem is warned about in words, and no warning is made when every check is fine", () => {
  const bad = cert({ findings: [{ label: "Boiler: safe to use", answer: "No", evidence: "Boiler: safe to use: No" }] });
  assert.match(bad.warnings.join(" "), /records a failed or unsafe result: Boiler: safe to use: No\. Do not treat it as a pass/);
  const fine = cert({ findings: [{ label: "Smoke alarm tested", answer: "Yes", evidence: "Smoke alarm tested: Yes" }] });
  assert.deepEqual(fine.warnings, []);
});

test("checks without a name or an answer are dropped, repeats are merged, and at most twelve are kept", () => {
  const out = cert({ findings: [
    { label: "", answer: "Yes", evidence: "Smoke alarm tested: Yes" }, { label: "Smoke alarm tested", answer: "", evidence: "Smoke alarm tested: Yes" },
    { label: "Smoke alarm tested", answer: "Yes", evidence: "Smoke alarm tested: Yes" }, { label: "smoke alarm TESTED", answer: "yes", evidence: "Smoke alarm tested: Yes" },
    ...Array.from({ length: 20 }, (_, i) => ({ label: `Extra check ${i}`, answer: "Yes", evidence: "Smoke alarm tested: Yes" })),
  ] }).fields.findings;
  assert.equal(out.length, 12);
  assert.equal(out.filter((f) => f.label.toLowerCase() === "smoke alarm tested").length, 1);
  assert.deepEqual(cert({ findings: "not a list" }).fields.findings, []);
  assert.deepEqual(cert({}).fields.findings, []);
});

test("the instructions ask for the engineer and the checks, and say when an answer is a problem", () => {
  const text = buildInstructions("certificate", cleanOptions(OPTIONS));
  assert.match(text, /engineer: the name of the engineer/);
  assert.match(text, /findings: every pass\/fail or yes\/no RESULT/);
  assert.match(text, /'Boiler safe to use: No'/);
  assert.match(text, /"findings": \[\{"label"/);
});

// ---------- delivery notes ----------
const { intakeAccess } = require("../services/documentIntakeService");

const DELIVERY_TEXT = [
  "MEDSUPPLY UK LTD  DELIVERY NOTE",
  "Delivery note no: DN-77120   Date: 18/11/2026",
  "Your order: PO-2026-0412",
  "Code      Description                         Qty  Unit   Batch     Expiry",
  "SG1002    Sterile gauze swabs 10x10cm 5s       4   box    LOT7781A  03/2029",
  "NE2210    Needles 21G green 100               10   pack   B20991    31/05/2028",
  "AD0001    Adrenaline 1mg/ml ampoules 10        2   box    ",
  "Delivery charge  4.50",
].join("\n");

const deliveryParsed = (lines, extra = {}) => ({
  kind: "delivery",
  delivery: {
    supplier: field("MedSupply UK Ltd", "MEDSUPPLY UK LTD  DELIVERY NOTE"),
    noteNumber: field("DN-77120", "Delivery note no: DN-77120"),
    deliveryDate: field("2026-11-18", "Date: 18/11/2026"),
    orderReference: field("PO-2026-0412", "Your order: PO-2026-0412"),
    lines,
    ...extra,
  },
});
const GAUZE = { description: "Sterile gauze swabs 10x10cm 5s", code: "SG1002", quantity: 4, unit: "box", batch: "LOT7781A", expiry: "2029-03-31", evidence: "SG1002    Sterile gauze swabs 10x10cm 5s       4   box    LOT7781A  03/2029" };
const NEEDLES = { description: "Needles 21G green 100", code: "NE2210", quantity: 10, unit: "pack", batch: "B20991", expiry: "2028-05-31", evidence: "NE2210    Needles 21G green 100               10   pack   B20991    31/05/2028" };
const ADR = { description: "Adrenaline 1mg/ml ampoules 10", code: "AD0001", quantity: 2, unit: "box", batch: null, expiry: null, evidence: "AD0001    Adrenaline 1mg/ml ampoules 10        2   box" };

test("a delivery note is read row by row, and every value is believed only as far as its own row is on the page", () => {
  const out = verifyExtraction({ parsed: deliveryParsed([GAUZE, NEEDLES, ADR]), ocrText: DELIVERY_TEXT, kind: "delivery", options: OPTIONS });
  assert.equal(out.kind, "delivery");
  assert.equal(out.fields.supplier.verified, true);
  assert.equal(out.fields.noteNumber.value, "DN-77120");
  assert.equal(out.fields.deliveryDate.verified, true);
  assert.equal(out.fields.orderReference.value, "PO-2026-0412");
  assert.equal(out.lines.length, 3);
  const [g, n, a] = out.lines;
  assert.deepEqual(g.verified, { description: true, code: true, quantity: true, batch: true, expiry: true }, "a month and year on the page confirms the last day of that month");
  assert.equal(g.expiry, "2029-03-31");
  assert.deepEqual(n.verified, { description: true, code: true, quantity: true, batch: true, expiry: true }, "a full date is confirmed as written");
  assert.equal(a.verified.batch, false, "no batch on the row, none believed");
  assert.equal(a.verified.expiry, false);
  assert.equal(a.quantity, 2);
  assert.deepEqual(out.warnings, []);
});

test("a row that is not on the page, a quantity that is not in its row, and an invented expiry are all marked unconfirmed", () => {
  const invented = { ...GAUZE, description: "Imaginary product", evidence: "ZZ9999 Imaginary product 12 box" };
  const wrongQty = { ...NEEDLES, quantity: 50 };
  const wrongExpiry = { ...GAUZE, expiry: "2030-01-31" };
  const out = verifyExtraction({ parsed: deliveryParsed([invented, wrongQty, wrongExpiry]), ocrText: DELIVERY_TEXT, kind: "delivery", options: OPTIONS });
  assert.equal(out.lines[0].rowFound, false);
  assert.equal(out.lines[0].evidence, null);
  assert.equal(out.lines[0].verified.quantity, false);
  assert.equal(out.lines[1].verified.quantity, false, "50 is not a number on that row");
  assert.equal(out.lines[1].verified.description, true);
  assert.equal(out.lines[2].verified.expiry, false, "an expiry that is not written in the row is not confirmed");
  assert.match(out.warnings.join(" "), /could not be confirmed/);
});

test("rows without a description or without any quote and quantity are dropped; a row with no quantity is kept but flagged", () => {
  const noQty = { ...GAUZE, quantity: null };
  const nothing = { description: "", evidence: "", quantity: 3 };
  const out = verifyExtraction({ parsed: deliveryParsed([noQty, nothing, { description: "Loose row", evidence: "", quantity: null }]), ocrText: DELIVERY_TEXT, kind: "delivery", options: OPTIONS });
  assert.equal(out.lines.length, 1);
  assert.equal(out.lines[0].quantity, null);
  assert.match(out.warnings.join(" "), /no quantity/);
  const none = verifyExtraction({ parsed: deliveryParsed([]), ocrText: DELIVERY_TEXT, kind: "delivery", options: OPTIONS });
  assert.match(none.warnings.join(" "), /could not find any product rows/);
});

test("quantities are plain numbers: text like 4 is accepted, nonsense, zero and negatives are not", () => {
  const rows = [{ ...GAUZE, quantity: "4" }, { ...GAUZE, quantity: 0 }, { ...GAUZE, quantity: -3 }, { ...GAUZE, quantity: "lots" }, { ...GAUZE, quantity: 1e9 }];
  const out = verifyExtraction({ parsed: deliveryParsed(rows), ocrText: DELIVERY_TEXT, kind: "delivery", options: OPTIONS });
  assert.deepEqual(out.lines.map((l) => l.quantity), [4, null, null, null, null]);
});

test("at most 80 rows are read, and the instructions for a delivery note say what not to do", () => {
  const many = Array.from({ length: 95 }, () => GAUZE);
  const out = verifyExtraction({ parsed: deliveryParsed(many), ocrText: DELIVERY_TEXT, kind: "delivery", options: OPTIONS });
  assert.equal(out.lines.length, 80);
  assert.match(out.warnings.join(" "), /first 80 rows/);
  const text = buildInstructions("delivery", cleanOptions(OPTIONS));
  assert.match(text, /DELIVERY NOTE/);
  assert.match(text, /DELIVERED on this note/);
  assert.match(text, /Never multiply/);
  assert.match(text, /LAST day of that month/);
  assert.match(text, /Do not include delivery charges/);
  assert.doesNotMatch(text, /CERTIFICATE \(/, "a delivery note is not asked about certificates");
  assert.match(buildInstructions("auto", cleanOptions(OPTIONS)), /"delivery"/, "auto also recognises a delivery note");
});

test("auto can say a document is a delivery note, and an unknown kind is refused", async () => {
  const fetchImpl = async () => ({ status: 200, ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(deliveryParsed([GAUZE])) }] }] }) });
  const out = await extractDocumentFields({ endpoint: "https://x.openai.azure.com", key: "k", deployment: "d", ocrText: DELIVERY_TEXT, kind: "auto", options: OPTIONS, fetchImpl });
  assert.equal(out.kind, "delivery");
  assert.equal(out.lines.length, 1);
  await assert.rejects(() => extractDocumentFields({ endpoint: "https://x.openai.azure.com", key: "k", deployment: "d", ocrText: "x", kind: "invoice", options: OPTIONS, fetchImpl }), /Unknown kind/);
});

test("who may read what: documents.intake reads any kind; stock access reads a delivery note only; nobody else reads anything", () => {
  assert.deepEqual(intakeAccess({ kind: "coshh", hasIntake: true }), { allowed: true });
  assert.deepEqual(intakeAccess({ kind: "auto", hasIntake: true, hasStockWrite: true }), { allowed: true });
  assert.deepEqual(intakeAccess({ kind: "delivery", hasStockWrite: true }), { allowed: true });
  for (const kind of ["auto", "certificate", "coshh"]) {
    const refused = intakeAccess({ kind, hasStockWrite: true });
    assert.equal(refused.allowed, false, `${kind} is refused for stock access alone`);
    assert.match(refused.message, /Delivery note/);
  }
  assert.equal(intakeAccess({ kind: "delivery" }).allowed, false);
  assert.match(intakeAccess({ kind: "delivery" }).message, /do not have permission/);
});
