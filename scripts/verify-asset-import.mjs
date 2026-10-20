import assert from "node:assert/strict";
import { TEMPLATE_TEXT, buildImportPlan, mapHeaders, matchAssetType, matchFrequency, parseTable } from "../src/services/compliance/assetImport.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const ROOMS = ["Entrance", "Staff kitchen", "Reception", "Plant room", "Locker room"];
const HEAD = "Type\tName\tLocation\tFrequency\tLowest °C\tHighest °C";

t("a pasted spreadsheet (tabs) and a CSV (commas, quotes) both read as a table", () => {
  assert.deepEqual(parseTable("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseTable("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseTable('Name,Where\n"Tap, hot","He said ""hi"""\n'), [["Name", "Where"], ["Tap, hot", 'He said "hi"']]);
  assert.deepEqual(parseTable("﻿a;b\r\n1;2\r\n"), [["a", "b"], ["1", "2"]], "a file from a European Excel, with a byte-order mark");
  assert.deepEqual(parseTable("a,b\n\n1,2\n   \n"), [["a", "b"], ["1", "2"]], "blank lines are ignored");
  assert.deepEqual(parseTable(""), []);
});

t("headings are found by their own words, in any order and case", () => {
  assert.deepEqual(mapHeaders(["Name", "TYPE", "Room", "How often", "Min °C", "Max"]), { label: 0, type: 1, location: 2, frequency: 3, minTempC: 4, maxTempC: 5 });
  assert.deepEqual(mapHeaders(["Lowest °C", "Highest °C"]), { minTempC: 0, maxTempC: 1 });
  assert.deepEqual(mapHeaders(["foo", "bar"]), {});
});

t("a type is found from what a person writes", () => {
  for (const [written, key] of [["Fire Point", "fire_point"], ["fire_point", "fire_point"], ["call point", "fire_point"], ["Hot water outlet", "water_hot"], ["hot", "water_hot"], ["Cold tap", "water_cold"], ["cold water tank", "water_cold"], ["TMV", "water_tmv"], ["Shower", "water_flush"], ["Fire door", "fire_door"], ["Extinguisher", "fire_extinguisher"], ["Fridge", "fridge"], ["AED", "aed"], ["ground floor hot tap", "water_hot"], ["Calorifier", "water_hot"]]) assert.equal(matchAssetType(written), key, written);
  assert.equal(matchAssetType("spaceship"), "");
  assert.equal(matchAssetType(""), "");
});

t("a frequency is found from words; blank is fine; nonsense is not", () => {
  for (const [written, key] of [["Weekly", "weekly"], ["monthly", "monthly"], ["Every 3 months", "quarterly"], ["6 monthly", "sixmonthly"], ["Yearly", "annually"], ["daily", "daily"]]) assert.equal(matchFrequency(written), key, written);
  assert.equal(matchFrequency(""), "");
  assert.equal(matchFrequency("whenever"), null);
});

t("the example list makes a good plan with codes, types and the standard frequencies", () => {
  const plan = buildImportPlan({ text: TEMPLATE_TEXT, rooms: ROOMS });
  assert.deepEqual(plan.counts, { ok: 4, exists: 0, problem: 0 });
  assert.deepEqual(plan.rows.map((r) => [r.code, r.assetType, r.location, r.frequency]), [
    ["FP-001", "fire_point", "Entrance", "weekly"],
    ["WH-001", "water_hot", "Staff kitchen", "monthly"],
    ["WC-001", "water_cold", "Staff kitchen", "monthly"],
    ["FX-001", "fire_extinguisher", "Reception", "monthly"],
  ]);
});

t("codes carry on from the assets already there, and a retired asset's code is not reused", () => {
  const existing = [{ assetCode: "FP-001", assetType: "fire_point", label: "TF Fire Point 1", location: "Third floor", active: true }, { assetCode: "FP-002", assetType: "fire_point", label: "Old", location: "X", active: false }];
  const text = [HEAD, "Fire point\tFire point 2\tEntrance\t\t\t", "Fire point\tFire point 50\tReception\t\t\t"].join("\n");
  const plan = buildImportPlan({ text, existing, rooms: ROOMS });
  assert.deepEqual(plan.rows.map((r) => r.code), ["FP-003", "FP-004"]);
});

t("the same thing in the same place is not made twice, whether it is already there or repeated in the list", () => {
  const existing = [{ assetCode: "FP-001", assetType: "fire_point", label: "Fire point 2", location: "Entrance", active: true }];
  const text = [HEAD, "Fire point\tFire point 2\tEntrance\t\t\t", "Fire point\tFire point 16\tReception\t\t\t", "Fire point\tfire point 16\treception\t\t\t"].join("\n");
  const plan = buildImportPlan({ text, existing, rooms: ROOMS });
  assert.deepEqual(plan.rows.map((r) => r.status), ["exists", "ok", "exists"]);
  assert.deepEqual(plan.counts, { ok: 1, exists: 2, problem: 0 });
});

t("a room that is not in the site's list is a problem until one is chosen, and the choice fixes it", () => {
  const text = [HEAD, "Hot water outlet\tHot tap\tStaff Kitchen\t\t\t", "Hot water outlet\tHot tap\tGround floor kitchen\t\t\t", "Hot water outlet\tHot tap\t\t\t\t"].join("\n");
  let plan = buildImportPlan({ text, rooms: ROOMS });
  assert.deepEqual(plan.rows.map((r) => r.status), ["ok", "problem", "problem"]);
  assert.equal(plan.rows[0].location, "Staff kitchen", "matched ignoring case, and shown as the site's own spelling");
  assert.match(plan.rows[1].problems[0], /not one of the site's rooms/);
  assert.match(plan.rows[2].problems[0], /Choose the room/);
  plan = buildImportPlan({ text, rooms: ROOMS, overrides: { 3: "Reception", 4: "Plant room" } });
  assert.deepEqual(plan.rows.map((r) => r.status), ["ok", "ok", "ok"]);
  assert.deepEqual(plan.rows.map((r) => r.location), ["Staff kitchen", "Reception", "Plant room"]);
});

t("with no rooms set up for the site, the place is typed and must be given", () => {
  const text = [HEAD, "Fire point\tFire point 2\tEntrance\t\t\t", "Fire point\tFire point 3\t\t\t\t"].join("\n");
  const plan = buildImportPlan({ text, rooms: [] });
  assert.deepEqual(plan.rows.map((r) => r.status), ["ok", "problem"]);
  assert.match(plan.rows[1].problems[0], /Say where it is/);
});

t("temperatures: the type's defaults unless the list gives its own, and only for temperature checks", () => {
  const text = [HEAD, "Hot water outlet\tCalorifier\tPlant room\t\t60\t70", "Cold water outlet\tTank A\tPlant room\t\t\t", "Fire door\tDoor 1\tReception\t\t5\t10", "Hot water outlet\tBad\tPlant room\t\t70\t60"].join("\n");
  const plan = buildImportPlan({ text, rooms: ROOMS });
  assert.deepEqual([plan.rows[0].minTempC, plan.rows[0].maxTempC], [60, 70]);
  assert.deepEqual([plan.rows[1].minTempC, plan.rows[1].maxTempC], [0, 20], "the cold default");
  assert.match(plan.rows[2].problems[0], /not a temperature check/);
  assert.match(plan.rows[3].problems.join(" "), /lowest temperature must be below the highest/);
  assert.deepEqual(plan.rows.map((r) => r.status), ["ok", "ok", "problem", "problem"]);
});

t("a row that cannot be understood says why, and the others still go ahead", () => {
  const text = [HEAD, "Spaceship\tX\tEntrance\t\t\t", "Fire point\tFire point 2\tEntrance\twhenever\t\t", "Fire point\tFire point 3\tEntrance\t\t\t", "\tNo type\tEntrance\t\t\t"].join("\n");
  const plan = buildImportPlan({ text, rooms: ROOMS });
  assert.deepEqual(plan.rows.map((r) => r.status), ["problem", "problem", "ok", "problem"]);
  assert.match(plan.rows[0].problems[0], /not a type Primovex knows/);
  assert.match(plan.rows[1].problems[0], /not a frequency/);
  assert.match(plan.rows[3].problems[0], /Say what type/);
  assert.deepEqual(plan.rows.map((r) => r.line), [2, 3, 4, 5], "line numbers match the sheet, with the headings as line 1");
});

t("the name defaults from the place and the type; a fire point is always weekly", () => {
  const text = [HEAD, "Fire point\t\tEntrance\tmonthly\t\t", "Hot water outlet\t\tStaff kitchen\t\t\t"].join("\n");
  const plan = buildImportPlan({ text, rooms: ROOMS });
  assert.equal(plan.rows[0].label, "Entrance Fire Point");
  assert.equal(plan.rows[0].frequency, "weekly", "the weekly rotation is how fire points are tested");
  assert.equal(plan.rows[1].label, "Staff kitchen Hot Water Outlet");
});

t("a list with no headings, or no type column, is explained instead of guessed at", () => {
  assert.match(buildImportPlan({ text: "Fire point\tEntrance" }).problems[0], /headings/);
  assert.match(buildImportPlan({ text: "Name\tLocation\nA\tB" }).problems[0], /Type column/);
  assert.match(buildImportPlan({ text: "" }).problems[0], /Paste the list/);
  assert.match(buildImportPlan({ text: HEAD }).problems[0], /no rows/);
});

console.log(`\n${n} passed`);
