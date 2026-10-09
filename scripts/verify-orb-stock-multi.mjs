import assert from "node:assert/strict";
import { buildAnyUseDraft, buildUseDraft, mergeUseSentence, parseUseItems } from "../src/ai/stock/stockUse.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const chlor = { id: "chl", name: "Chlorphenamine", strength: "10mg/1ml", form: "ampoule", site: "Main Surgery", location: "Store", current_stock: 12, locations: [], batches: [{ batch_number: "CH-5521", expiry_date: "2027-06-30", quantity: 12 }] };
const adrenaline = {
  id: "adr", name: "Adrenaline", strength: "1mg/ml", form: "ampoule", site: "Main Surgery", location: "Store", current_stock: 20, locations: [],
  batches: [{ batch_number: "AB-1234821", expiry_date: "2027-03-31", quantity: 12 }, { batch_number: "CD-9904821", expiry_date: "2028-01-31", quantity: 8 }],
};
const gloves = { id: "gl", name: "Nitrile gloves", strength: "", form: "medium", site: "Main Surgery", location: "Store", current_stock: 40, locations: [] };
const combo = { id: "sal", name: "Salbutamol and ipratropium", strength: "", form: "nebules", site: "Main Surgery", location: "Store", current_stock: 6, locations: [] };
const items = [chlor, adrenaline, gloves, combo];

t("several items in one sentence are picked apart", () => {
  const s = parseUseItems("I've taken two chlorphenamine, one adrenaline and a box of gloves from the store cupboard");
  assert.deepEqual(s.map((x) => [x.quantity, x.item.toLowerCase(), x.place]), [[2, "chlorphenamine", "store cupboard"], [1, "adrenaline", "store cupboard"], [1, "gloves", "store cupboard"]]);
  const spoken = parseUseItems("please remove one chlorphenamine and two gloves from stock");
  assert.equal(spoken.length, 2);
  assert.equal(spoken[1].quantity, 2);
  assert.equal(parseUseItems("how many gloves do we have").length, 0);
  assert.equal(parseUseItems("I've taken one adrenaline from room D62").length, 1);
  // a batch belongs to the item it follows
  const withBatch = parseUseItems("I have taken 1 adrenaline batch ending 1234821; 2 chlorphenamine");
  assert.equal(withBatch[0].batch, "1234821");
  assert.equal(withBatch[1].batch, null);
});

t("two items with nothing left to ask make one card", () => {
  const r = buildAnyUseDraft({ question: "I've taken two chlorphenamine and three gloves from the store cupboard" }, { items });
  assert.ok(r.proposal, r.text);
  assert.equal(r.proposal.kind, "stock-use-multi");
  assert.equal(r.proposal.requiredCapability, "inventory.write");
  assert.deepEqual(r.proposal.params.lines.map((l) => [l.itemId, l.quantity, l.locationId, l.batchNumber]), [["chl", 2, null, "CH-5521"], ["gl", 3, null, ""]]);
  assert.match(r.proposal.lines.join(" | "), /2 × Chlorphenamine .* · batch CH-5521 · 10 left/);
  assert.match(r.proposal.lines.join(" | "), /3 × Nitrile gloves/);
  assert.match(r.text, /these 2 items/);
});

t("the first thing it can't settle is asked, and the answer carries everything said", () => {
  const first = buildAnyUseDraft({ question: "I've taken one chlorphenamine and two adrenaline from the store cupboard" }, { items });
  assert.equal(first.proposal, undefined);
  assert.match(first.text, /^Item 2 of 2: Which batch/);
  assert.equal(first.followUps.length, 2);
  assert.match(first.followUps[0].ask, /^I.ve taken 1 chlorphenamine .*; 2 Adrenaline .* batch ending /i);
  const done = buildAnyUseDraft({ question: first.followUps[1].ask }, { items });
  assert.ok(done.proposal, done.text);
  assert.deepEqual(done.proposal.params.lines.map((l) => [l.itemId, l.batchNumber]), [["chl", "CH-5521"], ["adr", "CD-9904821"]]);
});

t("a product with 'and' in its name is still one product", () => {
  const r = buildAnyUseDraft({ question: "I've used one salbutamol and ipratropium nebule" }, { items });
  assert.ok(r.proposal, r.text);
  assert.equal(r.proposal.kind, "stock-use");
  assert.equal(r.proposal.params.itemId, "sal");
});

t("one item still gives the one-item card; a product that isn't found stops the lot with nothing changed", () => {
  assert.equal(buildAnyUseDraft({ question: "I've taken one chlorphenamine from stock" }, { items }).proposal.kind, "stock-use");
  const r = buildAnyUseDraft({ question: "I've taken one chlorphenamine and two paracetamol" }, { items });
  assert.equal(r.proposal, undefined);
  assert.match(r.text, /Item 2 of 2: I couldn't find any stock matching “paracetamol”/);
});

t("saying another item while a card waits adds it to the same card", () => {
  const first = buildUseDraft({ question: "I've taken one chlorphenamine from stock" }, { items }).proposal;
  const sentence = mergeUseSentence(first, "and two nitrile gloves");
  assert.match(sentence, /^I've taken 1 Chlorphenamine .* batch ending CH-5521; 2 nitrile gloves$/);
  const merged = buildAnyUseDraft({ question: sentence }, { items });
  assert.ok(merged.proposal, merged.text + " :: " + sentence);
  assert.equal(merged.proposal.kind, "stock-use-multi");
  assert.equal(merged.proposal.params.lines.length, 2);
  // and again
  const third = mergeUseSentence(merged.proposal, "I've also taken a chlorphenamine");
  const thirdDraft = buildAnyUseDraft({ question: third }, { items });
  assert.ok(thirdDraft.proposal, thirdDraft.text + " :: " + third);
  assert.equal(thirdDraft.proposal.params.lines.length, 3);
  assert.equal(mergeUseSentence(first, "how many gloves do we have"), null);
  assert.equal(mergeUseSentence(null, "one glove"), null);
  assert.equal(mergeUseSentence({ kind: "reorder", params: {} }, "one glove"), null);
});

console.log(`\n${n} passed`);
