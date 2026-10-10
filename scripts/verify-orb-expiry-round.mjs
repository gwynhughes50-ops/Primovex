import assert from "node:assert/strict";
import { buildExpiredDraft, findExpiredBatches, looksLikeExpiryRemoval } from "../src/ai/stock/expiryRound.js";
import { extractNumberOfDays } from "../src/ai/tools/languageEngine.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date("2026-10-09T10:00:00");

const chlor = { id: "chl", name: "Chlorphenamine", strength: "10mg/1ml", form: "ampoule", site: "Main Surgery", location: "Store", current_stock: 12, locations: [], batches: [{ batch_number: "CH-1", expiry_date: "2026-09-30", quantity: 4 }, { batch_number: "CH-2", expiry_date: "2027-06-30", quantity: 8 }] };
const adrenaline = { id: "adr", name: "Adrenaline", strength: "1mg/ml", form: "ampoule", site: "Main Surgery", location: "Store", current_stock: 6, locations: [{ locationId: "kit:anaphylaxis_boxes:b3", locationName: "Anaphylaxis Box 3", locationType: "kit", quantity: 4 }], batches: [{ batch_number: "AD-9", expiry_date: "2026-08-31", quantity: 5 }, { batch_number: "AD-10", expiry_date: "2028-01-31", quantity: 1 }] };
const gloves = { id: "gl", name: "Nitrile gloves", strength: "", form: "medium", site: "Main Surgery", location: "Store", current_stock: 40, locations: [] };
const fine = { id: "ok", name: "Salbutamol", strength: "100mcg", form: "inhaler", site: "Main Surgery", location: "Store", current_stock: 3, locations: [], batches: [{ batch_number: "S1", expiry_date: "2027-02-28", quantity: 3 }] };

t("taking expired stock off is told apart from asking about it", () => {
  for (const s of ["take the expired stock off", "remove the expired stock", "write off the expired items", "dispose of everything that's out of date", "take those off stock", "clear out the expired medicines", "please remove all the expired items from stock", "do the expiry round"]) {
    assert.ok(looksLikeExpiryRemoval(s), s);
  }
  for (const s of ["what has expired", "what expires this month", "is anything out of date", "how do I remove an item", "show me expired stock", "take two gloves from the store"]) {
    assert.ok(!looksLikeExpiryRemoval(s), s);
  }
});

t("only batches past their date, with stock left, are found", () => {
  const rows = findExpiredBatches([chlor, adrenaline, gloves, fine], now);
  assert.deepEqual(rows.map((r) => [r.label.split(" ")[0], r.batchNumber, r.quantity]), [["Adrenaline", "AD-9", 5], ["Chlorphenamine", "CH-1", 4]]);
  assert.deepEqual(findExpiredBatches([gloves, fine], now), []);
});

t("the card lists every expired batch and takes it from its own batch", () => {
  const r = buildExpiredDraft({}, { items: [chlor, adrenaline, gloves, fine], now });
  assert.ok(r.proposal, r.text);
  assert.equal(r.proposal.kind, "stock-expired");
  assert.equal(r.proposal.requiredCapability, "inventory.write");
  assert.match(r.text, /2 batches \(9 units\) have passed their expiry date/);
  const lines = r.proposal.params.lines;
  const chl = lines.filter((l) => l.itemId === "chl");
  assert.deepEqual(chl.map((l) => [l.batchNumber, l.quantity, l.locationId]), [["CH-1", 4, null]]);
  // adrenaline: 2 in the main store, 4 in the kit; 5 expired comes out of the store first, then the kit
  const adr = lines.filter((l) => l.itemId === "adr");
  assert.deepEqual(adr.map((l) => [l.quantity, l.locationId]), [[2, null], [3, "kit:anaphylaxis_boxes:b3"]]);
  assert.equal(adr.reduce((s, l) => s + l.quantity, 0), 5);
  assert.match(r.proposal.lines.join("\n"), /5 × Adrenaline .* · batch AD-9 · expired 31\/08\/2026 · from 2 in .*, 3 in Anaphylaxis Box 3/);
  assert.match(r.proposal.lines.join("\n"), /more than one place, I've taken it from the main store first/);
});

t("nothing expired says so, and when the next one is due", () => {
  const r = buildExpiredDraft({}, { items: [gloves, fine], now });
  assert.equal(r.proposal, undefined);
  assert.match(r.text, /Nothing in stock has passed its expiry date\. The next to expire is Salbutamol .*28\/02\/2027/);
});

t("'this month' means the days that are left of it", () => {
  assert.equal(extractNumberOfDays("what expires this month", 60) >= 1 && extractNumberOfDays("what expires this month", 60) <= 31, true);
  assert.equal(extractNumberOfDays("what expires next month", 60), 30);
});

console.log(`\n${n} passed`);
