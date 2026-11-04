import assert from "node:assert/strict";
import {
  STATUS, addDays, buildAssign, buildEdit, buildLaptopLink, buildLoanOut, buildNewLaptop, buildReturn, buildUpdated, dayKey, daysBetween, holderText, holderUid,
  isDay, isOnLoan, loanState, parseDay, parseLaptopImport, parseLaptopLink, ukDay, updateState,
} from "../src/modules/laptops/laptops.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const TODAY = "2026-11-04";
const actor = { uid: "it-uid", displayName: "Ivy IT" };
const ben = { uid: "ben-uid", name: "Ben Smith" };
const base = (over = {}) => ({ id: "L1", assetCode: "W91003MLAP10020", status: "spare", active: true, currentUserUid: "", currentUserName: "", condition: "good", win11: "yes", office365: true, loan: null, lastUpdatedOn: "2026-05-01", nextUpdateDue: "2026-11-20", ...over });

t("days are plain text, compared as real dates", () => {
  assert.equal(isDay("2026-02-29"), false, "2026 is not a leap year");
  assert.equal(isDay("2028-02-29"), true);
  assert.equal(daysBetween("2026-11-04", "2026-11-11"), 7);
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(ukDay("2026-11-04"), "04/11/2026");
  assert.equal(parseDay("13/05/2025"), "2025-05-13");
  assert.equal(parseDay("9.3.26"), "2026-03-09");
  assert.equal(parseDay("31/02/2026"), "", "not a real day");
  assert.equal(parseDay("2026-11-04"), "2026-11-04");
});

t("an update or a loan is due soon within a week, overdue after, and a decommissioned laptop is never due", () => {
  assert.deepEqual(updateState(base({ nextUpdateDue: "2026-11-11" }), TODAY), { state: "soon", days: 7 });
  assert.deepEqual(updateState(base({ nextUpdateDue: "2026-11-12" }), TODAY), { state: "ok", days: 8 });
  assert.deepEqual(updateState(base({ nextUpdateDue: "2026-11-03" }), TODAY), { state: "overdue", days: -1 });
  assert.deepEqual(updateState(base({ nextUpdateDue: "" }), TODAY), { state: "none", days: null });
  assert.equal(updateState(base({ status: "decommissioned", nextUpdateDue: "2020-01-01" }), TODAY).state, "none");
  const loaned = base({ status: "on_loan", loan: { borrowerUid: "ben-uid", borrowerName: "Ben Smith", dueBackOn: "2026-11-02" } });
  assert.deepEqual(loanState(loaned, TODAY), { state: "overdue", days: -2 });
  assert.equal(loanState(base(), TODAY).state, "none");
});

t("lending a laptop needs a person from the list and a due date that is not in the past, and never twice", () => {
  const { patch, event } = buildLoanOut({ laptop: base(), borrower: ben, dueBackOn: "2026-11-18", today: TODAY, actor });
  assert.equal(patch.status, "on_loan");
  assert.equal(patch.loan.borrowerUid, "ben-uid");
  assert.equal(patch.loan.recordedByUid, "it-uid");
  assert.equal(patch.borrowerUid, "ben-uid", "the borrower is also a plain field, so the database rules can let them read their own loan");
  assert.equal(event.type, "loan_out");
  assert.match(event.text, /loaned to Ben Smith, due back 18\/11\/2026/);
  assert.throws(() => buildLoanOut({ laptop: base(), borrower: { uid: "", name: "Ben" }, dueBackOn: "2026-11-18", today: TODAY, actor }), /staff list/);
  assert.throws(() => buildLoanOut({ laptop: base(), borrower: ben, dueBackOn: "2026-11-03", today: TODAY, actor }), /in the past/);
  assert.throws(() => buildLoanOut({ laptop: base(), borrower: ben, dueBackOn: "", today: TODAY, actor }), /due back/);
  assert.throws(() => buildLoanOut({ laptop: base({ status: "on_loan", loan: patch.loan }), borrower: ben, dueBackOn: "2026-11-18", today: TODAY, actor }), /already on loan/);
  assert.throws(() => buildLoanOut({ laptop: base({ status: "decommissioned" }), borrower: ben, dueBackOn: "2026-11-18", today: TODAY, actor }), /decommissioned/);
  assert.throws(() => buildLoanOut({ laptop: base({ condition: "faulty" }), borrower: ben, dueBackOn: "2026-11-18", today: TODAY, actor }), /faulty/);
});

