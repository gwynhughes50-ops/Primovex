// Reading the barcodes that come on medical products (GS1), so a scan finds the
// product whichever barcode on the packaging it came from.
//
// A box usually carries several: a GTIN (the product's number) at each packaging
// level - the single pack, the box, the outer case - and often a second barcode
// with the expiry date, lot number and quantity. They look unrelated, but:
//   (01) 3 038290305760 4   outer case   \ same product: the first digit is the
//   (01) 0 038290305760 3   single pack  / packaging level, the last is a check digit
//   (17)310228 (10)2603001 (30)100   expiry 28/02/2031, lot 2603001, quantity 100
// Matching on the 12 digits in the middle ties them together, and the second
// kind of barcode fills in the delivery details. Pure, so it can be tested.

const GS = "\u001d"; // the group separator scanners put after a variable-length value

// Application identifiers handled: length is fixed, or a maximum for variable ones.
const FIXED = { "00": 18, "01": 14, "02": 14, "11": 6, "13": 6, "15": 6, "17": 6, "20": 2 };
const VARIABLE = { "10": 20, "21": 20, "30": 8, "37": 8, "240": 30, "241": 30 };

// GS1 mod-10 check digit over the digits before the last.
export function checkDigit(dataDigits) {
  let sum = 0;
  [...String(dataDigits)].reverse().forEach((ch, i) => { sum += Number(ch) * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(code) {
  const text = String(code || "");
  if (!/^\d{8}$|^\d{12,14}$/.test(text)) return false;
  return checkDigit(text.slice(0, -1)) === Number(text.slice(-1));
}

// Any valid GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) as 14 digits, or "".
export function toGtin14(code) {
  const text = String(code || "").trim();
  return isValidGtin(text) ? text.padStart(14, "0") : "";
}

// The 12 digits that identify the product regardless of packaging level.
export function productBase(code) {
  const gtin = toGtin14(code);
  return gtin ? gtin.slice(1, 13) : "";
}

// YYMMDD -> YYYY-MM-DD ("00" for the day means the last day of the month).
export function gs1Date(yymmdd) {
  if (!/^\d{6}$/.test(String(yymmdd))) return "";
  const year = 2000 + Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  let day = Number(yymmdd.slice(4, 6));
  if (month < 1 || month > 12) return "";
  const last = new Date(year, month, 0).getDate();
  if (day === 0) day = last;
  if (day < 1 || day > last) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Breaks a scan into { ai: value }. Understands the printed form with brackets,
// "(01)30382903057604(17)310228", and the raw form scanners send, with or
// without group separators and symbology prefixes such as "]C1" or "]d2".
function toElements(text) {
  let s = String(text || "").trim();
  s = s.replace(/^\][A-Za-z]\d/, "").replace(/^è/, "");
  const out = {};

  if (/\(\d{2,4}\)/.test(s)) {
    const parts = s.split(/\((\d{2,4})\)/); // ["", ai, value, ai, value...]
    for (let i = 1; i < parts.length; i += 2) {
      const value = parts[i + 1].replace(/[\s\u001d]/g, "");
      if (value) out[parts[i]] = value;
    }
    return out;
  }

  s = s.replace(/\s+/g, "");
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) { i += 1; continue; }
    const two = s.slice(i, i + 2);
    const three = s.slice(i, i + 3);
    if (FIXED[two]) {
      const len = FIXED[two];
      out[two] = s.slice(i + 2, i + 2 + len);
      i += 2 + len;
    } else if (VARIABLE[three] || VARIABLE[two]) {
      const ai = VARIABLE[three] ? three : two;
      const start = i + ai.length;
      const end = s.indexOf(GS, start);
      const stop = end === -1 ? s.length : end;
      out[ai] = s.slice(start, Math.min(stop, start + VARIABLE[ai]));
      i = start + out[ai].length;
    } else {
      return {}; // not GS1 data
    }
  }
  return out;
}

// What a scan says: { gtin, lot, expiry, bestBefore, serial, count } - only the
// parts present. Returns null if it isn't GS1 data at all (an ordinary barcode).
export function parseGs1(text) {
  const el = toElements(text);
  if (!Object.keys(el).length) return null;
  const result = {};
  const gtin = el["01"] || el["02"];
  if (gtin) {
    if (!isValidGtin(gtin)) return null;
    result.gtin = gtin;
  }
  if (el["10"]) result.lot = el["10"];
  if (el["21"]) result.serial = el["21"];
  const expiry = el["17"] && gs1Date(el["17"]);
  if (expiry) result.expiry = expiry;
  const best = el["15"] && gs1Date(el["15"]);
  if (best) result.bestBefore = best;
  const count = Number(el["30"] ?? el["37"]);
  if (Number.isFinite(count) && count > 0) result.count = Math.floor(count);
  return Object.keys(result).length ? result : null;
}

const norm = (value) => String(value ?? "").trim().toLowerCase();
const isArchived = (item) => Boolean(item?.archived_at);

// Finds the stock item a scan belongs to. Best match first: the very same
// barcode; then the same GTIN; then the same product at another packaging
// level (the single pack vs the box). A live item always beats an archived one,
// even if the archived one matches more exactly. `details` carries what the
// scan said about the delivery (lot, expiry, count) even when no item matches.
export function matchStockByScan(items = [], scanText) {
  const text = String(scanText || "").trim();
  const parsed = parseGs1(text);
  const details = parsed ? { ...parsed } : {};
  if (!text) return { item: null, via: null, details };

  const gtin = parsed?.gtin || toGtin14(text);
  const base = gtin ? gtin.slice(1, 13) : "";
  const real = items.filter(Boolean);

  for (const group of [real.filter((item) => !isArchived(item)), real.filter(isArchived)]) {
    const exact = group.find((item) => item.barcode && norm(item.barcode) === norm(text));
    if (exact) return { item: exact, via: "exact", details };
    if (!gtin) continue;
    const sameGtin = group.find((item) => toGtin14(item.barcode) === gtin);
    if (sameGtin) return { item: sameGtin, via: "same-gtin", details };
    const otherPack = group.find((item) => productBase(item.barcode) === base);
    if (otherPack) return { item: otherPack, via: "other-pack", details };
  }
  return { item: null, via: null, details };
}
