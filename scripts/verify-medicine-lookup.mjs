import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchMedicines, titleCase } from "../src/lib/medicineLookup.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const real = JSON.parse(readFileSync("src/data/medicineNames.json", "utf8"));
const small = { generics: ["adrenaline", "chlorphenamine", "simvastatin", "tranexamic acid", "articaine + adrenaline"], brands: { epipen: 0, piriton: 1, "piriton allergy": 1, zocor: 2 } };

t("names are shown in capitals the way a person writes them", () => {
  assert.equal(titleCase("chlorphenamine"), "Chlorphenamine");
  assert.equal(titleCase("articaine + adrenaline"), "Articaine + Adrenaline");
  assert.equal(titleCase("zinc sulfate and sodium"), "Zinc Sulfate and Sodium");
});

t("typing a few letters finds the substance, and a brand leads to its substance", () => {
  assert.deepEqual(searchMedicines(small, "chlor").map((r) => r.label), ["Chlorphenamine"]);
  const brand = searchMedicines(small, "pirit");
  assert.deepEqual(brand.map((r) => [r.name, r.brand]), [["Chlorphenamine", "Piriton"], ["Chlorphenamine", "Piriton Allergy"]]);
  assert.equal(brand[0].kind, "brand");
  assert.equal(brand[0].label, "Piriton (Chlorphenamine)");
});

t("an exact name comes first, then names that start with it, then names that contain it", () => {
  const found = searchMedicines(small, "adrenaline").map((r) => r.label);
  assert.equal(found[0], "Adrenaline");
  assert.ok(found.includes("Articaine + Adrenaline"), "a combination containing the word");
  assert.deepEqual(searchMedicines(small, "acid").map((r) => r.label), ["Tranexamic Acid"]);
});

t("too little typed, nothing known, or no list yet gives nothing", () => {
  assert.deepEqual(searchMedicines(small, "a"), []);
  assert.deepEqual(searchMedicines(small, "zzzz"), []);
  assert.deepEqual(searchMedicines(null, "chlor"), []);
  assert.equal(searchMedicines(small, "e", { limit: 3 }).length, 0);
});

t("the real dm+d list answers common stock names", () => {
  const eclipse = searchMedicines(real, "adrenal", { limit: 5 });
  assert.ok(eclipse.some((r) => r.label === "Adrenaline"));
  const epi = searchMedicines(real, "epipen");
  assert.ok(epi.some((r) => r.name === "Adrenaline" && /Epipen/.test(r.brand)));
  assert.ok(searchMedicines(real, "paracet").some((r) => r.name === "Paracetamol"));
  assert.ok(searchMedicines(real, "simva", { limit: 3 }).length <= 3);
});

console.log(`\n${n} passed`);
