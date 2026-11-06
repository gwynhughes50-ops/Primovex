const crypto = require("crypto");

// Document intake: someone drops a certificate or a COSHH safety data sheet into Primovex, and the registers are pre-filled from it.
// Two steps run on the server: Azure Document Intelligence reads the page into text (azureDocumentIntelligenceService.js), then Azure OpenAI
// copies named facts out of that text into JSON (here). The result is only ever a SUGGESTION: the person checks and saves it on the normal form.
//
// What keeps it honest:
//  - the model must give, for every value, a short quote copied from the document. Code then checks the quote really is in the text and that
//    the value is in the quote (a date must be a date written in the quote). A value without that is returned as "check this", never as found.
//  - dates, the list a type or hazard is chosen from, and "is the expiry after the date it was done" are all decided here in code, not by the model.
//  - the model is told never to calculate an expiry date; one is only taken if the document writes one.
//  - nothing is stored: not the document, not its text. Only who, what kind, how big, a fingerprint and whether it worked (see index.js).

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_CHARS = 16000;
const MAX_THROTTLE_ATTEMPTS = 6;
const KEY = /^[a-z0-9_-]{1,40}$/;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- the file ----------
// What Azure Document Intelligence can read: PDF, photos (JPEG, PNG, BMP, TIFF, HEIF) and Word, Excel and PowerPoint files (the new .docx, .xlsx, .pptx kinds).
// The app turns everything else it can (webp and gif photos, emails, text, web pages) into a PDF before it gets here. The kind is decided from the file's own first
// bytes, never from its name or its claimed type, because those can be anything.
const OFFICE_PARTS = { docx: "word/document.xml", xlsx: "xl/workbook.xml", pptx: "ppt/presentation.xml" };
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
const READABLE = "PDF, a photo (JPEG, PNG, TIFF, BMP or HEIC), or a Word, Excel or PowerPoint file (.docx, .xlsx, .pptx)";
// the kinds that cannot be kept as the record by the app, so the server hands back the text it read to make a text copy from
const NEEDS_TEXT_COPY = new Set(["docx", "xlsx", "pptx", "tiff", "bmp", "heif"]);
const MIME_OK = /^(application\/pdf|image\/(jpeg|png|bmp|tiff|heic|heif)|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|application\/octet-stream)$/;

function kindOfBytes(bytes) {
  const head = bytes.subarray(0, 12);
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head[0] === 0x89 && head.subarray(1, 4).toString("latin1") === "PNG") return "png";
  if (head[0] === 0x42 && head[1] === 0x4d && bytes.length > 26) return "bmp";
  if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0) || (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0 && head[3] === 0x2a)) return "tiff";
  if (head.subarray(4, 8).toString("latin1") === "ftyp" && HEIF_BRANDS.has(head.subarray(8, 12).toString("latin1").toLowerCase())) return "heif";
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4) {
    // a zip: it is an Office file only if it holds that kind's main part. A plain zip, a jar or an old .docm-style file is not accepted.
    const text = bytes.toString("latin1");
    if (!text.includes("[Content_Types].xml")) return "";
    return Object.keys(OFFICE_PARTS).find((kind) => text.includes(OFFICE_PARTS[kind])) || "";
  }
  return "";
}

function decodeUpload({ base64, mimeType, fileName } = {}) {
  const raw = String(base64 || "").replace(/^data:[^,]*,/, "");
  if (!raw) throw new Error("No document was sent.");
  if (raw.length > Math.ceil(MAX_BYTES * 4 / 3) + 16) throw new Error("That file is over 10 MB.");
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length) throw new Error("That file is empty.");
  if (bytes.length > MAX_BYTES) throw new Error("That file is over 10 MB.");
  const kind = kindOfBytes(bytes);
  if (!kind) throw new Error(`That kind of file cannot be read. Use a ${READABLE}.`);
  const claimed = String(mimeType || "").toLowerCase();
  if (claimed && !MIME_OK.test(claimed)) throw new Error(`That kind of file cannot be read. Use a ${READABLE}.`);
  const name = String(fileName || "document").replace(/[^A-Za-z0-9._ -]+/g, "_").slice(-120) || "document";
  return {
    bytes, base64: bytes.toString("base64"), kind, fileName: name, sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    // only a PDF or a TIFF can be read page by page, so the page limit is only sent for those
    canLimitPages: kind === "pdf" || kind === "tiff",
    needsTextCopy: NEEDS_TEXT_COPY.has(kind),
  };
}

