// Covers the PC register (src/modules/computers/computers.js): making and changing a PC, the quick check the IT team record as they go round, the QR links, filtering, and reading the
// practice's own spreadsheet (laid out like the real "Software and Toner Log" sheet: headings over two rows, a tick under each installed program, and a name part-way down for a second site).
import assert from "node:assert/strict";
import {
  CHECK_EVERY_DAYS, SOFTWARE, buildChecked, buildComputerLink, buildEditComputer, buildNewComputer, checkState, cleanSoftware, filterComputers, missingSoftware, needsCheck,
  parseComputerLink, parseComputersSheet, summariseComputers, tidy, usualSoftware,
} from "../src/modules/computers/computers.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const TODAY = "2026-11-15";
const actor = { uid: "u1", displayName: "Gwyn Hughes" };
const site = { id: "s1", name: "Main building" };

t("a PC is made from what is given, tidied, with a line in its history", () => {
  const { computer, event } = buildNewComputer({ assetNumber: " 146 ", site, department: "PRESCRIBING SUPERVISOR", label: "KAREN B", printerSerial: "phcgg13306", status: "in_use", software: ["docman", "emis", "nonsense", "emis"], holder: { uid: "u9", name: "Karen Bevan" } }, { today: TODAY, actor });
  assert.equal(computer.assetNumber, "146");
  assert.equal(computer.department, "Prescribing Supervisor");
  assert.equal(computer.label, "Karen B");
  assert.equal(computer.printerSerial, "PHCGG13306");
  assert.deepEqual(computer.software, ["emis", "docman"], "fixed keys, each once, in the sheet's order");
  assert.equal(computer.currentUserName, "Karen Bevan");
  assert.equal(computer.lastCheckedOn, "");
  assert.equal(event.type, "added"); assert.equal(event.text, "PC 146 added at Main building"); assert.equal(event.byName, "Gwyn Hughes"); assert.equal(event.onDay, TODAY);
  assert.throws(() => buildNewComputer({ assetNumber: "  " }), /Give the PC its number/);
  assert.equal(buildNewComputer({ assetNumber: "9", status: "spare", holder: { uid: "u9", name: "X" } }).computer.currentUserUid, "", "a spare PC has no holder");
  assert.equal(buildNewComputer({ assetNumber: "9" }, { imported: true }).event.type, "imported");
});

t("a PC can be edited, and each change says what changed; a spare or decommissioned PC loses its holder", () => {
  const pc = { id: "p1", assetNumber: "146", status: "in_use", currentUserUid: "u9", currentUserName: "Karen", software: ["emis"] };
  const a = buildEditComputer({ computer: pc, changes: { department: "ADMIN/POST ROOM", software: ["emis", "lexacom"], printerSerial: "x1" }, today: TODAY, actor });
  assert.deepEqual(a.patch, { department: "Admin/Post Room", software: ["emis", "lexacom"], printerSerial: "X1" });
  assert.equal(a.event.text, "PC 146: department, printer, software changed");
  const b = buildEditComputer({ computer: pc, changes: { status: "decommissioned" }, today: TODAY, actor });
  assert.equal(b.patch.currentUserUid, ""); assert.equal(b.event.type, "status"); assert.match(b.event.text, /\(now decommissioned\)/);
  assert.throws(() => buildEditComputer({ computer: pc, changes: {} }), /Nothing was changed/);
  assert.throws(() => buildEditComputer({ computer: pc, changes: { status: "lost" } }), /Choose a status/);
  assert.equal(buildEditComputer({ computer: pc, changes: { status: "spare", holder: { uid: "u2", name: "Z" } } }).patch.currentUserUid, "");
});

