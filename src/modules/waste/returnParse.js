// Reading Stericycle's quarterly "Hazardous Waste Producer Return": one per site per quarter, listing every consignment they received
// from that site. It is the check that the practice has every consignment note saved. Pure (positioned text in, facts out) so it
// can be tested without a PDF and never needs a real return.
//
//   pages: [[{ s, x, y }]]
//   returns { customerSite "9015865-108", producer, address, premisesCode, reportDate "YYYY-MM-DD", year, quarter 1..4,
//             rows: [{ code, date, mode, ewc, hazard, form, kg, disposal }], totalKg, warnings: [text] }

import { findDate } from "./consignmentParse";

const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
// a consignment code as Stericycle prints it on a return ("CAJ236//7LO21"); on the paper note it has one slash
const CODE = /^[A-Z]{2,4}\d{3}\/{1,2}[A-Z0-9]{4,6}$/;
const EWC = /^\d{2} \d{2} \d{2}\*?$/;
const byReading = (a, b) => b.y - a.y || a.x - b.x;

// does this look like a producer return? (used to route a dropped PDF to the right place)
export const isProducerReturn = (pages) => (pages || []).flat().some((i) => /Hazardous Waste Producer Return/i.test(i.s)) || (pages || []).flat().some((i) => /^Producer Details$/i.test(clean(i.s)));

// the key a consignment code is compared by: letters and numbers only, so "CAJ236//7LO21" and "CAJ236/7LO21" are the same note
export const codeKey = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function parseProducerReturn(pages) {
  const warnings = [];
  const items = (pages || []).flatMap((page) => (page || []).map((i) => ({ s: clean(i.s), x: Number(i.x), y: Number(i.y) }))).filter((i) => i.s);
  const onLine = (anchor, tolerance = 4) => items.filter((i) => i !== anchor && Math.abs(i.y - anchor.y) <= tolerance).sort((a, b) => a.x - b.x);
  const after = (anchor) => onLine(anchor).filter((i) => i.x > anchor.x);

  // the producer: customer site number, name, address, premises code
  const details = items.find((i) => /^Producer Details$/i.test(i.s));
  const customerSite = details ? (after(details).find((i) => /^\d{6,8}\s*-\s*\d{2,4}$/.test(i.s))?.s || "").replace(/\s+/g, "") : "";
  const nameLabel = items.find((i) => /^Name:$/i.test(i.s) && (!details || i.x <= (details?.x ?? 0) + 5));
  const producer = nameLabel ? after(nameLabel).filter((i) => i.x < 250)[0]?.s || "" : "";
  const addressLabel = items.find((i) => /^Address:$/i.test(i.s) && i.x <= (nameLabel?.x ?? 40) + 5);
  const address = addressLabel
    ? items.filter((i) => i.x >= addressLabel.x + 40 && i.x < 250 && i.y <= addressLabel.y + 3 && addressLabel.y - i.y < 45 && !/^(Post Code|Premises Code):?$/i.test(i.s)).sort(byReading).map((i) => i.s).filter((v) => !/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(v) && !/^[A-Z]{3}\d{3}$/.test(v)).join(", ")
    : "";
  const premisesLabel = items.find((i) => /^Premises Code:$/i.test(i.s));
  const premisesCode = premisesLabel ? after(premisesLabel).filter((i) => i.x < 250)[0]?.s || "" : "";

  // when, and which quarter
  const reportLabel = items.find((i) => /^Report Date:$/i.test(i.s));
  const reportDate = reportLabel ? findDate(after(reportLabel)[0]?.s || "") : "";
  const periodLabel = items.find((i) => /^Period:$/i.test(i.s));
  const periodItems = periodLabel ? after(periodLabel).map((i) => i.s) : [];
  const year = Number(periodItems.find((v) => /^\d{4}$/.test(v)));
  const quarter = Number((periodItems.find((v) => /^Q[1-4]$/i.test(v)) || "").slice(1));

  // the table: columns taken from the headings, rows from the consignment codes
  const head = items.find((i) => /^Consignment Note$/i.test(i.s));
  const col = (re, fallback) => items.find((i) => i.y === head?.y && re.test(i.s))?.x ?? fallback;
  const x = { date: col(/^Date$/i, 115), mode: col(/^Transport Mode$/i, 166), ewc: col(/^EWC Code$/i, 237), hazard: col(/^Hazard$/i, 294), form: col(/^Physical Form$/i, 365), kg: col(/^Weight/i, 427), disposal: col(/^Disposal Mode$/i, 484) };
  const rows = [];
  for (const codeItem of items.filter((i) => CODE.test(i.s)).sort(byReading)) {
    const line = onLine(codeItem);
    const at = (from, to) => line.filter((i) => i.x >= from - 8 && i.x < to - 8).map((i) => i.s).join(" ");
    const kgText = at(x.kg, x.disposal);
    const kg = Number(kgText.replace(/,/g, ""));
    const row = { code: codeItem.s, date: findDate(at(x.date, x.mode)), mode: at(x.mode, x.ewc), ewc: at(x.ewc, x.hazard), hazard: at(x.hazard, x.form), form: at(x.form, x.kg), kg: Number.isFinite(kg) && kgText ? kg : null, disposal: at(x.disposal, 9999) };
    if (row.kg === null) warnings.push(`The weight for ${codeItem.s} could not be read.`);
    if (!row.date) warnings.push(`The date for ${codeItem.s} could not be read.`);
    rows.push(row);
  }

  if (!customerSite) warnings.push("The customer site number could not be found.");
  if (!year || !quarter) warnings.push("The quarter (year and Q1 to Q4) could not be found.");
  if (!rows.length) warnings.push("No consignments could be read from this return.");
  const totalKg = Math.round(rows.reduce((n, r) => n + (r.kg || 0), 0) * 1000) / 1000;
  return { customerSite, producer, address, premisesCode, reportDate, year: year || 0, quarter: quarter || 0, rows, totalKg, warnings };
}

// the first and last day of a calendar quarter
export function quarterRange(year, quarter) {
  const start = (quarter - 1) * 3;
  const pad = (n) => String(n).padStart(2, "0");
  const last = new Date(year, start + 3, 0).getDate();
  return { from: `${year}-${pad(start + 1)}-01`, to: `${year}-${pad(start + 3)}-${pad(last)}` };
}
export const quarterLabel = (year, quarter) => `Q${quarter} ${year}`;
export const returnId = (customerSite, year, quarter) => `wr-${String(customerSite).replace(/[^0-9]/g, "")}-${year}-q${quarter}`;
