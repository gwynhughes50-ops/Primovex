// Builds the DPIA from content.cjs into:
//   ../../../public/governance/dpia-draft.html   (viewed in Security Centre)
//   ../../../public/governance/dpia-draft.docx   (downloaded for the DPO)
// Run: npm install && npm run build
const fs = require("node:fs");
const path = require("node:path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  AlignmentType, LevelFormat, HeadingLevel, Footer, PageNumber,
} = require("docx");
const content = require("./content.cjs");

const OUT = path.resolve(__dirname, "../../../public/governance");
const CONTENT_WIDTH = 9638; // A4 with 20 mm margins, in DXA
const escapeHtml = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isTbc = (t) => /To be completed/i.test(t);

// ---- docx ------------------------------------------------------------------------

const thin = { style: BorderStyle.SINGLE, size: 4, color: "BFB9A8" };
const borders = { top: thin, bottom: thin, left: thin, right: thin };

// "To be completed" is highlighted so a reader can see what is still open.
function runs(text, base = {}) {
  const out = [];
  String(text).split(/(To be completed)/g).forEach((part) => {
    if (!part) return;
    out.push(new TextRun({ text: part, ...base, ...(part === "To be completed" ? { italics: true, color: "96631A", bold: true } : {}) }));
  });
  return out;
}

const para = (text, opts = {}) => new Paragraph({ spacing: { after: 100, line: 276 }, ...opts, children: runs(text, opts.run || {}) });

function cell(text, width, { header = false, shade = null } = {}) {
  const fill = header ? "20211D" : shade;
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: fill ? { fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: String(text).split("\n").map((line) => new Paragraph({ spacing: { after: 40 }, children: runs(line, { size: 19, ...(header ? { bold: true, color: "FFFFFF" } : {}) }) })),
  });
}

function tableDocx(head, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, widths[i], { header: true })) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], { shade: i === 0 ? "F6F5F1" : null })) })),
    ],
  });
}

function blocksDocx(blocks) {
  const out = [];
  blocks.forEach((b) => {
    if (b.type === "h1") {
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 120 }, keepNext: true, children: [new TextRun({ text: b.step, size: 18, color: "8A1F2D", bold: true, font: "Consolas" }), new TextRun({ text: "  " }), new TextRun({ text: b.text })] }));
    } else if (b.type === "h2") {
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, keepNext: true, children: [new TextRun({ text: b.text })] }));
    } else if (b.type === "h3") {
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 60 }, keepNext: true, children: [new TextRun({ text: b.text })] }));
    } else if (b.type === "p") {
      out.push(para(b.text));
    } else if (b.type === "bullets") {
      b.items.forEach((item) => out.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60, line: 276 }, children: runs(item) })));
    } else if (b.type === "table") {
      out.push(tableDocx(b.head, b.rows, b.widths), new Paragraph({ spacing: { after: 120 }, children: [] }));
    } else if (b.type === "meta") {
      const w = [2600, CONTENT_WIDTH - 2600];
      out.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: w, rows: b.rows.map(([k, v]) => new TableRow({ children: [cell(k, w[0], { shade: "F6F5F1" }), cell(v, w[1])] })) }), new Paragraph({ spacing: { after: 160 }, children: [] }));
    } else if (b.type === "callout") {
      out.push(new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [CONTENT_WIDTH],
        rows: [new TableRow({ children: [new TableCell({
          borders: { top: { style: BorderStyle.SINGLE, size: 12, color: "8A1F2D" }, bottom: thin, left: thin, right: thin },
          width: { size: CONTENT_WIDTH, type: WidthType.DXA }, shading: { fill: "F6E9E9", type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 120, bottom: 120, left: 160, right: 160 },
          children: [new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: b.title, bold: true, size: 24 })] }), ...b.lines.map((l) => new Paragraph({ spacing: { after: 60, line: 276 }, children: runs(l, { size: 20 }) }))],
        })] })],
      }), new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
  });
  out.push(new Paragraph({ spacing: { before: 300 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "BFB9A8", space: 6 } }, children: [new TextRun({ text: content.footer, size: 17, italics: true, color: "5B5B52" })] }));
  return out;
}

async function buildDocx() {
  const doc = new Document({
    title: content.title,
    styles: {
      default: { document: { run: { font: "Calibri", size: 21 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: "Cambria", color: "20211D" }, paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: "Cambria", color: "20211D" }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, font: "Cambria", color: "5B5B52" }, paragraph: { spacing: { before: 180, after: 60 }, outlineLevel: 2 } },
      ],
    },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Primovex DPIA draft v0.2 · page ", size: 16, color: "8A8A7D" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "8A8A7D" })] })] }) },
      children: [
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "PRIMOVEX · DATA PROTECTION IMPACT ASSESSMENT", size: 18, bold: true, color: "8A1F2D", font: "Consolas" })] }),
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: content.title, size: 52, bold: true, font: "Cambria" })] }),
        new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: content.subtitle, size: 22, color: "5B5B52" })] }),
        ...blocksDocx(content.blocks),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(OUT, `${content.filename}.docx`), buffer);
  return buffer.length;
}