// ---------- the choices the model may use ----------
// The app sends the lists it picks from (certificate types, hazards, protective equipment, first aid); only well-formed entries are used.
function cleanOptions(raw = {}) {
  const list = (value, max = 40) => (Array.isArray(value) ? value : [])
    .map((item) => ({ key: String(item?.key || ""), label: String(item?.label || "").replace(/\s+/g, " ").trim().slice(0, 140) }))
    .filter((item) => KEY.test(item.key) && item.label)
    .slice(0, max);
  return { certTypes: list(raw.certTypes), hazards: list(raw.hazards), ppe: list(raw.ppe), firstAid: list(raw.firstAid) };
}

// ---------- the prompt ----------
const common = [
  "You read UK GP-practice paperwork from the OCR text of a scanned page and copy facts into JSON.",
  "Extract only what is explicitly written. Never infer, calculate, correct or guess. If something is not written, its value is null.",
  "For EVERY value you return, also return `evidence`: a short exact quote (under 160 characters) copied character for character from the text that shows the value. No evidence, no value.",
  "The text may have scanning faults (broken lines, doubled spaces, misread letters): copy the quote as it appears, do not tidy it.",
  "Dates are UK format (day first). Return dates as YYYY-MM-DD, and make sure the quote contains the date as written.",
  "Respond with a single JSON object and nothing else.",
];

function listOf(items) {
  return items.map((item) => `${item.key}: ${item.label}`).join("\n");
}

function buildInstructions(kind, options) {
  const lines = [...common];
  const shapes = [];
  if (kind === "certificate" || kind === "auto") {
    lines.push(
      "CERTIFICATE (a safety certificate, test or inspection report, service record or insurance certificate):",
      "- type.value: the key of the ONE kind from this list that the document is, or null if none fits clearly:\n" + listOf(options.certTypes),
      "- provider: the company or person who carried out the work or issued the document, as written.",
      "- reference: the certificate, report or policy number, as written.",
      "- completedOn: the date the inspection, test, service or work was done, or the date the cover started. Not the date printed for 'next due'.",
      "- expiryDate: ONLY a date the document itself gives as the expiry, 'valid until', 'next inspection due', 'next service due', 'renewal date' or similar. Do NOT work one out from the date done. If none is written, null.",
      "- premises: the address or site the document covers, as written."
    );
    shapes.push('"certificate": {"type": {"value": string|null, "evidence": string|null}, "provider": {"value": string|null, "evidence": string|null}, "reference": {"value": string|null, "evidence": string|null}, "completedOn": {"value": "YYYY-MM-DD"|null, "evidence": string|null}, "expiryDate": {"value": "YYYY-MM-DD"|null, "evidence": string|null}, "premises": {"value": string|null, "evidence": string|null}}');
  }
  if (kind === "coshh" || kind === "auto") {
    lines.push(
      "COSHH SAFETY DATA SHEET (a manufacturer's safety data sheet for a chemical product):",
      "- productName: the product name as on the sheet (section 1).",
      "- supplier: the supplier or manufacturer named in section 1.",
      "- hazards: the keys from this list that the sheet's hazard classification, hazard statements (H-codes) or pictograms (section 2) show. Each with a quote. If the sheet says the product is not classified as hazardous, set notHazardous true with a quote, and return no hazards:\n" + listOf(options.hazards),
      "- ppe: the keys from this list that section 8 (personal protection) calls for, each with a quote:\n" + listOf(options.ppe),
      "- firstAid: the keys from this list that section 4 (first-aid measures) calls for, each with a quote:\n" + listOf(options.firstAid)
    );
    shapes.push('"coshh": {"productName": {"value": string|null, "evidence": string|null}, "supplier": {"value": string|null, "evidence": string|null}, "hazards": [{"key": string, "evidence": string}], "notHazardous": {"value": boolean, "evidence": string|null}, "ppe": [{"key": string, "evidence": string}], "firstAid": [{"key": string, "evidence": string}]}');
  }
  if (kind === "auto") lines.push('Also say what the document is: "kind" is "certificate", "coshh" or "other". Fill in only the section for the kind it is; leave the other out.');
  lines.push(`Shape: {${kind === "auto" ? '"kind": "certificate"|"coshh"|"other", ' : ""}${shapes.join(", ")}}`);
  return lines.join("\n");
}

