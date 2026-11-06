// Makes the made-up test documents for Add a document (see test-documents.mjs), plus an answer sheet and a short guide, in the folder given:
//   node scripts/make-test-documents.mjs "C:/Users/<you>/OneDrive/Desktop/Add a document tests"
// PDFs are drawn with pdf-lib; the Word and Excel files are written directly (they are zip files of XML); the photo is a screenshot of a tilted page made with Edge (skipped
// with a message if Edge is not installed).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { strToU8, zipSync } from "fflate";
import { DOCUMENTS, SAMPLE_FOOTER, emailText, plainText } from "./test-documents.mjs";

const out = process.argv[2];
if (!out) { console.error("Say which folder to write the documents to."); process.exit(1); }
mkdirSync(out, { recursive: true });
const written = [];
const save = (file, bytes) => { writeFileSync(path.join(out, file), bytes); written.push(file); };
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- PDF ----------
async function makePdf(doc) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const width = 483;
  const ink = rgb(0.1, 0.1, 0.12);
  const wrap = (f, size, text) => {
    const lines = []; let line = "";
    for (const word of String(text).split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (f.widthOfTextAtSize(next, size) > width) { lines.push(line); line = word; } else line = next; }
    if (line) lines.push(line);
    return lines;
  };
  const room = (need) => { if (y - need < 70) { page = pdf.addPage([595, 842]); y = 790; } };
  page.drawText("SAMPLE DOCUMENT", { x: 56, y: 818, size: 8, font: bold, color: rgb(0.55, 0.1, 0.1) });
  for (const block of doc.blocks) {
    if (block.t === "gap") { y -= 10; continue; }
    const style = { title: [15, bold], h: [12.5, bold], line: [10.5, font], para: [10.5, font] }[block.t];
    room(style[0] + 10);
    for (const line of wrap(style[1], style[0], block.text)) {
      room(style[0] + 4);
      page.drawText(line, { x: 56, y, size: style[0], font: style[1], color: ink });
      y -= style[0] + (block.t === "title" ? 6 : block.t === "h" ? 8 : 4.5);
    }
    if (block.t === "h") y -= 2;
  }
  for (const p of pdf.getPages()) {
    p.drawLine({ start: { x: 56, y: 56 }, end: { x: 539, y: 56 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.65) });
    p.drawText(SAMPLE_FOOTER, { x: 56, y: 42, size: 7.5, font: italic, color: rgb(0.45, 0.45, 0.5) });
  }
  return pdf.save();
}

// ---------- Word and Excel (zip files of XML) ----------
const docxParagraph = (block) => {
  if (block.t === "gap") return "<w:p/>";
  const bold = block.t === "title" || block.t === "h";
  const size = block.t === "title" ? 32 : block.t === "h" ? 26 : 22;
  return `<w:p><w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(block.text)}</w:t></w:r></w:p>`;
};
function makeDocx(doc) {
  const blocks = [...doc.blocks, { t: "gap" }, { t: "line", text: SAMPLE_FOOTER }];
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${blocks.map(docxParagraph).join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`),
  });
}
function makeXlsx(doc) {
  const lines = [...doc.blocks.filter((b) => b.t !== "gap").map((b) => b.text), SAMPLE_FOOTER];
  const rows = lines.map((text, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c></row>`).join("");
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Test log" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="90" customWidth="1"/></cols><sheetData>${rows}</sheetData></worksheet>`),
  });
}