t("a check is recorded with who and when, can correct the software found, and can note a problem", () => {
  const pc = { id: "p1", assetNumber: "146", status: "in_use", software: ["emis", "docman", "patches"] };
  const a = buildChecked({ computer: pc, today: TODAY, actor });
  assert.deepEqual(a.patch, { lastCheckedOn: TODAY, lastCheckedByName: "Gwyn Hughes", lastCheckNote: "" });
  assert.equal(a.event.text, "PC 146 checked"); assert.equal(a.event.type, "checked");
  const b = buildChecked({ computer: pc, software: ["emis", "docman", "lexacom"], note: "Screen flickers", today: TODAY, actor });
  assert.deepEqual(b.patch.software, ["emis", "docman", "lexacom"]);
  assert.equal(b.event.text, "PC 146 checked, Lexacom added, Patches removed: Screen flickers");
  assert.deepEqual(b.event.detail.softwareChanged, ["Lexacom added", "Patches removed"]);
  assert.equal(buildChecked({ computer: pc, software: ["emis", "docman", "patches"], today: TODAY, actor }).patch.software, undefined, "nothing changed: the list is left alone");
  assert.equal(buildChecked({ computer: pc, checkedOn: "2026-11-10", today: TODAY, actor }).patch.lastCheckedOn, "2026-11-10");
  assert.throws(() => buildChecked({ computer: pc, checkedOn: "2026-12-01", today: TODAY }), /cannot be in the future/);
  assert.throws(() => buildChecked({ computer: pc, checkedOn: "yesterday", today: TODAY }), /not a date/);
  assert.throws(() => buildChecked({ computer: { ...pc, status: "decommissioned" }, today: TODAY }), /decommissioned/);
  assert.equal(buildChecked({ computer: pc, note: "x".repeat(400), today: TODAY }).patch.lastCheckNote.length, 200);
});

t("a PC is due a check every 90 days, and 'soon' two weeks before", () => {
  assert.equal(CHECK_EVERY_DAYS, 90);
  assert.equal(checkState({ status: "in_use" }, TODAY).state, "never");
  assert.equal(checkState({ status: "in_use", lastCheckedOn: "2026-11-01" }, TODAY).state, "ok");
  const soon = checkState({ status: "in_use", lastCheckedOn: "2026-08-25" }, TODAY); // due 23 Nov: 8 days
  assert.equal(soon.state, "soon"); assert.equal(soon.days, 8); assert.equal(soon.dueOn, "2026-11-23");
  assert.equal(checkState({ status: "in_use", lastCheckedOn: "2026-08-16" }, TODAY).state, "overdue");
  assert.equal(checkState({ status: "decommissioned", lastCheckedOn: "2020-01-01" }, TODAY).state, "none");
  assert.equal(needsCheck({ status: "in_use" }, TODAY), true); assert.equal(needsCheck({ status: "in_use", lastCheckedOn: "2026-11-14" }, TODAY), false); assert.equal(needsCheck({ status: "decommissioned" }, TODAY), false);
});

t("the QR link opens the PC, and a link or a code is read back", () => {
  const link = buildComputerLink({ id: "abc 1" }, "https://app.primovex.co.uk/");
  assert.equal(link, "https://app.primovex.co.uk/sense/open/pc/abc%201");
  assert.deepEqual(parseComputerLink(link), { id: "abc 1", raw: link });
  assert.equal(parseComputerLink("/sense/open/pc/x9").id, "x9", "a link without the address works");
  assert.equal(parseComputerLink("MEDTRAK:PC:x9").id, "x9");
  assert.equal(parseComputerLink("https://app.primovex.co.uk/sense/open/laptop/x9"), null, "a laptop's label is not a PC's");
  assert.equal(parseComputerLink(""), null); assert.equal(parseComputerLink("hello"), null);
});

t("tidying the sheet's capitals", () => {
  assert.equal(tidy("PRESCRIBING SUPERVISOR"), "Prescribing Supervisor"); assert.equal(tidy("PCA"), "PCA"); assert.equal(tidy("KAREN B"), "Karen B"); assert.equal(tidy("RECEPTION DESK (LEFT)"), "Reception Desk (Left)");
  assert.equal(tidy("ADMIN/POST ROOM"), "Admin/Post Room"); assert.equal(tidy("Ty-Elan"), "Ty-Elan"); assert.equal(tidy("Education Room"), "Education Room"); assert.equal(tidy(""), "");
  assert.equal(tidy("ROOM 12"), "Room 12"); assert.equal(tidy("OFFICE OF THE PRACTICE"), "Office of the Practice");
});

