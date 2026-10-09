import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brandOf, buildMedicineNames, parseAmps, parseVmps, parseVtms } from "./dmd/dmdParse.mjs";
import { createMedicineNormaliser, setMedicineData, setStockAliases } from "../src/ai/stock/medicineNames.js";
import { resolveStockItem, suggestStockItems } from "../src/ai/stock/stockAsk.js";
import { buildUseDraft } from "../src/ai/stock/stockUse.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

// ---- the importer, on a small piece of dm+d in the same shape as the real files ------------------------------------
const VTM = `<?xml version="1.0"?><VIRTUAL_THERAPEUTIC_MOIETIES>
<VTM><VTMID>1</VTMID><NM>Chlorphenamine</NM></VTM>
<VTM><VTMID>2</VTMID><NM>Adrenaline</NM></VTM>
<VTM><VTMID>3</VTMID><NM>Old &amp; retired</NM><INVALID>1</INVALID></VTM>
<VTM><VTMID>4</VTMID><NM>Glyceryl trinitrate</NM></VTM>
</VIRTUAL_THERAPEUTIC_MOIETIES>`;
const VMP = `<VIRTUAL_MED_PRODUCTS>
<VMP><VPID>11</VPID><VTMID>1</VTMID><NM>Chlorphenamine 10mg/1ml solution for injection ampoules</NM></VMP>
<VMP><VPID>12</VPID><VTMID>2</VTMID><NM>Adrenaline (base) 300micrograms/0.3ml (1 in 1,000) solution for injection pre-filled auto-injector</NM></VMP>
<VMP><VPID>13</VPID><VTMID>4</VTMID><NM>Glyceryl trinitrate 400micrograms/dose sublingual spray</NM></VMP>
<VMP><VPID>14</VPID><NM>Some dressing with no moiety</NM></VMP>
</VIRTUAL_MED_PRODUCTS>`;
const AMP = `<ACTUAL_MEDICINAL_PRODUCTS>
<AMP><APID>21</APID><VPID>11</VPID><NM>Piriton 10mg/1ml solution for injection ampoules (GlaxoSmithKline)</NM></AMP>
<AMP><APID>22</APID><VPID>11</VPID><NM>Chlorphenamine 10mg/1ml solution for injection ampoules (Phoenix)</NM></AMP>
<AMP><APID>23</APID><VPID>12</VPID><NM>EpiPen 300micrograms/0.3ml (1 in 1,000) solution for injection auto-injector pre-filled pen (Mylan)</NM></AMP>
<AMP><APID>24</APID><VPID>13</VPID><NM>Nitrolingual 400micrograms/dose pump spray (Pohl-Boskamp)</NM></AMP>
<AMP><APID>25</APID><VPID>14</VPID><NM>Mepilex Border dressing</NM></AMP>
<AMP><APID>26</APID><VPID>11</VPID><NM>Retired brand 10mg/1ml</NM><INVALID>1</INVALID></AMP>
</ACTUAL_MEDICINAL_PRODUCTS>`;

t("the dm+d files are read, ignoring anything marked invalid", () => {
  const vtms = parseVtms(VTM);
  assert.deepEqual(vtms.map((v) => v.name), ["Chlorphenamine", "Adrenaline", "Glyceryl trinitrate"]);
  assert.equal(parseVmps(VMP).length, 4);
  assert.equal(parseAmps(AMP).length, 5);
  assert.equal(parseVtms("<VTM><VTMID>9</VTMID><NM>A &amp; B</NM></VTM>")[0].name, "A & B");
});

t("a brand name is the words before the strength or form", () => {
  assert.equal(brandOf("Piriton 10mg/1ml solution for injection ampoules (GlaxoSmithKline)"), "piriton");
  assert.equal(brandOf("Solu-Cortef 100mg powder for solution for injection vials"), "solu-cortef");
  assert.equal(brandOf("Depo-Provera 150mg/1ml suspension for injection pre-filled syringes"), "depo-provera");
  assert.equal(brandOf("Mepilex Border dressing"), "mepilex border dressing");
  assert.equal(brandOf("Tablets"), "");
});

t("brands lead to their substance; unbranded products and products with no moiety add nothing", () => {
  const names = buildMedicineNames({ vtms: parseVtms(VTM), vmps: parseVmps(VMP), amps: parseAmps(AMP) });
  assert.deepEqual(names.generics, ["adrenaline", "chlorphenamine", "glyceryl trinitrate"]);
  const resolved = Object.fromEntries(Object.entries(names.brands).map(([b, i]) => [b, names.generics[i]]));
  assert.deepEqual(resolved, { piriton: "chlorphenamine", epipen: "adrenaline", nitrolingual: "glyceryl trinitrate" });
});

