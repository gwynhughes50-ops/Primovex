import { strFromU8, unzipSync } from "fflate";

// Reading an .xlsx file (a zip of XML files) in the browser, with no upload anywhere: the file is opened on the person's own
// device. Gives each sheet as { name, rows: [{ r, cells: { columnNumber: value } }] }, text and numbers only (dates are numbers),
// which is what trainingImport.js reads.

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const columnNumber = (ref) => { let n = 0; for (const ch of ref.replace(/\d/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n; };

export function parseSharedStrings(xml) {
  return [...String(xml || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
}

export function parseSheetXml(xml, strings) {
  const rows = [];
  for (const rowMatch of String(xml || "").matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cell of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const inner = cell[2] || "";
      let value;
      if (/\bt="inlineStr"/.test(attrs)) value = decode([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v === undefined) continue;
        if (/\bt="s"/.test(attrs)) value = strings[Number(v)];
        else if (/\bt="(str|e|b)"/.test(attrs)) value = /\bt="str"/.test(attrs) ? decode(v) : undefined;
        else value = Number.isFinite(Number(v)) ? Number(v) : decode(v);
      }
      if (value !== undefined && value !== "") cells[columnNumber(ref)] = value;
    }
    if (Object.keys(cells).length) rows.push({ r: Number(rowMatch[1]), cells });
  }
  return rows;
}

// bytes of an .xlsx -> sheets
export function readWorkbook(bytes) {
  const files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const text = (path) => (files[path] ? strFromU8(files[path]) : "");
  const strings = parseSharedStrings(text("xl/sharedStrings.xml"));
  const workbook = text("xl/workbook.xml");
  const rels = text("xl/_rels/workbook.xml.rels");
  const target = (id) => {
    const m = new RegExp(`<Relationship\\b[^>]*\\bId="${id}"[^>]*>`).exec(rels)?.[0] || "";
    const t = /\bTarget="([^"]+)"/.exec(m)?.[1] || "";
    return t.startsWith("/") ? t.slice(1) : `xl/${t}`;
  };
  const sheets = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = decode(/\bname="([^"]*)"/.exec(m[1])?.[1] || "");
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1];
    if (!name || !rid) continue;
    const path = target(rid);
    if (!files[path]) continue;
    sheets.push({ name, rows: parseSheetXml(strFromU8(files[path]), strings) });
  }
  return sheets;
}
