import { zipSync, strToU8 } from "fflate";
import { DAYS, DAY_SHORT, addDays, dateOf, groupLabel, groupsOf, timeLabel } from "./rotaModel.js";
import { weekCounters } from "./rotaEngine.js";
import { slotsOfDay } from "./rotaWeek.js";

// The rota as an Excel file (one sheet per week, laid out like the current rota with the shift counters beside it) and as a page to print.

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i) => { let n = i + 1, s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const shortDate = (iso) => dateOf(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// "Karen L (till 12)" for a place that stops early, otherwise just the name
export const placeText = (a) => (a ? `${a.name || ""}${a.until ? ` (till ${timeLabel(a.until)})` : ""}` : "");

// The counter columns: one per group of shifts, in the order the rota lists them, and a total.
export function counterColumns(rules) {
  const order = [];
  for (const g of groupsOf(rules)) order.push(g);
  return order.map((g) => ({ group: g, label: groupLabel(rules, g) }));
}

// Every person's shifts added up over several weeks (the running total): { uid: { group: n, total } }.
export function runningCounters(weeks, rules) {
  const total = {};
  for (const week of weeks) for (const [uid, row] of Object.entries(weekCounters(week, rules))) { total[uid] = total[uid] || { total: 0 }; for (const [k, v] of Object.entries(row)) total[uid][k] = (total[uid][k] || 0) + v; }
  return total;
}

// The running total as rows of text, for the Excel sheet and the printout.
export function totalRows(weeks, rules) {
  const counters = runningCounters(weeks, rules);
  const cols = counterColumns(rules);
  const title = `Running total, ${weeks.length} week${weeks.length === 1 ? "" : "s"} (w.c. ${shortDate(weeks[0].mondayIso)} to w.c. ${shortDate(weeks[weeks.length - 1].mondayIso)})`;
  const rows = [[title, ...cols.map((c) => c.label), "Total"]];
  for (const p of rules.people || []) { const r = counters[p.uid]; if (r?.total) rows.push([p.name, ...cols.map((c) => r[c.group] || 0), r.total]); }
  return rows;
}

// The cells of one week as rows of text: [[header...], [shift label, mon..fri], ...] and the counter table.
export function weekSheet(week, rules) {
  const header = [`w.c. ${shortDate(week.mondayIso)}`, ...DAYS.map((d) => `${DAY_SHORT[d]} ${shortDate(addDays(week.mondayIso, DAYS.indexOf(d)))}`)];
  const rows = [header];
  const keys = [];
  const seen = new Set();
  for (const day of DAYS) for (const s of slotsOfDay(rules, day)) if (!seen.has(s.key)) { seen.add(s.key); keys.push(s); }
  keys.sort((a, b) => (rules.shifts.indexOf(a.shift) - rules.shifts.indexOf(b.shift)) || a.key.localeCompare(b.key));
  for (const s of keys) {
    const label = `${s.shift.label} ${timeLabel(s.shift.start)}-${timeLabel(s.shift.end)}`;
    rows.push([label, ...DAYS.map((d) => (slotsOfDay(rules, d).some((x) => x.key === s.key) ? placeText(week.days?.[d]?.slots?.[s.key]) : ""))]);
  }
  const counters = weekCounters(week, rules);
  const cols = counterColumns(rules);
  const counterRows = [["Name", ...cols.map((c) => c.label), "Total"]];
  for (const p of rules.people || []) {
    const row = counters[p.uid] || { total: 0 };
    if (!row.total) continue;
    counterRows.push([p.name, ...cols.map((c) => row[c.group] || 0), row.total]);
  }
  return { rows, counterRows, issues: week.issues || [] };
}

function sheetXml(rows, counterRows, issues) {
  const all = rows.map((r) => ({ cells: r, offset: 0 }));
  const width = rows[0].length;
  counterRows.forEach((r, i) => { if (!all[i]) all[i] = { cells: [], offset: 0 }; all[i].counter = r; });
  const body = [];
  const lastRow = Math.max(all.length, 0);
  for (let i = 0; i < lastRow; i += 1) {
    const cells = [];
    const put = (col, v, bold) => {
      if (v === "" || v === null || v === undefined) return;
      const ref = `${colName(col)}${i + 1}`;
      const style = bold ? ' s="1"' : "";
      cells.push(typeof v === "number" ? `<c r="${ref}"${style}><v>${v}</v></c>` : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
    };
    (all[i].cells || []).forEach((v, c) => put(c, v, i === 0 || c === 0));
    (all[i].counter || []).forEach((v, c) => put(width + 1 + c, v, i === 0 || c === 0));
    body.push(`<row r="${i + 1}">${cells.join("")}</row>`);
  }
  const note = (issues || []).length ? issues.map((x) => x.text) : [];
  note.forEach((text, k) => {
    const r = lastRow + 2 + k;
    body.push(`<row r="${r}"><c r="A${r}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c></row>`);
  });
  const cols = `<cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="${width}" width="22" customWidth="1"/><col min="${width + 1}" max="${width + 1}" width="3" customWidth="1"/><col min="${width + 2}" max="${width + 2}" width="16" customWidth="1"/></cols>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body.join("")}</sheetData></worksheet>`;
}

// weeks: saved weeks (with names on the places), oldest first
export function buildRotaXlsx(weeks, rules) {
  const sheets = weeks.map((w) => ({ name: `w.c. ${shortDate(w.mondayIso)}`.slice(0, 31), ...weekSheet(w, rules) }));
  if (weeks.length > 1) sheets.push({ name: "Running total", rows: totalRows(weeks, rules), counterRows: [], issues: [] });
  const files = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows, s.counterRows, s.issues)); });
  return zipSync(files);
}

// A page to print: one table per week, landscape.
export function buildRotaHtml(weeks, rules, { printedBy = "", printedAt = new Date() } = {}) {
  const blocks = weeks.map((w) => {
    const { rows, counterRows, issues } = weekSheet(w, rules);
    const table = (data, head = true) => `<table>${data.map((r, i) => `<tr>${r.map((c, j) => (head && i === 0) || j === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
    return `<section><h2>Reception rota: week commencing ${esc(dateOf(w.mondayIso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}</h2>${table(rows)}<h3>Shift counter</h3>${table(counterRows)}${issues.length ? `<ul class="issues">${issues.map((x) => `<li>${esc(x.text)}</li>`).join("")}</ul>` : ""}</section>`;
  });
  if (weeks.length > 1) {
    const rows = totalRows(weeks, rules);
    blocks.push(`<section><h2>${esc(rows[0][0])}</h2><table>${rows.map((r, i) => `<tr>${r.map((c, j) => (i === 0 || j === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join("")}</tr>`).join("")}</table></section>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Reception rota</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;font-size:10pt;color:#111}h2{font-size:13pt;margin:0 0 6px}h3{font-size:10pt;margin:10px 0 4px}table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border:1px solid #888;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}section{page-break-after:always}section:last-child{page-break-after:auto}.issues{font-size:9pt;color:#555}.foot{font-size:8pt;color:#555;margin-top:6px}</style></head><body>${blocks.join("")}<p class="foot">Printed ${esc(printedAt.toLocaleString("en-GB"))}${printedBy ? ` by ${esc(printedBy)}` : ""}. Names only: no leave reasons.</p></body></html>`;
}