// ---- html ------------------------------------------------------------------------------

const cellHtml = (t) => escapeHtml(t).replace(/\n/g, "<br>").replace(/To be completed/g, '<span class="tbc">To be completed</span>');

function blocksHtml(blocks) {
  return blocks.map((b) => {
    switch (b.type) {
      case "h1": return `<section><div class="step">${escapeHtml(b.step)}</div><h2>${escapeHtml(b.text)}</h2></section>`;
      case "h2": return `<h3>${escapeHtml(b.text)}</h3>`;
      case "h3": return `<h4>${escapeHtml(b.text)}</h4>`;
      case "p": return `<p>${cellHtml(b.text)}</p>`;
      case "bullets": return `<ul>${b.items.map((i) => `<li>${cellHtml(i)}</li>`).join("")}</ul>`;
      case "table": return `<div class="tablewrap"><table><thead><tr>${b.head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${cellHtml(c)}</th>` : `<td>${cellHtml(c)}</td>`)).join("")}</tr>`).join("")}</tbody></table></div>`;
      case "meta": return `<dl class="meta">${b.rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${cellHtml(v)}</dd></div>`).join("")}</dl>`;
      case "callout": return `<aside class="callout"><h3>${escapeHtml(b.title)}</h3>${b.lines.map((l) => `<p>${cellHtml(l)}</p>`).join("")}</aside>`;
      default: return "";
    }
  }).join("\n");
}

const CSS = `
:root{--bg:#f6f5f1;--paper:#fff;--paper2:#faf9f6;--line:#dcd8cd;--ink:#20211d;--muted:#5b5b52;--accent:#8a1f2d;--soft:#f6e9e9;--amber:#96631a}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#16150f;--paper:#1e1d17;--paper2:#242319;--line:#3a3928;--ink:#ece9dd;--muted:#b3ae9c;--accent:#d97b84;--soft:#3a2020;--amber:#e0b25c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 "Segoe UI",system-ui,sans-serif;padding:24px 14px 80px}
.sheet{max-width:920px;margin:0 auto;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:40px clamp(18px,5vw,60px) 52px}
.kicker{font:600 11px/1 Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}
h1{font:700 clamp(26px,3.4vw,34px)/1.2 Georgia,serif;margin:.4em 0 .1em}.sub{color:var(--muted);margin:0 0 22px}
h2{font:700 22px/1.3 Georgia,serif;margin:0 0 10px}h3{font:700 17px/1.3 Georgia,serif;margin:22px 0 8px}h4{font:700 15px Georgia,serif;margin:16px 0 4px;color:var(--muted)}
section{margin-top:38px;border-top:3px double var(--line);padding-top:16px}.step{font:600 11px Consolas,monospace;letter-spacing:.1em;color:var(--accent);margin-bottom:4px}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin:18px 0}.meta div{background:var(--paper2);padding:9px 13px}.meta dt{font:600 10px Consolas,monospace;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.meta dd{margin:3px 0 0;font-weight:500}
.callout{background:var(--soft);border:1px solid var(--line);border-top:4px solid var(--accent);padding:6px 20px 12px;margin:22px 0}.callout h3{margin-top:12px}
.tablewrap{overflow-x:auto;margin:10px 0 18px}table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}thead th{background:#20211d;color:#fff}tbody th{background:var(--paper2);font-weight:600}
.tbc{color:var(--amber);font-style:italic;font-weight:600}ul{padding-left:22px}li{margin:4px 0}.foot{margin-top:34px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px;font-style:italic}
@media print{body{background:#fff;padding:0}.sheet{border:0;padding:0}thead th{background:#ddd!important;color:#000!important}}`;

function buildHtml() {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.title)}</title><style>${CSS}</style></head>
<body><main class="sheet"><div class="kicker">Primovex · Data Protection Impact Assessment</div><h1>${escapeHtml(content.title)}</h1><p class="sub">${escapeHtml(content.subtitle)}</p>
${blocksHtml(content.blocks)}
<p class="foot">${escapeHtml(content.footer)}</p></main></body></html>`;
  fs.writeFileSync(path.join(OUT, `${content.filename}.html`), html);
  return html.length;
}

(async () => {
  const htmlSize = buildHtml();
  const docxSize = await buildDocx();
  const open = content.blocks.flatMap((b) => JSON.stringify(b).match(/To be completed/g) || []).length;
  console.log(`dpia-draft.html ${htmlSize} bytes, dpia-draft.docx ${docxSize} bytes; ${open} "To be completed" markers`);
  void isTbc;
})();
