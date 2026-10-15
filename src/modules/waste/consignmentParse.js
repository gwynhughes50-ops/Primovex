// Reading a clinical waste consignment note (the Stericycle "hazardous waste consignment note" the practice is emailed after
// each collection). Pure: it is given the text of the PDF as positioned pieces and returns the facts on it, so it can be tested
// without a PDF and never needs a real note. The people's names printed on the note (the driver, whoever signed) are not read:
// they are not needed to evidence a collection.
//
//   pages: [[{ s: "text", x, y }]]  (PDF coordinates: y goes up the page)
//   returns { consignmentCode, documentRef, customerSite, premisesCode, collectionDate "YYYY-MM-DD", collectionTime "HH:MM",
//             producer, carrier, destination, lines: [{ wasteCode, ewc, description, kg, component, concentration, form,
//             hazard, bags, sharpsBoxes, sealedUnits, wheeledCarts }], totalKg, warnings: [text] }

const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");

const CODE = /^[A-Z]{2,4}\d{3}\/[A-Z0-9]{4,6}$/;
const SITE = /^\d{6,8}-\d{2,4}$/;
const EWC = /^(\d{6}(\/\d{2})?|\d{2} \d{2} \d{2})$/;
const KG = /^\d+(\.\d{1,3})?$/; // a weight: 65.001, 8.000, or a plain 0 when none was collected
// the second line of the table headings
const HEADING_WORDS = /^(Form|Codes|Box|Unit|Cart|Waste|Code|\(kg\)|\(EWC Code\))$/;

function realDate(day, month, year) {
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(day) || d.getMonth() !== Number(month) - 1) return "";
  if (d.getFullYear() < 2000 || d.getFullYear() > 2100) return "";
  return `${year}-${pad(month)}-${pad(day)}`;
}

// "24-03-2026" or "24/03/2026" anywhere in some text
export function findDate(text) {
  const m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/.exec(String(text || ""));
  return m ? realDate(m[1], m[2], m[3]) : "";
}

function findTime(text) {
  const m = /\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i.exec(String(text || ""));
  if (!m) return "";
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (m[3]) { const pm = m[3].toUpperCase() === "PM"; if (pm && hour < 12) hour += 12; if (!pm && hour === 12) hour = 0; }
  return hour > 23 || minute > 59 ? "" : `${pad(hour)}:${pad(minute)}`;
}

const byReading = (a, b) => b.y - a.y || a.x - b.x;