const base = { status: "in_use", siteId: "s1", siteName: "Main building" };
const list = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, assetNumber: String(100 + i), ...base, department: "Consultation", label: `Room ${i + 1}`, software: ["emis", "docman", "labeltrace", "patches", "inrstar"], lastCheckedOn: "2026-11-01" })),
  { id: "b1", assetNumber: "90", ...base, department: "Secretaries", label: "Liz", software: ["emis", "docman", "labeltrace", "inrstar", "lexacom"] },
  { id: "b2", assetNumber: "22", status: "spare", siteId: "s2", siteName: "Ty-Elan", department: "Consultation", label: "Room 1", software: ["emis", "docman", "labeltrace", "patches", "inrstar"], printerSerial: "PHCGH10755" },
  { id: "b3", assetNumber: "5", status: "decommissioned", siteId: "s1", siteName: "Main building", department: "Old", label: "Old", software: [] },
];

t("software almost every PC has is 'usual', and a PC without it is flagged", () => {
  const usual = usualSoftware(list);
  assert.deepEqual(usual, ["emis", "docman", "labeltrace", "inrstar", "patches"], "in the sheet's order");
  assert.ok(usual.includes("emis") && !usual.includes("lexacom"));
  assert.deepEqual(missingSoftware(list.find((p) => p.id === "b1"), usual), ["patches"]);
  assert.deepEqual(usualSoftware(list.slice(0, 3)), [], "too few PCs to say what is usual");
});

t("filters: words, site, department, software it has or lacks, status, and needing a check", () => {
  const ids = (f) => filterComputers(list, f).map((p) => p.id);
  assert.deepEqual(ids({ term: "ty-elan" }), ["b2"]);
  assert.deepEqual(ids({ term: "phcgh10755" }), ["b2"], "the printer serial is searchable");
  assert.deepEqual(ids({ term: "room 1" }).includes("b2"), true);
  assert.deepEqual(ids({ siteId: "s2" }), ["b2"]);
  assert.deepEqual(ids({ department: "Secretaries" }), ["b1"]);
  assert.deepEqual(ids({ has: "lexacom" }), ["b1"]);
  assert.equal(ids({ missing: "patches" }).includes("b1"), true);
  assert.deepEqual(ids({ missing: "usual" }), ["b1", "b3"], "a PC lacking something usual, including the decommissioned one");
  assert.deepEqual(ids({ status: "spare" }), ["b2"]);
  assert.equal(ids({ status: "live" }).includes("b3"), false);
  assert.equal(ids({ status: "all" }).length, list.length);
  const due = ids({ status: "due", today: TODAY });
  assert.deepEqual(due.sort(), ["b1", "b2"], "never checked, and live");
});

t("the summary counts live PCs, spares, gaps and software", () => {
  const s = summariseComputers(list);
  assert.equal(s.total, 22); assert.equal(s.inUse, 21); assert.equal(s.spare, 1); assert.equal(s.decommissioned, 1);
  assert.equal(s.counts.lexacom, 1); assert.equal(s.counts.emis, 22); assert.equal(s.withGaps, 1);
  assert.deepEqual(s.sites.map((x) => [x.name, x.count]), [["Main building", 21], ["Ty-Elan", 1]]);
});

