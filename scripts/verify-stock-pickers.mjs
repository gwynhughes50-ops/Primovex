// Covers the option helpers behind the Form / Site / Location dropdowns in the
// stock Add item and Edit item forms (src/lib/stockPickerOptions.js).
import assert from "node:assert/strict";
import { STOCK_FORMS, buildFormOptions, matchOption, namesWithCurrent } from "../src/lib/stockPickerOptions.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("buildFormOptions: standard list is offered, sorted", () => {
  const opts = buildFormOptions();
  assert.ok(STOCK_FORMS.every((f) => opts.includes(f)));
  assert.deepEqual(opts, [...opts].sort((a, b) => a.localeCompare(b)));
});
t("buildFormOptions: forms already on stock are added", () => {
  assert.ok(buildFormOptions(["Lozenge"]).includes("Lozenge"));
});
t("buildFormOptions: case variants don't duplicate", () => {
  const opts = buildFormOptions(["tablets", "TABLETS"], "tablets");
  assert.equal(opts.filter((o) => o.toLowerCase() === "tablets").length, 1);
  assert.ok(opts.includes("Tablets"));
});
t("buildFormOptions: an unmatched current value is kept", () => {
  assert.ok(buildFormOptions([], "Magic beans").includes("Magic beans"));
});
t("buildFormOptions: blanks ignored", () => {
  assert.ok(!buildFormOptions(["", "  ", null]).includes(""));
});
t("matchOption: finds the option ignoring case", () => {
  assert.equal(matchOption(["Tablets"], "tablets"), "Tablets");
  assert.equal(matchOption(["Tablets"], ""), "");
});
t("namesWithCurrent: keeps a value that isn't a real name", () => {
  assert.deepEqual(namesWithCurrent(["Main Site", "Branch Site"], "main_branch"), ["main_branch", "Main Site", "Branch Site"]);
  assert.deepEqual(namesWithCurrent(["Main Site"], "Main Site"), ["Main Site"]);
  assert.deepEqual(namesWithCurrent(["Main Site"], ""), ["Main Site"]);
});

console.log(`\n${n} passed`);
