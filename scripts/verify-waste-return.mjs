import assert from "node:assert/strict";
import { codeKey, isProducerReturn, parseProducerReturn, quarterLabel, quarterRange, returnId } from "../src/modules/waste/returnParse.js";
import { compareReturn, normaliseConsignment } from "../src/modules/waste/waste.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const it = (s, x, y) => ({ s, x, y });

// a made-up quarterly return laid out like the real one
function returnPages({ rows = [["ABC123//7AAAA", "08/04/2026", "10.00"], ["ABC123//7BBBB", "14/04/2026", "8.50"], ["ABC123//7CCCC", "30/06/2026", "15.00"]], quarter = "Q2" } = {}) {
  const top = [
    it("Producer Return", 16, 790), it("Hazardous Waste Producer Return", 203, 770),
    it("Report Date:", 30, 740), it("21/07/2026", 115, 740), it("Period:", 285, 740), it("2026", 328, 740), it(quarter, 356, 740),
    it("Consignee Details", 285, 715), it("Producer Details", 30, 715), it("9015865 - 108", 115, 715),
    it("Name:", 30, 700), it("Example Branch Surgery", 115, 700), it("Name:", 285, 700), it("Example Treatment Plant", 371, 700),
    it("Address:", 30, 686), it("1 EXAMPLE ROAD", 115, 686), it("Address:", 285, 686), it("Depot Road", 371, 686),
    it("EXAMPLE ESTATE", 115, 674), it("TOWN", 115, 662),
    it("Post Code:", 30, 648), it("AB1 2CD", 115, 648), it("Post Code:", 285, 648), it("L33 7UR", 371, 648),
    it("Premises Code:", 30, 634), it("ABC123", 115, 634), it("Permit Number:", 285, 634), it("KP0000XX", 371, 634),
    it("Consignment Note", 30, 600), it("Date", 115, 600), it("Transport Mode", 166, 600), it("EWC Code", 237, 600), it("Hazard", 294, 600), it("Physical Form", 365, 600), it("Weight (kg)", 427, 600), it("Disposal Mode", 484, 600),
  ];
  const body = rows.flatMap(([code, date, kg], i) => { const y = 588 - i * 12; return [it(code, 30, y), it(date, 119, y), it("Road", 166, y), it("18 01 03", 237, y), it("HP9", 294, y), it("Mixed", 365, y), it(kg, 427, y), it("R03", 484, y)]; });
  return [[...top, ...body]];
}

const note = (id, code, date, kg, extra = {}) => normaliseConsignment(id, { consignmentCode: code, collectionDate: date, customerSite: "9015865-108", siteId: "branch", totalKg: kg, lines: [{ ewc: "18 01 03", kg }], ...extra });

t("a quarterly return is recognised and read: the site, the premises, the quarter and every consignment", () => {
  const pages = returnPages();
  assert.equal(isProducerReturn(pages), true);
  assert.equal(isProducerReturn([[it("Hazardous waste consignment note", 10, 10)]]), false);
  const out = parseProducerReturn(pages);
  assert.equal(out.customerSite, "9015865-108", "the spaces round the hyphen are removed");
  assert.equal(out.producer, "Example Branch Surgery");
  assert.equal(out.address, "1 EXAMPLE ROAD, EXAMPLE ESTATE, TOWN");
  assert.equal(out.premisesCode, "ABC123");
  assert.deepEqual([out.reportDate, out.year, out.quarter], ["2026-07-21", 2026, 2]);
  assert.equal(out.rows.length, 3);
  assert.deepEqual(out.rows[1], { code: "ABC123//7BBBB", date: "2026-04-14", mode: "Road", ewc: "18 01 03", hazard: "HP9", form: "Mixed", kg: 8.5, disposal: "R03" });
  assert.equal(out.totalKg, 33.5);
  assert.deepEqual(out.warnings, []);
});

t("what cannot be read is said so", () => {
  const empty = parseProducerReturn([[]]);
  assert.ok(empty.warnings.some((w) => /customer site number/.test(w)) && empty.warnings.some((w) => /quarter/.test(w)) && empty.warnings.some((w) => /No consignments/.test(w)));
  const noWeight = returnPages({ rows: [["ABC123//7AAAA", "08/04/2026", ""]] });
  assert.ok(parseProducerReturn(noWeight).warnings.some((w) => /weight for ABC123\/\/7AAAA/.test(w)));
});