t("a return needs its condition, records how late it was, and puts the laptop back as it was", () => {
  const out = buildLoanOut({ laptop: base({ status: "in_use", currentUserUid: "ali-uid", currentUserName: "Ali Khan" }), borrower: ben, dueBackOn: "2026-11-10", today: "2026-11-04", actor });
  const loaned = base({ status: "on_loan", ...out.patch, currentUserUid: "ali-uid", currentUserName: "Ali Khan" });
  assert.equal(isOnLoan(loaned), true);
  assert.throws(() => buildReturn({ laptop: loaned, condition: "unknown", today: "2026-11-12", actor }), /condition/);
  assert.throws(() => buildReturn({ laptop: base(), condition: "good", today: TODAY, actor }), /not on loan/);
  const back = buildReturn({ laptop: loaned, condition: "good", today: "2026-11-12", actor });
  assert.equal(back.patch.status, "in_use", "a laptop that was assigned goes back to its person");
  assert.equal(back.patch.loan, null);
  assert.equal(back.patch.borrowerUid, "");
  assert.match(back.event.text, /returned by Ben Smith \(good\), 2 days late/);
  assert.equal(back.event.detail.daysLate, 2);
  const spare = buildLoanOut({ laptop: base(), borrower: ben, dueBackOn: "2026-11-10", today: TODAY, actor });
  assert.equal(buildReturn({ laptop: base({ status: "on_loan", ...spare.patch }), condition: "very_good", today: "2026-11-09", actor }).patch.status, "spare");
});

t("recording an update needs a day that has happened and a next day after it", () => {
  const ok = buildUpdated({ laptop: base(), updatedOn: "2026-11-04", nextDueOn: "2027-05-04", today: TODAY, actor });
  assert.deepEqual([ok.patch.lastUpdatedOn, ok.patch.nextUpdateDue, ok.patch.lastUpdatedByUid], ["2026-11-04", "2027-05-04", "it-uid"]);
  assert.throws(() => buildUpdated({ laptop: base(), updatedOn: "2026-11-05", nextDueOn: "2027-05-04", today: TODAY, actor }), /not happened/);
  assert.throws(() => buildUpdated({ laptop: base(), updatedOn: "2026-11-04", nextDueOn: "2026-11-04", today: TODAY, actor }), /after/);
  assert.throws(() => buildUpdated({ laptop: base(), updatedOn: "2026-11-04", nextDueOn: "", today: TODAY, actor }), /next due/);
});

t("assigning, editing and decommissioning go through the same checks", () => {
  assert.equal(buildAssign({ laptop: base(), holder: ben, today: TODAY, actor }).patch.status, "in_use");
  assert.equal(buildAssign({ laptop: base({ status: "in_use", currentUserUid: "x" }), holder: null, today: TODAY, actor }).patch.status, "spare");
  assert.throws(() => buildAssign({ laptop: base({ status: "on_loan", loan: { borrowerUid: "b" } }), holder: ben, today: TODAY, actor }), /Return it/);
  const edit = buildEdit({ laptop: base(), changes: { condition: "faulty", notes: "  battery  " }, today: TODAY, actor });
  assert.deepEqual(edit.patch, { condition: "faulty", notes: "battery" });
  assert.throws(() => buildEdit({ laptop: base(), changes: { condition: "shiny" }, today: TODAY, actor }), /condition/);
  assert.throws(() => buildEdit({ laptop: base(), changes: {}, today: TODAY, actor }), /Nothing/);
  assert.throws(() => buildEdit({ laptop: base(), changes: { status: "on_loan" }, today: TODAY, actor }), /Loan out/);
  const gone = buildEdit({ laptop: base({ status: "in_use", currentUserUid: "x", currentUserName: "X", nextUpdateDue: "2026-12-01" }), changes: { status: "decommissioned" }, today: TODAY, actor });
  assert.deepEqual([gone.patch.status, gone.patch.currentUserUid, gone.patch.nextUpdateDue, gone.patch.loan], ["decommissioned", "", "", null], "a decommissioned laptop has no holder, no due date and no loan");
  assert.equal(gone.patch.borrowerUid, "");
});