// ---- using the names ------------------------------------------------------------------------------------------------
const seed = JSON.parse(readFileSync(new URL("../src/data/medicineNames.json", import.meta.url), "utf8"));

t("a brand, a US name and a spelling slip all come to the same UK generic name", () => {
  const norm = createMedicineNormaliser(seed);
  assert.equal(norm("one ampoule of Piriton"), "one ampoule of chlorphenamine");
  assert.equal(norm("chlorpheniramine"), "chlorphenamine");
  assert.equal(norm("an EpiPen"), "an adrenaline");
  assert.equal(norm("epinephrine"), "adrenaline");
  assert.equal(norm("hydrocortiosne injection"), "hydrocortisone injection");
  assert.equal(norm("chlorphenaimne"), "chlorphenamine");
  assert.equal(norm("Solu-Cortef 100mg"), "hydrocortisone 100mg");
  assert.equal(norm("Pneumovax"), "pneumococcal polysaccharide vaccine");
});

t("ordinary words and strengths are left alone", () => {
  const norm = createMedicineNormaliser(seed);
  for (const s of ["nitrile gloves medium", "10mg/1ml solution for injection ampoules", "blue needles", "gauze swabs 5cm", "remove one from stock", "treatment room 1"]) assert.equal(norm(s), s, s);
});

t("names the practice has taught are used too, longest first", () => {
  const norm = createMedicineNormaliser({ ...seed, aliases: [{ say: "the emergency injector", means: "Adrenaline" }, { say: "blue dressings", means: "Mepore" }] });
  assert.equal(norm("I took the emergency injector"), "i took the adrenaline");
  assert.equal(norm("blue dressings"), "mepore");
  assert.equal(createMedicineNormaliser({ aliases: [{ say: "", means: "x" }, { say: "x", means: "" }] })("x"), "x");
});

const chlor = { id: "chl", name: "Chlorphenamine", strength: "10mg/1ml", form: "solution for injection ampoules", site: "Main Surgery", location: "Store", current_stock: 12, locations: [], batches: [{ batch_number: "CH-5521", expiry_date: "2027-06-30", quantity: 12 }] };
const adr = { id: "adr", name: "Adrenaline", strength: "300micrograms/0.3ml", form: "auto-injector", site: "Main Surgery", location: "Store", current_stock: 4, locations: [], batches: [{ batch_number: "EP-1", expiry_date: "2027-01-31", quantity: 4 }] };
const pneumo = { id: "pv", name: "Pneumococcal polysaccharide vaccine", strength: "", form: "pre-filled syringe", site: "Main Surgery", location: "Fridge", current_stock: 10, locations: [], batches: [{ batch_number: "PV-9", expiry_date: "2027-05-31", quantity: 10 }] };
const gloves = { id: "gl", name: "Nitrile gloves", strength: "", form: "medium", site: "Main Surgery", location: "Store", current_stock: 40, locations: [] };
const items = [chlor, adr, pneumo, gloves];

t("matching stock: what was said is found by any of its names", () => {
  setMedicineData(seed);
  setStockAliases([]);
  assert.equal(resolveStockItem("piriton", items).item.id, "chl");
  assert.equal(resolveStockItem("chlorpheniramine ampoule", items).item.id, "chl");
  assert.equal(resolveStockItem("epipen", items).item.id, "adr");
  assert.equal(resolveStockItem("pneumovax", items).item.id, "pv");
  assert.equal(resolveStockItem("hydrocortiosne", items).status, "none", "not in stock, and still not guessed");
  assert.equal(suggestStockItems("chlorpehniramine", items)[0].id, "chl", "a bad slip is offered back");
});

t("the Orb's stock card uses it end to end", () => {
  setMedicineData(seed);
  const piriton = buildUseDraft({ question: "I've just used one piriton from stock" }, { items });
  assert.ok(piriton.proposal, piriton.text);
  assert.equal(piriton.proposal.params.itemId, "chl");
  const pneu = buildUseDraft({ question: "please remove one pneumovax from stock" }, { items });
  assert.equal(pneu.proposal.params.itemId, "pv");
  setStockAliases([{ say: "emergency injector", means: "adrenaline" }]);
  assert.equal(buildUseDraft({ question: "I took the emergency injector from stock" }, { items }).proposal.params.itemId, "adr");
  setStockAliases([]);
});

t("without the name list the Orb still works as before", () => {
  setMedicineData({ generics: [], brands: {} });
  assert.equal(resolveStockItem("chlorpheniramine", items).item.id, "chl", "the UK/US names are built in");
  assert.equal(resolveStockItem("piriton", items).status, "none");
  setMedicineData(seed);
});

console.log(`\n${n} passed`);