// ---------- checking what came back ----------
const norm = (text) => String(text ?? "").normalize("NFKD").toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9%&/.:+-]+/g, " ").replace(/\s+/g, " ").trim();
const MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };

function isoOf(year, month, day) {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// every date written in a piece of text, as ISO days (numeric dates are day first)
function datesIn(text) {
  const t = String(text || "");
  const found = new Set();
  for (const m of t.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) found.add(isoOf(+m[1], +m[2], +m[3]));
  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)) found.add(isoOf(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]));
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/g)) found.add(isoOf(+m[3], MONTHS[m[2].toLowerCase()] || 0, +m[1]));
  for (const m of t.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) found.add(isoOf(+m[3], MONTHS[m[1].toLowerCase()] || 0, +m[2]));
  found.delete("");
  return [...found];
}

const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const clean = (value, max) => (typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim().slice(0, max) : null);

// one quoted value -> { value, evidence, verified }. `verified` is true only when the quote is in the document and the value is in the quote.
function shapeField(raw, ocrNorm, { date = false, max = 200 } = {}) {
  const field = asObject(raw);
  const evidence = clean(field.evidence, 200);
  const quoteFound = Boolean(evidence) && norm(evidence).length >= 4 && ocrNorm.includes(norm(evidence));
  if (date) {
    const iso = typeof field.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(field.value) && isoOf(+field.value.slice(0, 4), +field.value.slice(5, 7), +field.value.slice(8, 10)) ? field.value : null;
    if (!iso) return { value: null, evidence: quoteFound ? evidence : null, verified: false };
    return { value: iso, evidence: quoteFound ? evidence : null, verified: quoteFound && datesIn(evidence).includes(iso) };
  }
  const value = clean(field.value, max);
  if (!value) return { value: null, evidence: quoteFound ? evidence : null, verified: false };
  return { value, evidence: quoteFound ? evidence : null, verified: quoteFound && norm(evidence).includes(norm(value)) };
}

// a list of { key, evidence } picked from the allowed keys only; each is verified by its quote
function shapePicks(raw, allowed, ocrNorm) {
  const keys = new Set(allowed.map((item) => item.key));
  const seen = new Set();
  const out = [];
  for (const item of (Array.isArray(raw) ? raw : []).slice(0, 40)) {
    const key = String(asObject(item).key || "");
    if (!keys.has(key) || seen.has(key)) continue;
    seen.add(key);
    const evidence = clean(asObject(item).evidence, 200);
    const quoteFound = Boolean(evidence) && norm(evidence).length >= 3 && ocrNorm.includes(norm(evidence));
    out.push({ key, evidence: quoteFound ? evidence : null, verified: quoteFound });
  }
  return out;
}

