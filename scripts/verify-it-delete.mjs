// Deleting a laptop or a PC from the IT register: the reason is picked from a list, the record is hidden rather than wiped (so its history can still answer "what happened to it?"),
// the holder is let go, and a laptop on loan has to come back first.
import assert from "node:assert/strict";
import { DELETE_REASONS, buildDelete, buildLoanOut, buildNewLaptop, isLive } from "../src/modules/laptops/laptops.js";
import { buildDeleteComputer, buildNewComputer, filterComputers } from "../src/modules/computers/computers.js";
import { readFileSync } from "node:fs";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const TODAY = "2026-11-16";
const actor = { uid: "it1", displayName: "Ceri IT" };

t("the reasons are a fixed list", () => {
  assert.deepEqual(Object.keys(DELETE_REASONS), ["duplicate", "disposed", "lost", "gone", "other"]);
});

t("a laptop is deleted with a reason: hidden, its holder let go, and the history line says why and who", () => {
  const { laptop } = buildNewLaptop({ assetCode: "lt-12", status: "in_use", holder: { uid: "u9", name: "Karen B" } }, { today: "2026-10-01", actor });
  const made = { ...laptop, id: "L1", nextUpdateDue: "2027-01-01" };
  const { patch, event } = buildDelete({ laptop: made, reason: "disposed", today: TODAY, actor });
  assert.equal(patch.active, false);
  assert.equal(patch.deletedReason, "disposed");
  assert.equal(patch.deletedOn, TODAY);
  assert.equal(patch.deletedByName, "Ceri IT");
  assert.equal(patch.currentUserUid, "");
  assert.equal(patch.nextUpdateDue, "");
  assert.equal(event.type, "deleted");
  assert.equal(event.laptopId, "L1");
  assert.equal(event.text, "LT-12 deleted from the register: disposed of or recycled");
  assert.equal(event.byName, "Ceri IT");
  assert.equal(event.detail.reason, "disposed");
  assert.equal(isLive({ ...made, ...patch }), false);
});

t("a laptop needs a reason from the list, cannot be deleted twice, and cannot be deleted while on loan", () => {
  const { laptop } = buildNewLaptop({ assetCode: "LT-13" }, { today: "2026-10-01", actor });
  const made = { ...laptop, id: "L2" };
  assert.throws(() => buildDelete({ laptop: made, reason: "", actor }), /Choose why/);
  assert.throws(() => buildDelete({ laptop: made, reason: "because", actor }), /Choose why/);
  assert.throws(() => buildDelete({ laptop: { ...made, active: false }, reason: "lost", actor }), /already been deleted/);
  assert.throws(() => buildDelete({ laptop: null, reason: "lost", actor }), /already been deleted/);
  const lent = { ...made, ...buildLoanOut({ laptop: made, borrower: { uid: "u2", name: "Sam" }, dueBackOn: "2026-11-23", conditionOut: "good", today: TODAY, actor }).patch };
  assert.throws(() => buildDelete({ laptop: lent, reason: "lost", actor }), /Return it from loan first/);
});

t("a decommissioned laptop can still be deleted", () => {
  const { laptop } = buildNewLaptop({ assetCode: "LT-14", status: "decommissioned" }, { today: "2026-10-01", actor });
  assert.equal(buildDelete({ laptop: { ...laptop, id: "L3" }, reason: "gone", today: TODAY, actor }).patch.active, false);
});

t("a PC is deleted the same way, and drops out of the register's lists", () => {
  const { computer } = buildNewComputer({ assetNumber: "146", status: "in_use", holder: { uid: "u9", name: "Karen B" } }, { today: "2026-10-01", actor });
  const made = { ...computer, id: "P1" };
  const { patch, event } = buildDeleteComputer({ computer: made, reason: "duplicate", today: TODAY, actor });
  assert.equal(patch.active, false);
  assert.equal(patch.deletedReason, "duplicate");
  assert.equal(patch.currentUserUid, "");
  assert.equal(event.type, "deleted");
  assert.equal(event.text, "PC 146 deleted from the register: added by mistake, or a duplicate");
  assert.equal(filterComputers([made], { status: "live", today: TODAY }).length, 1);
  assert.equal(filterComputers([{ ...made, ...patch }], { status: "live", today: TODAY }).length, 0, "no longer live");
  assert.throws(() => buildDeleteComputer({ computer: made, reason: "", actor }), /Choose why/);
  assert.throws(() => buildDeleteComputer({ computer: { ...made, active: false }, reason: "lost", actor }), /already been deleted/);
});

t("both screens offer Delete to the IT team with the reasons, and the registers hide a deleted record", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  for (const file of ["../src/components/laptops/LaptopActions.jsx", "../src/components/computers/ComputerActions.jsx"]) {
    const s = read(file);
    assert.match(s, /Why is it being deleted/);
    assert.match(s, /Object\.entries\(DELETE_REASONS\)/);
    assert.match(s, /Yes, delete it/);
  }
  assert.match(read("../src/modules/laptops/laptopService.js"), /filter\(\(l\) => l\.active !== false\)/);
  assert.match(read("../src/modules/computers/computerService.js"), /filter\(\(c\) => c\.active !== false\)/);
});

console.log(`\n${n} checks passed`);
