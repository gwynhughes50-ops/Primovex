import assert from "node:assert/strict";
import { consignmentId, findDate, parseConsignment } from "../src/modules/waste/consignmentParse.js";
import { duplicateOf, monthly, normaliseConsignment, stats, summaryOf, wasteLabel } from "../src/modules/waste/waste.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const it = (s, x, y) => ({ s, x, y });

// a made-up note laid out like the real one (made-up practice, code and weights)
function note({ date = "24-03-2026", time = "8:46 AM", code = "ABC123/9XY8Z", rows = true } = {}) {
  const page1 = [
    it("Customer Site Number:", 12, 700), it("Document Reference Number:", 190, 700), it("1234567-111", 118, 688), it("QWER12T34Y", 322, 688),
    it("1. Consignment note code:", 50, 660), it("4. The waste will be taken to:", 336, 660), it(code, 154, 648),
    it("Stericycle : DEPOT ROAD, EXAMPLE ESTATE", 336, 640), it("TOWN UK AB1 2CD", 336, 630),
    it("Example Surgery : Example Surgery", 52, 640), it("1 High Street", 52, 630),
    it("3. Premises Code (where application - Wales Only):", 53, 600), it("ABC123", 243, 588),
    it("Waste", 47, 520), it("Description of the Waste", 80, 520), it("List of", 188, 520), it("Quantity", 240, 520), it("Component", 282, 520), it("Concentration", 338, 520), it("Physical", 406, 520), it("Hazard", 454, 520), it("Bag", 504, 520), it("Sharp", 533, 520), it("Sealed", 565, 520), it("Wheeled", 599, 520),
    it("Code", 47, 508), it("Waste", 188, 508), it("(kg)", 244, 508), it("Form", 413, 508), it("Codes", 454, 508), it("Box", 533, 508), it("Unit", 565, 508), it("Cart", 599, 508), it("(EWC Code)", 188, 496),
    it("The information below is to be completed for each EWC code identified", 55, 330),
  ];
  if (rows) {
    page1.push(
      it("INFECTIOUS HEALTHCARE", 80, 470), it("SHARPS /", 282, 470), it("5% / 95%", 338, 470), it("MIXED", 406, 470), it("HP9", 454, 470),
      it("HS", 47, 458), it("180103/09", 188, 458), it("8.000", 253, 458), it("0", 524, 458), it("8", 555, 458), it("0", 590, 458), it("0", 632, 458),
      it("SHARPS-INCINERATE", 80, 446), it("MEDICINES", 282, 446),
      it("INFECTIOUS HEALTHCARE FOR", 80, 410), it("CLINICAL WASTE", 282, 410), it("100%", 338, 410), it("MIXED", 406, 410), it("HP9", 454, 410),
      it("HT", 47, 398), it("18 01 03", 188, 398), it("65.001", 248, 398), it("26", 518, 398), it("0", 555, 398), it("0", 590, 398), it("0", 632, 398),
      it("ALTERNATE TREATMENT", 80, 386),
      // below the end mark: the second table, which must not be read as waste
      it("180103/09", 47, 300), it("18 01 03", 47, 270), it("UN 3291", 119, 300),
    );
  }
  const page2 = [it("1. Carrier Name (PRINT)", 50, 600), it("Some Driver", 227, 600), it(date, 100, 400), it(time, 286, 400), it(date, 453, 400), it(time, 591, 400)];
  return [page1, page2];
}

t("a note is read: the codes, when, who it came from and each waste line", () => {
  const out = parseConsignment(note(), { fileName: "ABC1239XY8Z.24.03.2026 EX.pdf" });
  assert.equal(out.consignmentCode, "ABC123/9XY8Z");
  assert.equal(out.documentRef, "QWER12T34Y");
  assert.equal(out.customerSite, "1234567-111");
  assert.equal(out.premisesCode, "ABC123");
  assert.equal(out.collectionDate, "2026-03-24");
  assert.equal(out.collectionTime, "08:46");
  assert.equal(out.producer, "Example Surgery");
  assert.equal(out.carrier, "Stericycle");
  assert.match(out.destination, /DEPOT ROAD.*TOWN UK AB1 2CD/);
  assert.equal(out.lines.length, 2, "the second table (UN numbers) is not waste");
  assert.deepEqual(out.lines[0], { wasteCode: "HS", ewc: "180103/09", description: "INFECTIOUS HEALTHCARE SHARPS-INCINERATE", kg: 8, component: "SHARPS / MEDICINES", concentration: "5% / 95%", form: "MIXED", hazard: "HP9", bags: 0, sharpsBoxes: 8, sealedUnits: 0, wheeledCarts: 0 });
  assert.equal(out.lines[1].kg, 65.001);
  assert.equal(out.lines[1].bags, 26);
  assert.equal(out.lines[1].description, "INFECTIOUS HEALTHCARE FOR ALTERNATE TREATMENT");
  assert.equal(out.totalKg, 73.001);
  assert.deepEqual(out.warnings, []);
});