// the model's JSON -> the checked result the app shows. Pure.
function verifyExtraction({ parsed, ocrText, kind, options }) {
  const ocrNorm = norm(ocrText);
  const root = asObject(parsed);
  const guess = ["certificate", "coshh", "other"].includes(root.kind) ? root.kind : null;
  const decided = kind === "auto" ? (guess || "other") : kind;
  const warnings = [];
  const out = { kind: decided, kindGuess: guess };

  if (decided === "certificate") {
    const c = asObject(root.certificate);
    const type = shapeField(c.type, ocrNorm, { max: 40 });
    const typeKey = options.certTypes.some((item) => item.key === type.value) ? type.value : null;
    out.fields = {
      type: { ...type, value: typeKey, verified: Boolean(typeKey) && type.verified },
      provider: shapeField(c.provider, ocrNorm, { max: 120 }),
      reference: shapeField(c.reference, ocrNorm, { max: 80 }),
      completedOn: shapeField(c.completedOn, ocrNorm, { date: true }),
      expiryDate: shapeField(c.expiryDate, ocrNorm, { date: true }),
      premises: shapeField(c.premises, ocrNorm, { max: 160 }),
    };
    const { completedOn, expiryDate } = out.fields;
    if (completedOn.value && expiryDate.value && expiryDate.value < completedOn.value) {
      warnings.push("The expiry date is before the date it was done. One of them has probably been misread.");
      completedOn.verified = false;
      expiryDate.verified = false;
    }
  } else if (decided === "coshh") {
    const s = asObject(root.coshh);
    const notHazardous = shapeField({ value: s.notHazardous?.value === true ? "yes" : null, evidence: asObject(s.notHazardous).evidence }, ocrNorm);
    // "not hazardous" is only believed with a real quote; it is the one answer that makes a product look safe
    const claimsSafe = s.notHazardous?.value === true && Boolean(notHazardous.evidence);
    out.fields = {
      productName: shapeField(s.productName, ocrNorm, { max: 160 }),
      supplier: shapeField(s.supplier, ocrNorm, { max: 120 }),
      hazards: claimsSafe ? [] : shapePicks(s.hazards, options.hazards, ocrNorm),
      notHazardous: { value: claimsSafe, evidence: claimsSafe ? notHazardous.evidence : null, verified: claimsSafe },
      ppe: shapePicks(s.ppe, options.ppe, ocrNorm),
      firstAid: shapePicks(s.firstAid, options.firstAid, ocrNorm),
    };
    if (s.notHazardous?.value === true && !claimsSafe) warnings.push("The sheet may say the product is not hazardous, but no wording in the document backs that up. Read section 2 yourself.");
  } else {
    out.fields = {};
    warnings.push("This does not look like a certificate or a safety data sheet.");
  }
  out.warnings = warnings;
  return out;
}

// ---------- the call to Azure OpenAI ----------
function retryDelayMs(response, attempt = 0) {
  const ms = Number(response?.headers?.get?.("x-ms-retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return Math.min(ms, 30000);
  const seconds = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30000);
  return Math.min(4000 * (2 ** attempt), 30000);
}

function endpointOf(endpoint) {
  const value = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(value)) throw new Error("The Azure OpenAI endpoint is missing or invalid.");
  return value;
}

async function extractDocumentFields({ endpoint, key, deployment, ocrText, kind = "auto", options, fetchImpl = fetch }) {
  if (!["auto", "certificate", "coshh"].includes(kind)) throw new Error("Unknown kind of document.");
  if (!String(key || "").trim()) throw new Error("The Azure OpenAI key is missing.");
  if (!String(deployment || "").trim()) throw new Error("The Azure OpenAI deployment name is missing.");
  const url = `${endpointOf(endpoint)}/openai/v1/responses`;
  const choices = cleanOptions(options);
  const text = String(ocrText || "").slice(0, MAX_INPUT_CHARS);
  let response;
  for (let attempt = 0; attempt < MAX_THROTTLE_ATTEMPTS; attempt += 1) {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify({
        model: deployment,
        instructions: buildInstructions(kind, choices),
        // json_object mode needs the word "json" in the input itself
        input: `Copy the facts as JSON from this document's OCR text:\n\n${text}`,
        text: { format: { type: "json_object" } },
        temperature: 0,
        max_output_tokens: 2200,
      }),
    });
    if (response.status !== 429) break;
    await sleep(retryDelayMs(response, attempt));
  }
  if (!response.ok) throw new Error(`Azure OpenAI rejected the request (${response.status}).`);
  const payload = await response.json();
  const message = payload?.output?.find((item) => item.type === "message");
  const raw = message?.content?.find((item) => item.type === "output_text")?.text;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Azure OpenAI did not return valid structured output."); }
  return verifyExtraction({ parsed, ocrText: text, kind, options: choices });
}

module.exports = { MAX_BYTES, READABLE, buildInstructions, cleanOptions, datesIn, decodeUpload, extractDocumentFields, norm, verifyExtraction };
