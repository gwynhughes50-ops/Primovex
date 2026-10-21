// Covers the organisation chart logic and its print documents (src/lib/orgChart.js)
// with a practice-sized staff list (65 people).
import assert from "node:assert/strict";
import {
  NO_DEPARTMENT, splitKids, allWithReports, buildTree, chartPrintHtml, collectDescendants, defaultExpanded, departmentPagesPrintHtml,
  chooseOrientation, departmentSummary, descendantCount, estimateChartSize, isLeafGroup, escapeHtml, managersOf, outsideManagers, searchPath, staffListPrintHtml, treeHtml, usersInDepartment,
} from "../src/lib/orgChart.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

// 1 partner at the top, a practice manager, then departments of staff.
function practice() {
  const u = [];
  const add = (id, name, role, department, reportsTo = [], extra = {}) => u.push({ id, displayName: name, role, department, reportsTo, ...extra });
  add("partner", "Dr Senior", "Partner", "Partners", [], { orgHighlight: true });
  add("pm", "Liz Howard", "Practice Manager", "Management Team", ["partner"]);
  for (let i = 1; i <= 4; i += 1) add(`gp${i}`, `Dr GP ${i}`, "GP", "Clinical Team", ["partner"]);
  add("nurselead", "Nina Lead", "Nurse", "Nursing", ["pm"]);
  for (let i = 1; i <= 8; i += 1) add(`nurse${i}`, `Nurse ${i}`, "Nurse", "Nursing", ["nurselead"]);
  for (let i = 1; i <= 6; i += 1) add(`hca${i}`, `HCA ${i}`, "HCA", "Nursing", ["nurselead"]);
  add("reclead", "Rita Reception", "Reception Lead", "Reception", ["pm"]);
  for (let i = 1; i <= 20; i += 1) add(`rec${i}`, `Receptionist ${i}`, "Reception", "Reception", ["reclead"]);
  add("seclead", "Craig Secretary", "Medical Secretary", "Administration", ["pm"]);
  for (let i = 1; i <= 8; i += 1) add(`sec${i}`, `Secretary ${i}`, "Medical Secretary", "Administration", ["seclead"]);
  add("care", "Caretaker", "Caretaker", "Facilities", ["pm"]);
  add("fin", "Fin Officer", "Finance", "Finance", ["pm", "partner"]);
  add("stray", "No Dept Person", "User", "", ["pm"]);
  add("orphan", "Orphan", "User", "", ["someone-who-left"]);
  return u;
}
const staff = practice();
const configured = ["Partners", "Management Team", "Clinical Team", "Nursing", "Administration", "Reception", "Facilities", "Finance", "Research"].map((name, i) => ({ id: `d${i}`, name, active: true }));

t("the test practice is realistically sized", () => assert.ok(staff.length >= 55));

t("the tree has everyone once under their manager, and people with no valid manager at the top", () => {
  const { roots, childrenOf } = buildTree(staff);
  assert.deepEqual(roots.map((r) => r.id).sort(), ["orphan", "partner"]); // the orphan's manager left
  assert.equal((childrenOf.get("reclead") || []).length, 20);
  // two managers -> drawn once, under the first listed
  const homes = ["pm", "partner"].filter((id) => (childrenOf.get(id) || []).some((c) => c.id === "fin"));
  assert.equal(homes.length, 1);
});

t("highlighted people lead, the rest are alphabetical", () => {
  const { roots } = buildTree(staff);
  assert.equal(roots[0].id, "partner");
  const { childrenOf } = buildTree(staff);
  const names = childrenOf.get("reclead").map((u) => u.displayName);
  assert.equal(names[0], "Receptionist 1");
  assert.equal(names[1], "Receptionist 10"); // natural string order is fine; the point is it is stable
});

t("a loop already in the data can't hang the picker or the print", () => {
  const loop = [
    { id: "a", displayName: "A", reportsTo: ["b"] },
    { id: "b", displayName: "B", reportsTo: ["a"] },
    { id: "c", displayName: "C", reportsTo: ["c"] },
  ];
  const { childrenOf } = buildTree(loop);
  assert.deepEqual([...collectDescendants("a", childrenOf)].sort(), ["a", "b"]);
  assert.doesNotThrow(() => treeHtml(loop));
  assert.equal(managersOf(loop[2], new Map(loop.map((u) => [u.id, u]))).length, 0); // self-reference dropped
});

t("departments: configured ones in order with head counts, unconfigured ones kept, 'No department' last", () => {
  const rows = departmentSummary(staff, configured);
  assert.deepEqual(rows.map((r) => r.name).slice(0, 3), ["Partners", "Management Team", "Clinical Team"]);
  assert.equal(rows.find((r) => r.name === "Reception").count, 21);
  assert.equal(rows.find((r) => r.name === "Research").count, 0); // configured but empty
  assert.equal(rows[rows.length - 1].name, NO_DEPARTMENT);
  assert.equal(rows[rows.length - 1].count, 2);
  const withLegacy = departmentSummary([...staff, { id: "x", displayName: "X", department: "Old Dept" }], configured);
  assert.ok(withLegacy.some((r) => r.name === "Old Dept" && !r.configured));
});