// ---------- emails ----------
const wrap76 = (b64) => b64.replace(/(.{76})/g, "$1\r\n");
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
function makeEmlWithAttachment(doc) {
  const pdfName = doc.attachment;
  const pdf = readFileSync(path.join(out, pdfName));
  return [
    "From: Sam Liftsafe <sam@liftsafe-sample.example>", "To: practice.manager@greenfield-sample.example", "Subject: Lift thorough examination report", "Date: Fri, 6 Nov 2026 09:30:00 +0000",
    "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="SAMPLE-BOUNDARY"', "",
    "--SAMPLE-BOUNDARY", "Content-Type: text/plain; charset=utf-8", "", "Hello,", "", "The report for the lift is attached.", "", "Kind regards,", "Sam (invented sender)", "", SAMPLE_FOOTER, "",
    "--SAMPLE-BOUNDARY", 'Content-Type: image/png; name="company-logo.png"', "Content-Transfer-Encoding: base64", 'Content-Disposition: inline; filename="company-logo.png"', "", TINY_PNG, "",
    "--SAMPLE-BOUNDARY", `Content-Type: application/pdf; name="${pdfName}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${pdfName}"`, "", wrap76(pdf.toString("base64")), "",
    "--SAMPLE-BOUNDARY--", "",
  ].join("\r\n");
}