export function parseConsignment(pages, { fileName = "" } = {}) {
  const warnings = [];
  const items = (pages || []).flatMap((page, index) => (page || []).map((i) => ({ s: clean(i.s), x: Number(i.x), y: Number(i.y), page: index }))).filter((i) => i.s);
  const first = items.filter((i) => i.page === 0);
  const pick = (re, list = items) => list.find((i) => re.test(i.s));

  // the identifying numbers
  const code = pick(CODE)?.s || "";
  const siteItem = pick(SITE);
  const docRef = siteItem
    ? items.find((i) => i !== siteItem && i.page === siteItem.page && Math.abs(i.y - siteItem.y) <= 4 && /^[A-Z0-9]{8,14}$/.test(i.s) && /\d/.test(i.s) && /[A-Z]/.test(i.s))?.s || ""
    : "";
  const premisesLabel = first.find((i) => /Premises Code/i.test(i.s));
  const premises = (premisesLabel && first.filter((i) => i.y < premisesLabel.y && premisesLabel.y - i.y < 30 && /^[A-Z]{2,5}\d{2,4}$/.test(i.s)).sort(byReading)[0]?.s) || (code ? code.split("/")[0] : "");

  // when it was collected: the date and time the carrier signed (second page), else the first date anywhere, else the file name
  const signed = items.filter((i) => i.page > 0 && findDate(i.s));
  let collectionDate = signed.length ? findDate(signed[0].s) : "";
  if (!collectionDate) collectionDate = findDate(items.map((i) => i.s).join(" "));
  if (!collectionDate) collectionDate = findDate(fileName.replace(/\.pdf$/i, ""));
  const timeItem = items.filter((i) => i.page > 0).find((i) => findTime(i.s));
  const collectionTime = timeItem ? findTime(timeItem.s) : "";

  // who and where
  const colon = first.filter((i) => / : /.test(i.s));
  const producerItem = colon.find((i) => !/stericycle|srcl/i.test(i.s));
  const carrierItem = colon.find((i) => /stericycle|srcl/i.test(i.s));
  const producer = producerItem ? clean(producerItem.s.split(" : ")[0]) : "";
  const carrier = carrierItem ? clean(carrierItem.s.split(" : ")[0]) : "";
  const destination = carrierItem
    ? clean([carrierItem.s.split(" : ").slice(1).join(" : "), ...first.filter((i) => i !== carrierItem && Math.abs(i.x - carrierItem.x) <= 3 && i.y < carrierItem.y && carrierItem.y - i.y < 18).sort(byReading).map((i) => i.s)].join(" "))
    : "";

  // the waste table: from the headings down to "The information below ..."
  const lines = [];
  const head = (re) => first.find((i) => re.test(i.s));
  const descHead = head(/^Description of the Waste$/i);
  const endMark = first.find((i) => /^The information below is to be completed/i.test(i.s));
  if (descHead && endMark) {
    const x = {
      desc: descHead.x, list: head(/^List of$/i)?.x ?? descHead.x + 108, qty: head(/^Quantity$/i)?.x ?? descHead.x + 160, comp: head(/^Component$/i)?.x ?? descHead.x + 202,
      conc: head(/^Concentration$/i)?.x ?? descHead.x + 258, form: head(/^Physical$/i)?.x ?? descHead.x + 326, haz: head(/^Hazard$/i)?.x ?? descHead.x + 374, bag: head(/^Bag$/i)?.x ?? descHead.x + 424,
    };
    const region = first.filter((i) => i.y < descHead.y - 8 && i.y > endMark.y && !HEADING_WORDS.test(i.s));
    const mains = region.filter((i) => EWC.test(i.s) && i.x >= x.list - 6 && i.x < x.qty - 3).sort(byReading);
    for (const main of mains) {
      const mine = region.filter((i) => {
        const nearest = mains.reduce((best, m) => (Math.abs(i.y - m.y) < Math.abs(i.y - best.y) ? m : best), mains[0]);
        return nearest === main;
      });
      const inCol = (from, to) => mine.filter((i) => i.x >= from && i.x < to).sort(byReading).map((i) => i.s).join(" ");
      const onLine = mine.filter((i) => Math.abs(i.y - main.y) <= 4);
      const kgItem = onLine.find((i) => KG.test(i.s) && i.x >= x.qty - 6 && i.x < x.comp - 3);
      const counts = onLine.filter((i) => /^\d+$/.test(i.s) && i.x >= x.bag - 3).sort((a, b) => a.x - b.x).map((i) => Number(i.s));
      const wasteCode = mine.filter((i) => i.x >= x.desc - 60 && i.x < x.desc - 8 && /^[A-Z]{1,3}$/.test(i.s)).sort((a, b) => Math.abs(a.y - main.y) - Math.abs(b.y - main.y))[0]?.s || "";
      const row = {
        wasteCode, ewc: main.s, description: inCol(x.desc - 8, x.list - 3), kg: kgItem ? Number(kgItem.s) : null,
        component: inCol(x.comp - 6, x.conc - 3), concentration: inCol(x.conc - 6, x.form - 3), form: inCol(x.form - 6, x.haz - 3), hazard: inCol(x.haz - 6, x.bag - 3),
        bags: counts[0] ?? 0, sharpsBoxes: counts[1] ?? 0, sealedUnits: counts[2] ?? 0, wheeledCarts: counts[3] ?? 0,
      };
      // nothing in the weight column and no bags, boxes, units or carts either: nothing was collected on this line
      if (row.kg === null && counts.length && counts.every((c) => c === 0)) row.kg = 0;
      if (row.kg === null) warnings.push(`The weight for ${main.s} could not be read. Type it in.`);
      lines.push(row);
    }
  }

  const totalKg = Math.round(lines.reduce((sum, l) => sum + (l.kg || 0), 0) * 1000) / 1000;
  if (!code) warnings.push("The consignment note code could not be found. Type it in.");
  if (!collectionDate) warnings.push("The collection date could not be found. Type it in.");
  if (!lines.length) warnings.push("No waste lines could be read from this note. Check it is a Stericycle consignment note, and add the weights by hand.");
  if (!items.length) warnings.push("There was no text in that PDF (it may be a scan or a photo), so nothing could be read. Type the details in.");

  return { consignmentCode: code, documentRef: docRef, customerSite: siteItem?.s || "", premisesCode: premises, collectionDate, collectionTime, producer, carrier, destination, lines, totalKg, warnings };
}

// the id a note is stored under: the same note dropped twice lands on the same record
export const consignmentId = (code) => `cn-${clean(code).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
