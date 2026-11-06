import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { TEXT_PDF_LINES_PER_PAGE, textToPdf, wrapLines } from "../src/modules/documents/textPdf.js";
import { decodeWords, htmlToText, parseEml, pickAttachment } from "../src/modules/documents/emailParser.js";
import { ACCEPT, classify, fileProblem, prepareFile, recordAfterReading } from "../src/modules/documents/documentIntakeService.js";

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };
const ascii = (bytes) => Buffer.from(bytes).toString("latin1");
const file = (name, content, type = "") => new File([content], name, { type });
const b64 = (text) => Buffer.from(text, "latin1").toString("base64").replace(/(.{76})/g, "$1\r\n");
const PDF_TEXT = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n";

await t("text becomes a valid PDF that says it is a text copy, and long text runs over several pages", async () => {
  const bytes = textToPdf("Gas safety record\nCertificate number: GSR-48213", { title: "Text copy", source: "cert.docx", reason: "This is a text copy.", now: new Date(2026, 10, 6) });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()], [595, 842]);
  const text = ascii(bytes);
  assert.match(text, /Text copy/);
  assert.match(text, /from "cert\.docx"/);
  assert.match(text, /06 November 2026/);
  assert.match(text, /This is a text copy\./);
  assert.match(text, /GSR-48213/);
  const long = textToPdf(Array.from({ length: TEXT_PDF_LINES_PER_PAGE * 2 + 10 }, (_, i) => `line ${i}`).join("\n"));
  assert.equal((await PDFDocument.load(long)).getPageCount(), 3);
  assert.equal((await PDFDocument.load(textToPdf(""))).getPageCount(), 1, "an empty text is still a page");
});

