// Covers GS1 barcode reading and matching (src/lib/gs1.js), using the real
// codes from the BD Eclipse Needle (Orange) box and single pack.
import assert from "node:assert/strict";
import { checkDigit, gs1Date, isValidGtin, matchStockByScan, parseGs1, productBase, toGtin14 } from "../src/lib/gs1.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const GS = "\u001d";

const BOX_GTIN = "30382903057604";   // outer case
const PACK_GTIN = "00382903057603";  // single pack

t("both labels' GTINs are valid, and share the middle 12 digits (the product)", () => {
  assert.equal(isValidGtin(BOX_GTIN), true);
  assert.equal(isValidGtin(PACK_GTIN), true);
  assert.equal(productBase(BOX_GTIN), "038290305760");
  assert.equal(productBase(PACK_GTIN), "038290305760");
  assert.notEqual(BOX_GTIN[0], PACK_GTIN[0]); // packaging level differs
});

t("check digits: a wrong last digit is rejected", () => {
  assert.equal(isValidGtin("30382903057605"), false);
  assert.equal(isValidGtin("12345"), false);
  assert.equal(isValidGtin(""), false);
  assert.equal(checkDigit("3038290305760"), 4);
});

t("EAN-13 and GTIN-14 forms of the same code line up", () => {
  assert.equal(toGtin14("0382903057603"), PACK_GTIN);          // 13 digits
  assert.equal(toGtin14("5019144107587").length, 14);            // a real EAN-13 from the stock list
  assert.equal(toGtin14("not a code"), "");
});

t("the printed (bracketed) GTIN barcode on the box", () => {
  assert.deepEqual(parseGs1("(01)30382903057604"), { gtin: BOX_GTIN });
});

t("the second barcode on the box: expiry 28/02/2031, lot 2603001, quantity 100", () => {
  assert.deepEqual(parseGs1("(17)310228(10)2603001(30)100"), { expiry: "2031-02-28", lot: "2603001", count: 100 });
});

t("the same data as a scanner sends it: no brackets, group separator after the lot", () => {
  assert.deepEqual(parseGs1(`17310228102603001${GS}30100`), { expiry: "2031-02-28", lot: "2603001", count: 100 });
  assert.deepEqual(parseGs1("0130382903057604"), { gtin: BOX_GTIN });
  assert.deepEqual(parseGs1(`]C10130382903057604`), { gtin: BOX_GTIN });
});

t("a GTIN, expiry and lot together, as a DataMatrix often carries them", () => {
  assert.deepEqual(parseGs1(`01003829030576031727022810 2203009`.replace(" ", "")), { gtin: PACK_GTIN, expiry: "2027-02-28", lot: "2203009" });
});

t("an expiry day of 00 means the last day of that month", () => {
  assert.equal(gs1Date("310200"), "2031-02-28");
  assert.equal(gs1Date("280200"), "2028-02-29"); // leap year
  assert.equal(gs1Date("311300"), "");
  assert.equal(gs1Date("310231"), "");
});

t("an ordinary barcode (not GS1) is not mistaken for one", () => {
  assert.equal(parseGs1("5019144107587"), null);
  assert.equal(parseGs1("HELLO"), null);
  assert.equal(parseGs1(""), null);
  assert.equal(parseGs1("(01)30382903057609"), null); // bad check digit
});

const items = [
  { id: "orange", name: "BD Eclipse Needle (Orange)", barcode: PACK_GTIN, current_stock: 40 },
  { id: "plain", name: "Alcotip", barcode: "5019144107587" },
  { id: "old", name: "Old thing", barcode: "0000000000017", archived_at: "2026-01-01" },
  { id: "nobarcode", name: "No barcode" },
];

t("scanning the box finds the item recorded with the single-pack barcode", () => {
  const m = matchStockByScan(items, "(01)30382903057604");
  assert.equal(m.item.id, "orange");
  assert.equal(m.via, "other-pack");
});

t("scanning the single pack finds it exactly; the box in another notation still finds it", () => {
  assert.equal(matchStockByScan(items, PACK_GTIN).via, "exact");
  assert.equal(matchStockByScan(items, "(01)00382903057603").via, "same-gtin");
  assert.equal(matchStockByScan(items, "0382903057603").via, "same-gtin"); // EAN-13 form
});

t("an item recorded with the BOX barcode is found from the single pack too", () => {
  const boxItems = [{ id: "b", name: "Needle", barcode: BOX_GTIN }];
  assert.equal(matchStockByScan(boxItems, PACK_GTIN).item.id, "b");
});

t("the expiry/lot/quantity barcode finds no item, but still returns its details", () => {
  const m = matchStockByScan(items, "(17)310228(10)2603001(30)100");
  assert.equal(m.item, null);
  assert.deepEqual(m.details, { expiry: "2031-02-28", lot: "2603001", count: 100 });
});

t("a plain barcode matches exactly, ignoring case and spaces", () => {
  assert.equal(matchStockByScan(items, " 5019144107587 ").item.id, "plain");
});

t("a product with a different middle part is never matched", () => {
  assert.equal(matchStockByScan(items, "(01)30382903057608").item, null);
  assert.equal(matchStockByScan(items, "(01)05012345678900").item, null);
  assert.equal(matchStockByScan(items, "").item, null);
});

t("a live item beats an archived one, even when the archived one matches exactly", () => {
  const both = [
    { id: "arch", name: "Old needle", barcode: PACK_GTIN, archived_at: "2026-01-01" },
    { id: "live", name: "Needle", barcode: BOX_GTIN },
  ];
  const m = matchStockByScan(both, PACK_GTIN);
  assert.equal(m.item.id, "live");
  assert.equal(m.via, "other-pack");
});

t("an archived item is still found when nothing live matches (so it can be brought back)", () => {
  const only = [{ id: "arch", name: "Old needle", barcode: PACK_GTIN, archived_at: "2026-01-01" }];
  assert.equal(matchStockByScan(only, "(01)30382903057604").item.id, "arch");
});

console.log(`\n${n} passed`);