// ---------- a tilted photo of a page (Edge headless screenshot) ----------
function makePhoto(doc, file) {
  const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
  if (!edge) { console.log(`Skipped ${file}: Microsoft Edge was not found to make the photo.`); return false; }
  const rows = doc.blocks.map((b) => (b.t === "gap" ? "<div style='height:14px'></div>" : `<div class="${b.t}">${esc(b.text)}</div>`)).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;width:1100px;height:780px;background:linear-gradient(100deg,#7a5a3c,#9c7a55 40%,#6f5136);overflow:hidden;font-family:Arial,Helvetica,sans-serif}
.paper{position:absolute;left:150px;top:110px;width:760px;padding:70px 64px 60px;background:#f4f1e8;color:#2b2b2b;transform:rotate(-2.6deg);box-shadow:8px 14px 40px rgba(0,0,0,.45);filter:contrast(.93) brightness(.97)}
.title{font-size:30px;font-weight:bold;margin-bottom:10px}.h{font-size:24px;font-weight:bold;margin:8px 0 14px}.line{font-size:21px;margin:7px 0}.para{font-size:21px;margin:7px 0}
.foot{margin-top:50px;font-size:14px;color:#777;font-style:italic}.tag{position:absolute;top:34px;left:64px;font-size:13px;font-weight:bold;color:#8b1a1a}
</style><div class="paper"><div class="tag">SAMPLE DOCUMENT</div>${rows}<div class="foot">${esc(SAMPLE_FOOTER)}</div></div>`;
  const dir = path.join(os.tmpdir(), "primovex-test-photo");
  mkdirSync(dir, { recursive: true });
  const htmlPath = path.join(dir, "page.html");
  const pngPath = path.join(dir, "page.png");
  writeFileSync(htmlPath, html);
  rmSync(pngPath, { force: true });
  spawnSync(edge, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1100,780", `--user-data-dir=${path.join(dir, "profile")}`, `--screenshot=${pngPath}`, `file:///${htmlPath.replace(/\\/g, "/")}`], { stdio: "ignore", timeout: 60000 });
  // Edge's launcher can exit a moment before the picture is written: wait for it (up to 20 seconds)
  for (let i = 0; i < 40 && !(existsSync(pngPath) && readFileSync(pngPath).length > 1000); i += 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  if (!existsSync(pngPath)) { console.log(`Skipped ${file}: Edge could not make the photo.`); return false; }
  save(file, readFileSync(pngPath));
  return true;
}

// ---------- write everything ----------
for (const doc of DOCUMENTS) {
  switch (doc.format) {
    case "docx": save(doc.file, makeDocx(doc)); break;
    case "xlsx": save(doc.file, makeXlsx(doc)); break;
    case "eml-text": save(doc.file, emailText(doc)); break;
    case "eml-with-attachment": break; // after the PDFs, below
    case "txt": save(doc.file, `${plainText(doc)}\n\n${SAMPLE_FOOTER}\n`); break;
    case "old-doc": save(doc.file, Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.from(`\0\0\0\0${SAMPLE_FOOTER} This stands in for an old Word 97-2003 file and cannot be opened.`, "latin1"), Buffer.alloc(200)])); break;
    case "photo-png": makePhoto(doc, doc.file); break;
    default: save(doc.file, await makePdf(doc));
  }
}
for (const doc of DOCUMENTS.filter((d) => d.format === "eml-with-attachment")) save(doc.file, makeEmlWithAttachment(doc));

// ---------- the answer sheet and the guide ----------
const csv = (cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`;
const label = (e) => (e ? (typeof e === "string" ? e : e.iso || "") : "");
const names = (list) => (list || []).map((x) => x.key).join(", ");
const rows = [["File", "What it tests", "Kind it should be", "Done by", "Reference", "Done on (yyyy-mm-dd)", "Runs out / next due (yyyy-mm-dd)", "Hazards / protection / first aid (keys)", "Engineer", "Checks it records (PROBLEM = should be flagged red)", "Notes"]];
for (const d of DOCUMENTS) {
  const e = d.expected || {};
  const detail = d.kind === "coshh" ? `hazards: ${e.notHazardous ? "none (the sheet says not hazardous)" : names(e.hazards)}; protection: ${names(e.ppe)}; first aid: ${names(e.firstAid)}` : "";
  const expiry = e.expiryDate === null ? `none written (form suggests ${e.suggestedExpiry})` : label(e.expiryDate);
  const kind = d.kind === "coshh" ? "COSHH data sheet" : e.type || (e.kind === "other" ? "not a certificate" : e.refused ? "refused" : e.usesAttachment ? "(as file 07)" : "");
  rows.push([d.file, d.tests, kind, d.kind === "coshh" ? `${e.supplier?.quote?.replace(/^Supplier: /, "") || ""}` : e.provider || "", d.kind === "coshh" ? (e.productName?.quote || "").replace(/^Product name: /, "") : e.reference || "", label(e.completedOn), expiry, detail, e.engineer?.value || "", (e.findings || []).map((c) => `${c.problem ? "PROBLEM: " : ""}${c.label}: ${c.answer}`).join("; "), d.notes || ""]);
}
written.push("ANSWERS.csv");
writeFileSync(path.join(out, "ANSWERS.csv"), `\ufeff${rows.map((r) => r.map(csv).join(",")).join("\r\n")}\r\n`);
writeFileSync(path.join(out, "READ ME FIRST.txt"), [
  "ADD A DOCUMENT: TEST FILES",
  "Everything in this folder is made up: invented companies, numbers, addresses and dates, and each file says SAMPLE on it. None of it is a real certificate or a real product.",
  "",
  "Before you start (once): Practice Admin > Module Access > Document reading > Only me.",
  "Then: Operations > Add a document (or the Add a document tile on the phone), and drop a file in.",
  "",
  "A good order:",
  "  1. 01 (last year's gas record), then save it, pick the site, tick the box.",
  "  2. 08 (this year's gas record). Primovex should offer to RENEW 01 rather than add a second one.",
  "  3. 05 (no expiry date written). The form should show 12 months from the service date, marked Check this, and say it is not from the document.",
  "  4. 10 (the dates contradict each other). You should see a warning and both dates marked Check this.",
  "  5. 12 (a lunch menu). It should say it could not tell what the document is.",
  "  6. 13 to 16 (COSHH data sheets). Each hazard and protective item should show the words from the sheet that back it. Anything not backed is shown but NOT ticked for you.",
  "  7. 09 (a photo), 17 (Word), 21 (Excel), 18 and 19 (emails), 20 (text). 22 (an old .doc) should be refused with what to do.",
  "  8. 23 (a gas record where the tightness test FAILED and the boiler is NOT safe to use). A red warning should appear and both checks should be on the form. After saving, it should be red at the top of the Certificates list, in the compliance needs-attention list, and on the phone.",
  "  Also look at 01 and 08: the engineer and two checks (tightness test: Pass, boiler safe to use: Yes) should be read onto the form, and show as green chips.",
  "",
  "ANSWERS.csv lists what each file should give. Please tell me anything that comes out wrong, missing, or ticked when it should not be.",
  "",
].join("\r\n"));
written.push("READ ME FIRST.txt");
console.log(`${written.length} files written to ${out}`);