t("quarters are calendar quarters, and ids are the same for the same site and quarter", () => {
  assert.deepEqual(quarterRange(2026, 2), { from: "2026-04-01", to: "2026-06-30" });
  assert.deepEqual(quarterRange(2026, 1), { from: "2026-01-01", to: "2026-03-31" });
  assert.deepEqual(quarterRange(2026, 4), { from: "2026-10-01", to: "2026-12-31" });
  assert.equal(quarterLabel(2026, 2), "Q2 2026");
  assert.equal(returnId("9015865-108", 2026, 2), "wr-9015865108-2026-q2");
  assert.equal(returnId("9015865 - 108", 2026, 2), "wr-9015865108-2026-q2");
});

t("codes match whatever the slashes: a double slash on the return is a single slash on the note", () => {
  assert.equal(codeKey("CAJ236//7LO21"), codeKey("CAJ236/7LO21"));
  assert.equal(codeKey(" caj236/7lo21 "), "CAJ2367LO21");
  assert.notEqual(codeKey("CAJ236/7LO21"), codeKey("CAJ236/7LO22"));
});

t("the check: all saved is complete; a note not saved is missing; a different date or weight is flagged", () => {
  const parsed = parseProducerReturn(returnPages());
  const base = { rows: parsed.rows, customerSite: parsed.customerSite, siteId: "branch", year: 2026, quarter: 2 };
  const all = [note("a", "ABC123/7AAAA", "2026-04-08", 10), note("b", "ABC123/7BBBB", "2026-04-14", 8.5), note("c", "ABC123/7CCCC", "2026-06-30", 15)];
  const full = compareReturn({ ...base, notes: all });
  assert.deepEqual([full.total, full.matched.length, full.missing.length, full.extra.length, full.complete], [3, 3, 0, 0, true]);

  const short = compareReturn({ ...base, notes: all.slice(0, 2) });
  assert.deepEqual(short.missing, [{ code: "ABC123//7CCCC", date: "2026-06-30", kg: 15 }]);
  assert.equal(short.complete, false);

  const off = compareReturn({ ...base, notes: [note("a", "ABC123/7AAAA", "2026-04-09", 10), note("b", "ABC123/7BBBB", "2026-04-14", 9.2), all[2]] });
  assert.deepEqual(off.matched.map((m) => [m.dateOk, m.weightOk]), [[false, true], [true, false], [true, true]]);
  assert.equal(off.problems, 2);
  assert.equal(off.complete, false);
});

t("a saved note for the site and quarter that is not on the return is listed, and flagged when it was collected at the very end", () => {
  const parsed = parseProducerReturn(returnPages());
  const base = { rows: parsed.rows, customerSite: parsed.customerSite, siteId: "branch", year: 2026, quarter: 2 };
  const all = [note("a", "ABC123/7AAAA", "2026-04-08", 10), note("b", "ABC123/7BBBB", "2026-04-14", 8.5), note("c", "ABC123/7CCCC", "2026-06-30", 15),
    note("x", "ABC123/7XXXX", "2026-06-29", 5), note("y", "ABC123/7YYYY", "2026-05-12", 5),
    note("other", "ZZZ999/7OTHR", "2026-05-12", 5, { siteId: "main", customerSite: "9015865-111" }), note("old", "ABC123/7OLDD", "2026-03-30", 5), { ...note("v", "ABC123/7VOID", "2026-05-13", 5), voided: true }];
  const out = compareReturn({ ...base, notes: all });
  assert.deepEqual(out.extra.map((e) => [e.note.id, e.nearEdge]), [["x", true], ["y", false]], "the other site's, the other quarter's and the voided note are not counted");
  assert.equal(out.complete, true, "extras alone do not make it incomplete");
});

t("a note is matched to the return by the site number even if it has no site chosen yet, and the hazardous weight is what is compared", () => {
  const parsed = parseProducerReturn(returnPages());
  const mixed = normaliseConsignment("m", { consignmentCode: "ABC123/7AAAA", collectionDate: "2026-04-08", customerSite: "9015865 - 108", totalKg: 14, lines: [{ ewc: "180103/09", kg: 4 }, { ewc: "18 01 03", kg: 6 }, { ewc: "18 01 04", kg: 4 }] });
  const out = compareReturn({ rows: parsed.rows.slice(0, 1), notes: [mixed, note("z", "ABC123/7ZZZZ", "2026-05-01", 3, { siteId: "" })], customerSite: parsed.customerSite, siteId: "branch", year: 2026, quarter: 2 });
  assert.equal(out.matched[0].noteKg, 10, "4 + 6 hazardous; the 18 01 04 line is not on a hazardous return");
  assert.equal(out.matched[0].weightOk, true);
  assert.deepEqual(out.extra.map((e) => e.note.id), ["z"], "found by site number although no site is chosen");
});

console.log(`\n${n} passed`);