// ---- the practice's sheet, as readWorkbook gives it: { r, cells: { column: value } } ----
const TICK = ""; // the sheet's symbol-font tick: whatever it is, a non-empty cell means installed
const row = (r, cells) => ({ r, cells });
const SHEET = {
  name: "PCs & Printers",
  rows: [
    row(1, { 1: "TONER ALLOCATION LOG", 4: "INSTALLED SOFTWARE", 14: "PC No's" }),
    row(3, { 1: "DEPARTMENT", 2: "SERIAL NUMBER", 3: "USER", 12: "Lexacom", 13: "Patches", 14: "PC" }),
    row(4, { 4: "Emis", 5: "Docman", 6: "Label Trace", 7: "Express Invoice", 8: "INR Star", 9: "Spirotrac ", 10: "24hr BP", 11: "Seca (ECG)" }),
    row(5, { 1: "CMC" }),
    row(7, { 1: "YELLOW = Printer serial numbers" }), row(8, { 1: "GREEN = PC numbers" }),
    row(10, { 1: "PCA", 2: "CNMBQ900JV", 3: "PHONES", 4: TICK, 5: TICK, 6: TICK, 8: TICK, 13: TICK, 14: "W91003MDPC10119" }),
    row(11, { 1: "PCA", 3: "PHONES", 4: TICK, 5: TICK, 6: TICK, 8: TICK, 13: TICK, 14: 146 }),
    row(12, { 1: "PCA", 2: "PHCBQ9H13Y", 3: "DUTY", 4: TICK, 5: TICK, 6: TICK, 8: TICK, 12: TICK, 13: TICK, 14: 130 }),
    row(13, { 1: "PCA", 3: "DAVE", 4: TICK, 5: TICK, 6: TICK, 8: TICK, 13: TICK, 14: 124 }),
    row(14, { 1: "PHARMACIST", 2: "PHCBQ9H13Y", 3: "JACQUELINE", 4: TICK, 5: TICK, 6: TICK, 8: TICK, 12: TICK, 13: TICK, 14: 147 }),
    row(15, { 1: "BUSINESS ROOM", 3: "SPARE", 4: TICK, 5: TICK, 6: TICK, 8: TICK, 13: TICK, 14: 70 }),
    row(16, { 1: "CONSULTATION", 2: "PHCGG13292", 3: "ROOM 25", 4: TICK, 5: TICK, 6: TICK, 8: TICK, 12: TICK, 13: TICK, 14: "80 & 85" }),
    row(17, { 1: "SECRETARIES", 3: "SARAH K", 4: TICK, 5: TICK, 6: TICK, 8: TICK, 14: 118 }),
    row(20, { 1: "Ty-Elan" }),
    row(22, { 1: "RECEPTION", 2: "PHCGH10763", 3: "RECEPTION DESK", 4: TICK, 5: TICK, 6: TICK, 8: TICK, 13: TICK, 14: "W91003ADPC10023" }),
    row(23, { 1: "CONSULTATION", 2: "PHCGH10755", 3: "ROOM 1", 4: TICK, 5: TICK, 6: TICK, 8: TICK, 12: TICK, 13: TICK, 14: 22 }),
    row(24, { 1: "CONSULTATION", 3: "ROOM 2", 4: TICK, 5: TICK, 14: 146 }),
  ],
};
const staff = [{ uid: "u-dave", displayName: "Dave Jones" }, { uid: "u-sk", displayName: "Sarah Kemp" }, { uid: "u-sl", displayName: "Sarah Lloyd" }, { uid: "u-ja", displayName: "Jacqueline Price" }];

t("the sheet is read: headings over two rows, ticks as software, sections as sites", () => {
  const r = parseComputersSheet(SHEET, { staff });
  assert.equal(r.problem, "");
  assert.deepEqual(r.softwareFound.sort(), ["bp24", "docman", "emis", "expressinvoice", "inrstar", "labeltrace", "lexacom", "patches", "seca", "spirotrac"]);
  const pcs = r.rows.map((x) => x.assetNumber);
  assert.deepEqual(pcs, ["W91003MDPC10119", "146", "130", "124", "147", "70", "80", "85", "118", "W91003ADPC10023", "22", "146"]);
  assert.deepEqual(r.groups.map((g) => [g.key, g.label]), [["", "First section"], ["Ty-Elan", "Ty-Elan"]]);
  assert.equal(r.rows.find((x) => x.assetNumber === "22").groupKey, "Ty-Elan");
  assert.equal(r.rows.find((x) => x.assetNumber === "130").groupKey, "");
  const p130 = r.rows.find((x) => x.assetNumber === "130").computer;
  assert.deepEqual(p130.software, ["emis", "docman", "labeltrace", "inrstar", "lexacom", "patches"]);
  assert.equal(p130.printerSerial, "PHCBQ9H13Y"); assert.equal(p130.department, "PCA"); assert.equal(p130.label, "DUTY");
  assert.deepEqual(r.rows.find((x) => x.assetNumber === "118").computer.software, ["emis", "docman", "labeltrace", "inrstar"], "no patches tick: no patches");
});