t("a new laptop needs a code, a holder from the list when in use, and cannot start on loan", () => {
  const made = buildNewLaptop({ assetCode: " w91003mlap10026 ", status: "in_use", currentUser: ben, condition: "excellent", lastUpdatedOn: "2026-11-05" }, { today: TODAY, actor });
  assert.equal(made.laptop.assetCode, "W91003MLAP10026");
  assert.equal(made.laptop.currentUserUid, "ben-uid");
  assert.equal(made.laptop.lastUpdatedOn, "", "an update date in the future is not kept");
  assert.throws(() => buildNewLaptop({ assetCode: "" }, { today: TODAY, actor }), /asset code/);
  assert.throws(() => buildNewLaptop({ assetCode: "X", status: "on_loan" }, { today: TODAY, actor }), /loan/);
  assert.throws(() => buildNewLaptop({ assetCode: "X", status: "in_use", currentUser: { uid: "", name: "" } }, { today: TODAY, actor }), /staff list/);
});

t("who is told about a laptop: whoever has it on loan, else whoever it is assigned to; and how it reads", () => {
  assert.equal(holderUid(base({ status: "in_use", currentUserUid: "ali-uid" })), "ali-uid");
  const loaned = base({ status: "on_loan", currentUserUid: "ali-uid", loan: { borrowerUid: "ben-uid", borrowerName: "Ben Smith", dueBackOn: "2026-11-18" } });
  assert.equal(holderUid(loaned), "ben-uid");
  assert.equal(holderText(loaned), "On loan to Ben Smith until 18/11/2026");
  assert.equal(holderText(base()), "Spare");
  assert.equal(holderText(base({ status: "decommissioned" })), "Decommissioned");
  assert.equal(holderUid(base({ status: "decommissioned", currentUserUid: "x" })) === "x", true, "the caller decides; decommissioned laptops are filtered before reminders");
});

t("the QR label holds a link that opens the laptop, and a plain code also works", () => {
  const link = buildLaptopLink({ id: "abc 1" });
  assert.equal(link, "https://app.primovex.co.uk/sense/open/laptop/abc%201");
  assert.deepEqual(parseLaptopLink(link), { id: "abc 1", raw: link });
  assert.equal(parseLaptopLink("MEDTRAK:LAPTOP:abc")?.id, "abc");
  assert.equal(parseLaptopLink("https://app.primovex.co.uk/sense/open/compliance/FP-7"), null, "a fire point is not a laptop");
  assert.equal(parseLaptopLink(""), null);
});

// an invented sheet shaped like the practice's: the BitLocker column is present and must never be kept
const FAKE_KEYS = ["00000001", "00000002", "00000003", "00000004", "00000005", "00000006"];
const HEAD = ["Laptop Name", "Bit Locker Code", "Function / Owner", "CURRENT USER", "UPDATED", "Sim number", "Office 365", "UPGRADED", "BORROWED", "RETURNED", "CONDITION", "Win 11 compatible"];
const SHEET = [
  HEAD,
  ["W91003MLAP10001", FAKE_KEYS[0], "SPARE", "N/A", "13/05/2025", "", "YES", "", "", "decomissioned", "GOOD", "NO"],
  ["W91003MLAP10015", FAKE_KEYS[1], "SPARE", "SPARE", "09/07/2026", "", "YES", "•", "09/04/2026", "", "V GOOD", "WIN 11"],
  ["W91003MLAP10020", FAKE_KEYS[2], "SIMON", "SIMON", "08/12/2026", "", "YES", "•", "", "", "EXCELLENT", "WIN 11"],
  ["W91003MLAP10021", FAKE_KEYS[3], "NICOLA", "NICOLA", "09/09/2026", "", "YES", "•", "", "", "EXCELLENT", "WIN 11"],
  ["W91003MLAP10017", FAKE_KEYS[4], "MING", "MING", "09/03/2026", "", "YES", "•", "", "", "EXCELLENT", "WIN 11"],
  ["W91003MLAP10009", FAKE_KEYS[5], "was Nicola's", "N/A", "18/11/2024", "", "YES", "", "", "decomissioned", "FAULTY BATTERY", "NO"],
  ["W91003MLAP10015", "00000007", "SPARE", "SPARE", "", "", "", "", "", "", "", ""],
].map((r) => r.join("\t")).join("\n");
const STAFF = [{ uid: "simon-uid", displayName: "Simon Jones" }, { uid: "nicola-uid", displayName: "Nicola Evans" }, { uid: "ben1", displayName: "Ben Smith" }, { uid: "ben2", displayName: "Ben Jones" }];