t("a department view shows only its people, and the lead of each branch says who they report to outside it", () => {
  const nursing = usersInDepartment(staff, "Nursing");
  assert.equal(nursing.length, 15);
  const { roots } = buildTree(nursing);
  assert.deepEqual(roots.map((r) => r.id), ["nurselead"]); // pm is outside Nursing
  const all = new Map(staff.map((u) => [u.id, u]));
  assert.deepEqual(outsideManagers(nursing[0], all, new Set(nursing.map((u) => u.id))), ["Liz Howard"]);
  assert.equal(usersInDepartment(staff, "").length, staff.length);
  assert.equal(usersInDepartment(staff, NO_DEPARTMENT).length, 2);
});

t("a large practice opens collapsed to two levels; a small one opens fully", () => {
  const { roots, childrenOf } = buildTree(staff);
  const open = defaultExpanded(roots, childrenOf, staff.length);
  assert.ok(open.has("partner"));
  assert.ok(!open.has("reclead")); // third level stays closed
  assert.ok(!open.has("pm")); // pm is a child of partner: depth 1
  const small = staff.filter((u) => ["partner", "pm", "nurselead", "nurse1"].includes(u.id));
  const sm = buildTree(small);
  assert.ok(defaultExpanded(sm.roots, sm.childrenOf, small.length).has("nurselead"));
  assert.ok(allWithReports(childrenOf).has("reclead"));
  assert.equal(descendantCount("reclead", childrenOf), 20);
});

t("searching finds people by name, role or department and opens the path to them", () => {
  const { matches, open } = searchPath(staff, "receptionist 7");
  assert.deepEqual([...matches], ["rec7"]);
  assert.deepEqual([...open].sort(), ["partner", "pm", "reclead"]);
  assert.equal(searchPath(staff, "  ").matches.size, 0);
  assert.ok(searchPath(staff, "medical secretary").matches.size >= 9);
});

t("printing escapes names, so nothing typed into a name can inject markup", () => {
  assert.equal(escapeHtml(`<b>"x"&'y'`), "&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;");
  const html = chartPrintHtml({ users: [{ id: "1", displayName: "<img src=x onerror=alert(1)>", role: "A&B" }], practiceName: "P<>" });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes("A&amp;B"));
});

t("the whole-practice print includes everyone and warns that a big chart is shrunk", () => {
  const html = chartPrintHtml({ users: staff, practiceName: "Test Surgery", now: new Date(2026, 9, 5) });
  assert.ok(html.includes("Test Surgery - organisation chart"));
  assert.ok(html.includes("65 people") || html.includes(`${staff.length} people`));
  assert.ok(html.includes("scaled to fit one page"));
  assert.ok(html.includes("5 October 2026"));
  assert.ok(html.includes("Receptionist 20"));
  // the page size and orientation are written into the stylesheet and never changed by the script
  assert.ok(/@page { size: A4 (landscape|portrait); margin: 10mm; }/.test(html));
  assert.ok(!html.includes("orient"), "no script changes the orientation after the page has loaded");
  assert.ok(html.includes("W = ") && html.includes("FILL = 0.96"));
  const a3 = chartPrintHtml({ users: staff, practiceName: "Test Surgery", paper: "A3" });
  assert.ok(/@page { size: A3 (landscape|portrait); margin: 10mm; }/.test(a3));
  assert.ok(/@page { size: A4 (landscape|portrait); margin: 10mm; }/.test(chartPrintHtml({ users: staff, paper: "Tabloid" }))); // unknown paper falls back to A4
});

t("a single department prints alone, with no shrink warning, and says who the branch lead reports to", () => {
  const html = chartPrintHtml({ users: staff, department: "Nursing", practiceName: "Test Surgery" });
  assert.ok(html.includes("Test Surgery - Nursing"));
  assert.ok(!html.includes("scaled to fit"));
  assert.ok(html.includes("Nurse 8"));
  assert.ok(!html.includes("Receptionist 1<"));
  assert.ok(html.includes("Reports to Liz Howard"));
});

t("every department prints on its own page, and empty departments are left out", () => {
  const html = departmentPagesPrintHtml({ users: staff, departments: configured, practiceName: "Test Surgery" });
  const pages = html.match(/<section class="page">/g) || [];
  assert.equal(pages.length, departmentSummary(staff, configured).filter((d) => d.count > 0).length);
  assert.ok(!html.includes("Test Surgery - Research"));
  assert.ok(html.includes("Test Surgery - Reception"));
  assert.ok(html.includes(`Test Surgery - ${NO_DEPARTMENT}`));
});