t("a spare PC, a name that matches one member of staff, and rooms that match nobody", () => {
  const r = parseComputersSheet(SHEET, { staff });
  const by = (n) => r.rows.find((x) => x.assetNumber === n).computer;
  assert.equal(by("70").status, "spare"); assert.equal(by("70").holder, null);
  assert.deepEqual(by("124").holder, { uid: "u-dave", name: "Dave Jones" });
  assert.deepEqual(by("118").holder, { uid: "u-sk", name: "Sarah Kemp" }, "SARAH K means Sarah Kemp, not Sarah Lloyd");
  assert.equal(by("22").holder, null); assert.equal(by("146").holder, null, "PHONES is a place");
  const two = parseComputersSheet({ ...SHEET, rows: SHEET.rows.map((x) => (x.r === 17 ? row(17, { ...x.cells, 3: "SARAH" }) : x)) }, { staff });
  assert.equal(two.rows.find((x) => x.assetNumber === "118").computer.holder, null, "two Sarahs: nobody is guessed");
});

t("two PCs on one row are added as two, with a warning; a repeated printer or number is flagged", () => {
  const r = parseComputersSheet(SHEET, { staff });
  const eighty = r.rows.filter((x) => ["80", "85"].includes(x.assetNumber));
  assert.equal(eighty.length, 2);
  assert.match(eighty[0].warnings.join(" "), /Listed together with 85 on one row/);
  assert.match(eighty[1].warnings.join(" "), /Listed together with 80 on one row/);
  assert.equal(eighty[0].computer.printerSerial, eighty[1].computer.printerSerial);
  const dupPrinter = r.rows.find((x) => x.assetNumber === "147");
  assert.match(dupPrinter.warnings.join(" "), /Printer PHCBQ9H13Y is also listed for PC 130/);
  const dupNumber = r.rows[r.rows.length - 1];
  assert.deepEqual(dupNumber.errors, ["Listed twice in this sheet."]);
  assert.match(r.rows[0].warnings.join(" "), /asset name/, "a long number is noted");
});

t("a PC number already in the register is skipped, and text numbers are matched without case", () => {
  const r = parseComputersSheet(SHEET, { staff, existingNumbers: ["146", "w91003adpc10023", 70] });
  const skipped = r.rows.filter((x) => x.errors.includes("Already in the register.")).map((x) => x.assetNumber).sort();
  assert.deepEqual(skipped, ["146", "146", "70", "W91003ADPC10023"].sort(), "both rows numbered 146 are skipped");
  assert.deepEqual(r.rows.find((x) => x.assetNumber === "70").errors, ["Already in the register."]);
});

t("a sheet with no PC column, no program names, or no PCs says what is wrong in words", () => {
  assert.match(parseComputersSheet({ rows: [row(1, { 1: "Hello" })] }).problem, /can't find a column headed PC/);
  assert.match(parseComputersSheet({ rows: [row(1, { 1: "PC", 2: "USER" })] }).problem, /can't find the program names/);
  assert.match(parseComputersSheet({ rows: [row(1, { 1: "PC", 2: "Emis" })] }).problem, /no PCs under the headings/);
  assert.match(parseComputersSheet({ rows: [] }).problem, /empty/);
});

t("software keys are fixed and cleaned", () => {
  assert.equal(SOFTWARE.length, 10);
  assert.deepEqual(cleanSoftware(["patches", "emis", "emis", "x"]), ["emis", "patches"]);
  assert.deepEqual(cleanSoftware("emis"), []);
});

console.log(`\n${n} tests passed`);