t("the driver's and signers' names are not read into the result", () => {
  assert.ok(!JSON.stringify(parseConsignment(note())).includes("Some Driver"));
});

t("what could not be read is said so, and the file name supplies the date as a last resort", () => {
  const empty = parseConsignment([[]], { fileName: "x.15.06.2026 Y.pdf" });
  assert.equal(empty.collectionDate, "2026-06-15");
  assert.ok(empty.warnings.some((w) => /no text/i.test(w)) && empty.warnings.some((w) => /code/i.test(w)));
  const noRows = parseConsignment(note({ rows: false }));
  assert.equal(noRows.lines.length, 0);
  assert.ok(noRows.warnings.some((w) => /No waste lines/.test(w)));
  const afternoon = parseConsignment(note({ time: "2:05 PM" }));
  assert.equal(afternoon.collectionTime, "14:05");
});

t("dates are real dates, and the same note lands on the same record", () => {
  assert.equal(findDate("24-03-2026"), "2026-03-24");
  assert.equal(findDate("31/02/2026"), "", "no such day");
  assert.equal(consignmentId("CAI959/7L2JF"), "cn-cai959-7l2jf");
  assert.equal(consignmentId(" cai959/7l2jf "), "cn-cai959-7l2jf");
});

const mk = (id, date, kg, lines = [{ description: "SHARPS", kg, bags: 0, sharpsBoxes: 2 }]) => normaliseConsignment(id, { consignmentCode: id.toUpperCase(), collectionDate: date, totalKg: kg, lines });

t("labels and summaries are short and plain", () => {
  assert.equal(wasteLabel({ description: "INFECTIOUS HEALTHCARE SHARPS-INCINERATE", component: "SHARPS / MEDICINES" }), "Sharps");
  assert.equal(wasteLabel({ description: "INFECTIOUS HEALTHCARE FOR ALTERNATE TREATMENT", component: "CLINICAL WASTE" }), "Clinical waste");
  assert.equal(summaryOf({ lines: [{ description: "SHARPS", kg: 8 }, { description: "ALTERNATE TREATMENT", kg: 65.001 }] }), "Sharps 8.0 kg · Clinical waste 65.0 kg");
});

t("months add up, voided notes are left out, and the newest month is first", () => {
  const list = [mk("a", "2026-03-24", 70), mk("b", "2026-03-10", 30), mk("c", "2026-02-02", 10), { ...mk("d", "2026-03-30", 999), voided: true }];
  const m = monthly(list);
  assert.deepEqual(m.map((r) => [r.month, r.collections, r.kg]), [["2026-03", 2, 100], ["2026-02", 1, 10]]);
  assert.equal(m[0].sharpsBoxes, 4);
});

t("the figures an inspector asks for: last collection, last year's total, the longest gap", () => {
  const now = new Date(2026, 9, 15);
  const list = [mk("a", "2026-09-30", 50), mk("b", "2026-08-01", 40), mk("c", "2026-02-01", 20), mk("old", "2024-01-01", 500), { ...mk("v", "2026-10-01", 1000), voided: true }];
  const s = stats(list, now);
  assert.equal(s.last.id, "a");
  assert.equal(s.daysSinceLast, 15);
  assert.equal(s.collectionsLastYear, 3);
  assert.equal(s.kgLastYear, 110);
  assert.equal(s.longestGap, 181, "1 Feb to 1 Aug");
  assert.equal(stats([], now).last, null);
});

t("a note already on record is found by its code, whatever the case", () => {
  const list = [mk("cn-x", "2026-03-24", 5)];
  assert.ok(duplicateOf(list, " cn-x "));
  assert.equal(duplicateOf(list, "other"), null);
});

console.log(`\n${n} passed`);