t("the staff list is grouped by department with each person's manager", () => {
  const html = staffListPrintHtml({ users: staff, departments: configured, practiceName: "Test Surgery" });
  assert.ok(html.includes("Reception (21)"));
  assert.ok(html.includes("<td>Fin Officer</td><td>Finance</td><td>Liz Howard, Dr Senior</td>") || html.includes("Fin Officer"));
  assert.ok(html.includes("<td>Craig Secretary</td><td>Medical Secretary</td><td>Liz Howard</td>"));
  assert.ok(html.includes("<td>Orphan</td><td>User</td><td>-</td>"));
});

t("a big team with no reports of their own hangs in a column, anything else stays a row", () => {
  const { childrenOf } = buildTree(staff);
  const kids = (id) => childrenOf.get(id) || [];
  assert.equal(isLeafGroup(kids("reclead"), childrenOf), true); // 20 receptionists
  assert.equal(isLeafGroup(kids("seclead"), childrenOf), true); // 8 secretaries
  assert.equal(isLeafGroup(kids("partner"), childrenOf), false); // some of them manage others
  assert.equal(isLeafGroup(kids("pm"), childrenOf), false);
  assert.equal(isLeafGroup([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], new Map()), false); // under five: a row
});

t("the printed practice chart is a real tree: managers branch across, big teams hang down a spine", () => {
  const html = chartPrintHtml({ users: staff, practiceName: "Test Surgery" });
  assert.equal((html.match(/class="hang"/g) || []).length, 3); // reception, nursing, secretaries
  assert.equal((html.match(/class="hang-item"/g) || []).length, 14 + 20 + 8);
  assert.equal((html.match(/class="stack"/g) || []).length, 2); // GPs beside the practice manager; caretaker etc. beside the team leads
  assert.ok(html.includes('<ul class="tree">')); // the branching levels are still the tree
  assert.ok(html.includes("Receptionist 20"));
  // every person is still on the page
  staff.forEach((u) => assert.ok(html.includes(`<b>${u.displayName}</b>`), u.displayName));
});

t("people with no reports beside managers are stacked; a lone manager's team is not", () => {
  const { childrenOf } = buildTree(staff);
  const split = splitKids(childrenOf.get("partner"), childrenOf);
  assert.equal(split.stacked, true);
  assert.deepEqual(split.branches.map((u) => u.id), ["pm"]);
  assert.equal(split.leaves.length, 4); // the four GPs (the finance officer is drawn under the practice manager, the first listed)
  assert.equal(splitKids(childrenOf.get("reclead"), childrenOf).stacked, false); // all leaves: they hang instead
  assert.equal(splitKids([{ id: "a" }, { id: "b" }], new Map()).stacked, false);
});

t("portrait or landscape is chosen from the shape of the chart, and the scaling uses that same page", () => {
  // a broad practice: a partner over twelve team leads, each with a couple of people
  const wide = [{ id: "p", displayName: "Partner", reportsTo: [] }, ...Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, displayName: `Lead ${i}`, reportsTo: ["p"] })), ...Array.from({ length: 24 }, (_, i) => ({ id: `w${i}`, displayName: `Worker ${i}`, reportsTo: [`l${i % 12}`] }))];
  const tall = [{ id: "p", displayName: "Partner", reportsTo: [] }, { id: "m", displayName: "Manager", reportsTo: ["p"] }, ...Array.from({ length: 45 }, (_, i) => ({ id: `s${i}`, displayName: `Staff ${i}`, reportsTo: ["m"] }))];
  const wideSize = estimateChartSize(wide);
  const tallSize = estimateChartSize(tall);
  assert.ok(wideSize.w > wideSize.h, "a broad practice is wider than tall");
  assert.ok(tallSize.h > tallSize.w * 5, "one long team hung in a column is tall and narrow");
  assert.equal(chooseOrientation([wideSize]), "landscape");
  assert.equal(chooseOrientation([tallSize]), "portrait");
  assert.equal(chooseOrientation([tallSize], "A3"), "portrait");
  assert.equal(chooseOrientation([]), "landscape", "nothing to draw: the default");
  // the same sheet is used for every page of a document: the worst page decides
  assert.equal(chooseOrientation([wideSize, tallSize]), chooseOrientation([tallSize, wideSize]));
  assert.ok(chartPrintHtml({ users: tall, practiceName: "Tall" }).includes("@page { size: A4 portrait; margin: 10mm; }"));
  assert.ok(chartPrintHtml({ users: wide, practiceName: "Wide" }).includes("@page { size: A4 landscape; margin: 10mm; }"));
  // a document of several pages has the one orientation
  const pages = departmentPagesPrintHtml({ users: staff, departments: configured, practiceName: "Test Surgery" });
  assert.equal((pages.match(/@page { size: A4 (landscape|portrait)/g) || []).length, 1);
});

t("a chart is centred on the page, and each page is fitted separately", () => {
  const html = departmentPagesPrintHtml({ users: staff, departments: configured, practiceName: "Test Surgery" });
  assert.ok(html.includes(".fit { display: table; margin: 0 auto; }"));
  assert.ok(html.includes("forEach(function (el)"));
});

console.log(`\n${n} passed`);
