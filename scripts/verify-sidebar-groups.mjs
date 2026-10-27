import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_OPEN, groupOfPath, isOpen, opened, parseStored, toggled } from "../src/config/sidebarGroups.js";
import { SIDEBAR_SECTIONS, getVisibleRouteManifest } from "../src/config/routeManifest.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

t("My work and Core start open, every other group starts folded", () => {
  assert.deepEqual(DEFAULT_OPEN, ["mywork", "core"]);
  for (const key of ["mywork", "core"]) assert.equal(isOpen({}, key), true);
  for (const key of ["operations", "intelligence", "connected", "system"]) assert.equal(isOpen({}, key), false);
  assert.equal(isOpen(undefined, "core"), true);
});

t("what a person opens or folds is kept, and beats the default", () => {
  assert.equal(isOpen({ operations: true }, "operations"), true);
  assert.equal(isOpen({ core: false }, "core"), false);
  const folded = toggled({}, "core");
  assert.deepEqual(folded, { core: false });
  assert.deepEqual(toggled(folded, "core"), { core: true });
  assert.deepEqual(toggled({}, "system"), { system: true });
  assert.deepEqual(toggled({ core: false }, "operations"), { core: false, operations: true }, "the others are left as they were");
});

t("arriving at a page opens its group and changes nothing when it is already open", () => {
  const stored = { core: true };
  assert.equal(opened(stored, "core"), stored, "the same object back: nothing to save");
  assert.deepEqual(opened({}, "operations"), { operations: true });
  assert.equal(opened({}, "mywork") && Object.keys(opened({}, "mywork")).length, 0, "open by default: nothing to record");
  assert.deepEqual(opened({ operations: false }, "operations"), { operations: true });
});

t("what was saved on the device is read safely", () => {
  assert.deepEqual(parseStored('{"core":false,"operations":true}'), { core: false, operations: true });
  assert.deepEqual(parseStored(null), {});
  assert.deepEqual(parseStored("rubbish"), {});
  assert.deepEqual(parseStored("[1,2]"), {});
  assert.deepEqual(parseStored('{"core":"yes","system":true}'), { system: true }, "only true or false is kept");
});

const groups = [
  { key: "mywork", items: [{ path: "/my-timesheet" }, { path: "/mileage" }] },
  { key: "core", items: [{ path: "/governance/concerns" }, { path: "/governance/sars" }, { path: "/governance" }] },
  { key: "operations", items: [{ path: "/timesheets" }] },
];

t("the group holding a page is found from its address, including pages inside it", () => {
  assert.equal(groupOfPath("/my-timesheet", groups), "mywork");
  assert.equal(groupOfPath("/mileage/new", groups), "mywork");
  assert.equal(groupOfPath("/governance/sars/", groups), "core");
  assert.equal(groupOfPath("/timesheets", groups), "operations");
  assert.equal(groupOfPath("/timesheets-other", groups), "", "a longer name is not inside it");
  assert.equal(groupOfPath("/nowhere", groups), "");
  assert.equal(groupOfPath("", groups), "");
});

t("My work holds the four personal pages, first in the menu, for anyone signed in", () => {
  assert.equal(SIDEBAR_SECTIONS[0].key, "mywork");
  assert.equal(SIDEBAR_SECTIONS[0].label, "My work");
  const staff = getVisibleRouteManifest({ isAdmin: false, capabilities: [] });
  const mine = staff.filter((r) => r.section === "mywork").map((r) => r.label);
  assert.deepEqual(mine, ["Timesheet", "Annual leave", "My training", "Mileage", "From ClinFlow"]);
  const operations = staff.filter((r) => r.section === "operations").map((r) => r.label);
  for (const label of mine) assert.ok(!operations.includes(label), `${label} is no longer under Operations`);
  assert.ok(staff.every((r) => SIDEBAR_SECTIONS.some((s) => s.key === r.section) || r.section === "developer"), "every visible page is in a group the menu shows");
});

t("the menu folds: headings are buttons that say whether they are open, and the choice is remembered", () => {
  const src = read("src/components/navigation/DesktopSidebar.jsx");
  assert.match(src, /aria-expanded=\{open\}/);
  assert.match(src, /aria-controls=\{`sidebar-group-\$\{section\.key\}`\}/);
  assert.match(src, /saveStored\(next\)/);
  assert.match(src, /groupOfPath\(pathname, standardSections\)/);
  assert.match(src, /const open = collapsed \|\| isOpen\(stored, section\.key\)/, "the narrow icon-only menu still shows every page");
});

console.log(`\n${n} passed`);