await t("every cross-reference entry of the text PDF points at its own object", () => {
  const text = ascii(textToPdf(Array.from({ length: 150 }, (_, i) => `row ${i}`).join("\n")));
  const count = Number(/xref\n0 (\d+)\n/.exec(text)[1]) - 1;
  const entries = [...text.slice(text.indexOf("xref\n")).matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
  assert.equal(entries.length, count);
  entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
  assert.equal(Number(/startxref\n(\d+)/.exec(text)[1]), text.indexOf("xref\n0 "));
});

await t("brackets, backslashes, accents and letters the PDF font cannot show do not break the file", async () => {
  const bytes = textToPdf("Price (inc VAT) \\ café “quoted” – 5 € 日本語 \u0000 end");
  await PDFDocument.load(bytes);
  const text = ascii(bytes);
  assert.match(text, /\\\(inc VAT\\\)/, "parentheses are escaped");
  assert.match(text, /café|caf\\351/, "an accented letter is kept");
  assert.match(text, /"quoted" - 5 EUR/, "smart quotes and dashes become plain ones");
  assert.match(text, /\?\?\? \s*end|\?\?\?/, "letters that cannot be shown become ?");
});

await t("lines are cut at spaces to fit the page, and a very long word is cut rather than run off the edge", () => {
  const lines = wrapLines(`${"word ".repeat(60)}\n${"x".repeat(300)}`);
  assert.ok(lines.every((l) => l.length <= 92));
  assert.ok(lines.length > 4);
  assert.equal(lines.join("").replace(/\s/g, ""), `${"word".repeat(60)}${"x".repeat(300)}`, "nothing is lost");
  assert.deepEqual(wrapLines("a\n\nb"), ["a", "", "b"]);
});

const EML = [
  "From: =?utf-8?B?Sm9zw6kgR2Fz?= <jose@northerngas.example>",
  "To: practice@example.nhs.wales",
  "Subject: =?utf-8?Q?Gas_safety_record_=E2=80=93_Main_Surgery?=",
  "Date: Thu, 5 Nov 2026 09:12:00 +0000",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="MIX"',
  "",
  "--MIX",
  'Content-Type: multipart/alternative; boundary="ALT"',
  "",
  "--ALT",
  'Content-Type: text/plain; charset="utf-8"',
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Hello,=0D=0A=0D=0APlease find the certificate attached. Cost =C2=A3120.",
  "--ALT",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>Hello, <b>please</b> find it attached.</p>",
  "--ALT--",
  "--MIX",
  'Content-Type: image/png; name="logo.png"',
  "Content-Transfer-Encoding: base64",
  'Content-Disposition: inline; filename="logo.png"',
  "",
  b64("\x89PNG small logo"),
  "--MIX",
  'Content-Type: application/pdf; name="GSR-48213.pdf"',
  "Content-Transfer-Encoding: base64",
  'Content-Disposition: attachment; filename="GSR-48213.pdf"',
  "",
  b64(PDF_TEXT),
  "--MIX--",
  "",
].join("\r\n");

await t("an email is read: its headers (including encoded names), its text, and its attachments with their bytes", () => {
  const mail = parseEml(Buffer.from(EML, "latin1"));
  assert.equal(mail.headers.subject, "Gas safety record – Main Surgery");
  assert.match(mail.headers.from, /José Gas/);
  assert.match(mail.text, /^From: José Gas/);
  assert.match(mail.text, /Subject: Gas safety record – Main Surgery/);
  assert.match(mail.text, /Please find the certificate attached\. Cost £120\./);
  assert.doesNotMatch(mail.text, /<b>/, "the plain text part is used, not the web page version");
  assert.deepEqual(mail.attachments.map((a) => a.name), ["logo.png", "GSR-48213.pdf"]);
  assert.equal(ascii(mail.attachments[1].bytes), PDF_TEXT, "the attachment's bytes are exact");
});

await t("the document in an email is its PDF, not its logo; a small picture is ignored, and with nothing usable there is no pick", () => {
  const mail = parseEml(Buffer.from(EML, "latin1"));
  assert.equal(pickAttachment(mail.attachments).name, "GSR-48213.pdf");
  const big = new Uint8Array(40 * 1024);
  assert.equal(pickAttachment([{ name: "scan.jpg", type: "image/jpeg", bytes: big }, { name: "logo.png", type: "image/png", bytes: new Uint8Array(500) }]).name, "scan.jpg");
  assert.equal(pickAttachment([{ name: "logo.png", type: "image/png", bytes: new Uint8Array(500) }]), null);
  assert.equal(pickAttachment([{ name: "cert.docx", type: "", bytes: new Uint8Array(100) }, { name: "scan.jpg", type: "image/jpeg", bytes: big }]).name, "cert.docx", "a Word file before a photo");
  assert.equal(pickAttachment([{ name: "a.pdf", type: "application/pdf", bytes: new Uint8Array(100) }, { name: "b.docx", type: "", bytes: new Uint8Array(100) }]).name, "a.pdf", "a PDF first");
  assert.equal(pickAttachment([{ name: "setup.exe", type: "application/octet-stream", bytes: big }]), null, "a program is never the document");
  assert.equal(pickAttachment([]), null);
});

await t("an email that is only a web page is read as text; a broken one gives nothing instead of crashing", () => {
  const html = ["Subject: Invoice", "Content-Type: text/html; charset=utf-8", "", "<html><style>p{color:red}</style><body><p>Total &pound;99 &amp; VAT</p><br>Thanks&nbsp;all</body></html>"].join("\r\n");
  const mail = parseEml(html);
  assert.match(mail.text, /Total £99 & VAT/);
  assert.doesNotMatch(mail.text, /color:red|<p>/);
  for (const broken of ["", "no headers at all", "Content-Type: multipart/mixed\r\n\r\nbody", 'Content-Type: multipart/mixed; boundary="X"\r\n\r\n--X\r\n']) {
    const out = parseEml(broken);
    assert.deepEqual(out.attachments, [], JSON.stringify(broken));
  }
  assert.equal(decodeWords("plain subject"), "plain subject");
  assert.equal(htmlToText("<p>a</p><p>b</p>"), "a\nb");
});

await t("each kind of file is recognised by its name, then its type, and the unreadable ones say what to do instead", () => {
  const kinds = { "a.pdf": "pdf", "A.PDF": "pdf", "scan.JPG": "image", "p.png": "image", "p.webp": "image", "p.tiff": "image", "p.heic": "image", "c.docx": "office", "l.xlsx": "office", "d.pptx": "office", "m.eml": "email", "n.txt": "text", "d.csv": "text", "w.html": "html", "w.htm": "html" };
  for (const [name, kind] of Object.entries(kinds)) assert.equal(classify(file(name, "x")), kind, name);
  assert.equal(classify(file("noext", "x", "application/pdf")), "pdf");
  assert.equal(classify(file("noext", "x", "image/jpeg")), "image");
  assert.equal(classify(file("noext", "x", "message/rfc822")), "email");
  assert.equal(classify(file("noext", "x", "text/html")), "html");
  assert.equal(classify(file("noext", "x", "application/octet-stream")), "");
  assert.equal(fileProblem(file("a.pdf", "x")), "");
  assert.match(fileProblem(file("old.doc", "x")), /cannot read a Word 97-2003 file.*Save as.*PDF/);
  assert.match(fileProblem(file("old.xls", "x")), /Excel 97-2003/);
  assert.match(fileProblem(file("note.rtf", "x")), /Rich Text/);
  assert.match(fileProblem(file("mail.msg", "x")), /Outlook message.*Drag the attachment/);
  assert.match(fileProblem(file("setup.exe", "x")), /cannot read \.exe files/);
  assert.match(fileProblem(file("pack.zip", "x")), /cannot read \.zip files/);
  assert.match(fileProblem(file("a.pdf", "")), /empty/);
  assert.match(fileProblem(null), /Choose a file/);
  assert.match(ACCEPT, /\.docx/);
  assert.match(ACCEPT, /\.eml/);
});

await t("a PDF is kept as it is; text and web pages become a PDF of their text", async () => {
  const pdf = file("gas.pdf", PDF_TEXT, "application/pdf");
  const a = await prepareFile(pdf);
  assert.equal(a.how, "pdf");
  assert.equal(a.record, pdf);
  assert.equal(a.send, pdf);
  const text = await prepareFile(file("notes.txt", "Certificate number GSR-1\nDone 14/10/2026"));
  assert.equal(text.how, "text");
  assert.equal(text.record.type, "application/pdf");
  assert.equal(text.record.name, "notes.pdf");
  assert.match(ascii(new Uint8Array(await text.record.arrayBuffer())), /GSR-1/);
  const page = await prepareFile(file("cert.html", "<h1>Gas Safe</h1><p>Number <b>GSR-2</b></p><script>alert(1)</script>"));
  const pageText = ascii(new Uint8Array(await page.record.arrayBuffer()));
  assert.match(pageText, /GSR-2/);
  assert.doesNotMatch(pageText, /alert\(1\)|<b>/);
  await assert.rejects(prepareFile(file("empty.txt", "   \n  ")), /no text/);
  await assert.rejects(prepareFile(file("huge.txt", "x".repeat(250000))), /too long/);
});

await t("an email's attachment is the document; with no attachment its text is; with neither it is refused", async () => {
  const withPdf = await prepareFile(file("from-contractor.eml", Buffer.from(EML, "latin1")));
  assert.equal(withPdf.how, "email-attachment");
  assert.equal(withPdf.record.name, "GSR-48213.pdf");
  assert.equal(ascii(new Uint8Array(await withPdf.record.arrayBuffer())), PDF_TEXT);
  assert.match(withPdf.note, /attachment "GSR-48213\.pdf" from the email "Gas safety record – Main Surgery"/);
  const textOnly = await prepareFile(file("note.eml", ["Subject: Cert", "Content-Type: text/plain", "", "The gas certificate number is GSR-7."].join("\r\n")));
  assert.equal(textOnly.how, "email-text");
  assert.match(ascii(new Uint8Array(await textOnly.record.arrayBuffer())), /GSR-7/);
  assert.match(textOnly.note, /no PDF or photo attached/);
  await assert.rejects(prepareFile(file("blank.eml", "Subject: x\r\n\r\n")), /no attachment and no text/);
});

await t("Word, Excel, PowerPoint and pictures a browser cannot open are sent as they are, with a clear note that the record will be a text copy", async () => {
  for (const name of ["cert.docx", "log.xlsx", "deck.pptx"]) {
    const prepared = await prepareFile(file(name, "PK-fake"));
    assert.equal(prepared.how, "office");
    assert.equal(prepared.record, null);
    assert.equal(prepared.send.name, name);
    assert.match(prepared.note, /text copy.*Replace PDF/);
  }
  await assert.rejects(prepareFile(file("old.doc", "x")), /Save as/);
  await assert.rejects(prepareFile(file("big.docx", new Uint8Array(11 * 1024 * 1024))), /over 10 MB/);
});

await t("the record of a Word file is a labelled text copy made from what the server read; without that text there is no record", async () => {
  const original = file("Gas Certificate.docx", "PK-fake");
  const prepared = await prepareFile(original);
  const record = recordAfterReading(prepared, { textCopy: "Certificate number: GSR-48213" }, original);
  assert.equal(record.name, "Gas Certificate-text-copy.pdf");
  assert.equal(record.type, "application/pdf");
  const text = ascii(new Uint8Array(await record.arrayBuffer()));
  assert.match(text, /Text copy of a document/);
  assert.match(text, /from "Gas Certificate\.docx"/);
  assert.match(text, /Keep the original file too/);
  assert.match(text, /GSR-48213/);
  assert.throws(() => recordAfterReading(prepared, { textCopy: "  " }, original), /no copy of it could be made/);
  assert.throws(() => recordAfterReading(prepared, {}, original), /no copy of it could be made/);
  const pdfPrepared = await prepareFile(file("a.pdf", PDF_TEXT, "application/pdf"));
  assert.equal(recordAfterReading(pdfPrepared, {}, null), pdfPrepared.record, "a PDF is its own record");
});

console.log(`\n${n} passed`);
