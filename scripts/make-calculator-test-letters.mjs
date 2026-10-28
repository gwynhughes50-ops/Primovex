// Makes the calculator test letters as PDFs, with an answer sheet (ANSWERS.csv), in the folder given on the command line:
//   node scripts/make-calculator-test-letters.mjs "C:/Users/<you>/Desktop/calculators"
// The letters and their expected answers are in calculator-test-letters.mjs, which the test (npm run test:clinflow-calculator-letters) checks against ClinFlow.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { FOOTER, KINDS, LETTERS, LETTER_DATE } from "./calculator-test-letters.mjs";

const out = process.argv[2];
if (!out) { console.error("Say which folder to write the letters to."); process.exit(1); }
mkdirSync(out, { recursive: true });

const wrap = (font, size, text, width) => {
  const lines = []; let line = "";
  for (const word of text.split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(next, size) > width) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line);
  return lines;
};

const rows = [["File", "What it tests", "What ClinFlow should show (SNOMED Review tab, items marked calculated)", "Notes"]];
let index = 0;
for (const letter of LETTERS) {
  index += 1;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  const draw = (text, { size = 11, weight = font, x = 56 } = {}) => { page.drawText(text, { x, y, size, font: weight, color: rgb(0.1, 0.1, 0.12) }); };
  draw(letter.from, { size: 15, weight: bold }); y -= 16; draw(letter.dept); y -= 12;
  page.drawLine({ start: { x: 56, y }, end: { x: 539, y }, thickness: 1, color: rgb(0.5, 0.5, 0.55) }); y -= 28;
  draw(`Date: ${LETTER_DATE}`); y -= 28;
  draw("Dr A N Other"); y -= 14; draw("Greenfield Surgery"); y -= 14; draw("123 High Street, Mold, CH7 1AB"); y -= 30;
  draw("Dear Dr Other"); y -= 24;
  draw(`Re: ${letter.who}  DOB: ${letter.dob}  NHS number: ${letter.nhs}`, { weight: bold }); y -= 24;
  for (const paragraph of letter.body) {
    for (const line of wrap(font, 11, paragraph, 483)) { draw(line); y -= 15; }
    y -= 9;
  }
  y -= 10; draw("Yours sincerely"); y -= 40; draw(`Dr B Consultant, ${letter.dept}`, { weight: bold });
  page.drawText(FOOTER, { x: 56, y: 40, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  const file = `${String(index).padStart(2, "0")}-${letter.slug}.pdf`;
  writeFileSync(path.join(out, file), await pdf.save());
  // the wording ClinFlow uses: "1 point", "2 points", and a blood pressure average named for how it was taken
  const label = (kind) => (kind.startsWith("bp-") ? `Average ${/home/.test(letter.slug) ? "home" : "24 hour"} ${kind.slice(3)} blood pressure (calculated)` : KINDS[kind][0]);
  const unit = (kind, value) => (KINDS[kind][1] === "points" && value === 1 ? "point" : KINDS[kind][1]);
  const shows = letter.expect.length
    ? letter.expect.map(([kind, value]) => `${label(kind)}: ${value}${unit(kind, value) ? ` ${unit(kind, value)}` : ""}`).join("; ")
    : "Nothing: no calculation should appear";
  rows.push([file, letter.tests, shows, letter.note || ""]);
}
const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n";
writeFileSync(path.join(out, "ANSWERS.csv"), csv);
console.log(`${LETTERS.length} letters and ANSWERS.csv written to ${out}`);