t("the paste import reads the practice's sheet: names matched from the staff list, decommissioned and spare recognised, columns reported", () => {
  const { rows, ignored, problem } = parseLaptopImport(SHEET, { today: TODAY, staff: STAFF });
  assert.equal(problem, "");
  assert.equal(rows.length, 7);
  const by = (code) => rows.find((r) => r.assetCode === code);
  assert.deepEqual([by("W91003MLAP10001").laptop.status, by("W91003MLAP10001").laptop.condition, by("W91003MLAP10001").laptop.win11], ["decommissioned", "good", "no"]);
  assert.deepEqual([by("W91003MLAP10015").laptop.status, by("W91003MLAP10015").laptop.condition, by("W91003MLAP10015").laptop.upgraded], ["spare", "very_good", true]);
  assert.deepEqual([by("W91003MLAP10021").laptop.status, by("W91003MLAP10021").laptop.currentUser], ["in_use", { uid: "nicola-uid", name: "Nicola Evans" }]);
  assert.equal(by("W91003MLAP10009").laptop.condition, "faulty");
  assert.equal(by("W91003MLAP10009").laptop.notes, "battery");
  assert.equal(by("W91003MLAP10009").laptop.status, "decommissioned");
  const ming = by("W91003MLAP10017");
  assert.equal(ming.laptop.status, "in_use", "a name that matches nobody is still in use");
  assert.equal(ming.laptop.currentUser, null);
  assert.match(ming.warnings.join(" "), /"MING" is not in the staff list/);
  assert.equal(by("W91003MLAP10015").laptop.lastUpdatedOn, "2026-07-09", "09/07/2026 is read day first, a real past day, so it is kept");
  const cols = Object.fromEntries(ignored.map((c) => [c.column, c.why]));
  assert.match(cols["bit locker code"], /never kept/);
  assert.ok(cols["borrowed"] && cols["returned"] && cols["sim number"]);
});

t("a date in the future is not guessed at: it is left blank and the row says why", () => {
  const { rows } = parseLaptopImport(SHEET, { today: TODAY, staff: STAFF });
  const simon = rows.find((r) => r.assetCode === "W91003MLAP10020");
  assert.equal(simon.laptop.lastUpdatedOn, "");
  assert.match(simon.warnings.join(" "), /08\/12\/2026 is in the future/);
  const ok = rows.find((r) => r.assetCode === "W91003MLAP10021");
  assert.equal(ok.laptop.lastUpdatedOn, "2026-09-09", "a real past day is kept");
  assert.equal(rows.find((r) => r.assetCode === "W91003MLAP10001").laptop.lastUpdatedOn, "2025-05-13");
});

t("a BitLocker recovery key never appears anywhere in what the import produces", () => {
  const result = JSON.stringify(parseLaptopImport(SHEET, { today: TODAY, staff: STAFF }));
  for (const key of [...FAKE_KEYS, "00000007"]) assert.ok(!result.includes(key), `the code ${key} must not be in the result`);
  const noCode = parseLaptopImport(["Laptop Name\tBitLocker\tCURRENT USER", "W1\t99999999\tSPARE"].join("\n"), { today: TODAY, staff: STAFF });
  assert.ok(!JSON.stringify(noCode).includes("99999999"));
  assert.match(noCode.ignored[0].why, /never kept/);
});

t("a name that matches two people is not guessed; duplicates and missing codes are errors", () => {
  const sheet = ["Laptop Name\tCURRENT USER", "W1\tBEN", "W1\tSPARE", "W2\tSPARE", "\tSPARE", "W3\tSPARE"].join("\n");
  const { rows } = parseLaptopImport(sheet, { today: TODAY, staff: STAFF, existingCodes: ["w3"] });
  assert.match(rows[0].warnings.join(" "), /more than one person/);
  assert.equal(rows[0].laptop.currentUser, null);
  assert.match(rows[1].errors.join(" "), /twice/);
  assert.deepEqual(rows[2].errors, []);
  assert.match(rows[3].errors.join(" "), /No asset code/);
  assert.match(rows[4].errors.join(" "), /Already in the register/);
});

t("a comma-separated file works too, and a paste with no laptop column is refused", () => {
  const csv = 'Laptop Name,Condition,"CURRENT USER"\nW9,"EXCELLENT","NICOLA"';
  const { rows } = parseLaptopImport(csv, { today: TODAY, staff: STAFF });
  assert.equal(rows[0].laptop.condition, "excellent");
  assert.equal(rows[0].laptop.currentUser.uid, "nicola-uid");
  assert.match(parseLaptopImport("Colour\tSize\nred\tbig", { today: TODAY }).problem, /no column/i);
  assert.match(parseLaptopImport("Laptop Name", { today: TODAY }).problem, /at least one laptop/);
  assert.equal(STATUS.on_loan, "On loan");
  assert.equal(dayKey(new Date(2026, 10, 4)), "2026-11-04");
});

console.log(`\n${n} passed`);
