// A plain-text PDF: used when the record of a dropped document has to be a PDF (the registers and the desktop viewer only hold PDFs) but the document itself is not one and cannot be turned into one in the
// browser: an email's text, a text or web-page file, or the text Azure read from a Word or Excel file. It is a TEXT COPY, not the original, and says so at the top of the first page. Pure (no screens).

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 42;
const SIZE = 9;
const LEADING = 11.5;
const COLUMNS = 92; // Courier at 9 pt is 5.4 pt wide: 92 characters fit between the margins
const LINES_PER_PAGE = Math.floor((PAGE_H - 2 * MARGIN) / LEADING);

const SWAPS = { "‘": "'", "’": "'", "‚": ",", "“": '"', "”": '"', "–": "-", "—": "-", "−": "-", "•": "*", "…": "...", " ": " ", " ": " ", " ": " ", "€": "EUR" };

// What the standard PDF font can show: plain ASCII, and the Latin-1 letters and signs (160 to 255). Anything else becomes "?".
function cleanText(text) {
  let out = "";
  for (const ch of String(text ?? "").normalize("NFC")) {
    if (SWAPS[ch]) { out += SWAPS[ch]; continue; }
    const code = ch.codePointAt(0);
    if (ch === "\t") out += "    ";
    else if (ch === "\n" || ch === "\r") out += ch;
    else if ((code >= 32 && code < 127) || (code >= 160 && code <= 255)) out += ch;
    else if (code >= 127) out += "?";
  }
  return out;
}

// the text cut into lines that fit the page, at spaces where it can
export function wrapLines(text, columns = COLUMNS) {
  const lines = [];
  for (const raw of cleanText(text).replace(/\r\n?/g, "\n").split("\n")) {
    let line = raw.replace(/\s+$/, "");
    if (!line) { lines.push(""); continue; }
    while (line.length > columns) {
      let cut = line.lastIndexOf(" ", columns);
      if (cut < columns * 0.5) cut = columns;
      lines.push(line.slice(0, cut).replace(/\s+$/, ""));
      line = line.slice(cut).replace(/^\s+/, "");
    }
    lines.push(line);
  }
  return lines;
}

// a PDF string: parentheses and backslashes escaped, and Latin-1 letters written as octal so the file stays plain ASCII
const pdfString = (line) => `(${[...line].map((ch) => { const c = ch.charCodeAt(0); return ch === "\\" || ch === "(" || ch === ")" ? `\\${ch}` : c > 126 ? `\\${c.toString(8).padStart(3, "0")}` : ch; }).join("")})`;

const enc = new TextEncoder();

// `source` is what it is a copy of ("Certificate.docx"); `reason` is why it is a copy.
export function textToPdf(text, { title = "Text copy", source = "", reason = "", now = new Date() } = {}) {
  const day = now.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const header = [
    `${title}`,
    `Made by Primovex on ${day}${source ? ` from "${source}"` : ""}.`,
    reason || "This is a text copy of the document, not the original file.",
    "-".repeat(COLUMNS),
    "",
  ];
  const lines = [...wrapLines(header.join("\n")), ...wrapLines(text)];
  const pages = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) pages.push(lines.slice(i, i + LINES_PER_PAGE));
  if (!pages.length) pages.push([""]);

  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => { const b = typeof chunk === "string" ? enc.encode(chunk) : chunk; parts.push(b); length += b.length; };
  const object = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };
  // 1 catalog, 2 page tree, 3 font, then a page and its content for each page
  const pageObject = (i) => 4 + i * 2;
  const total = 3 + pages.length * 2;
  push("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObject(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  object(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  pages.forEach((pageLines, i) => {
    const content = `BT /F1 ${SIZE} Tf ${LEADING} TL ${MARGIN} ${PAGE_H - MARGIN - SIZE} Td\n${pageLines.map((line) => `${pdfString(line)} Tj T*`).join("\n")}\nET`;
    object(pageObject(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObject(i) + 1} 0 R >>`);
    object(pageObject(i) + 1, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`);
  });
  const xref = length;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n${Array.from({ length: total }, (_, k) => `${String(offsets[k + 1]).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const b of parts) { out.set(b, at); at += b.length; }
  return out;
}

export const TEXT_PDF_LINES_PER_PAGE = LINES_PER_PAGE;
