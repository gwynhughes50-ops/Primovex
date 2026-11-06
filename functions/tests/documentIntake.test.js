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
  assert.match(text, /"kind" is "certificate", "coshh" or "other"/);
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
