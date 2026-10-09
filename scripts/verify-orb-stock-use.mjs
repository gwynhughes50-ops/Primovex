import assert from "node:assert/strict";
import { batchTails, buildUseDraft, parseUseRequest, resolveItemPlacement } from "../src/ai/stock/stockUse.js";
import { currentBatches, useFromBatches } from "../src/lib/stockBatches.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const adrenaline = {
  id: "adr", name: "Adrenaline", strength: "1mg/ml", form: "ampoule", site: "Main Surgery", location: "D62", current_stock: 20,
  locations: [{ locationId: "kit:anaphylaxis_boxes:b3", locationName: "Anaphylaxis Box 3", locationType: "kit", quantity: 2 }],
  batches: [{ batch_number: "AB-1234821", expiry_date: "2027-03-31", quantity: 12 }, { batch_number: "CD-9904821", expiry_date: "2028-01-31", quantity: 8 }],
};
const gloves = { id: "gl", name: "Nitrile gloves", strength: "", form: "medium", site: "Main Surgery", location: "Store", current_stock: 40, locations: [] };
const adrenalinePen = { id: "pen", name: "Adrenaline pen", strength: "300mcg", form: "auto-injector", site: "Main Surgery", location: "D62", current_stock: 3, locations: [] };
const items = [adrenaline, gloves];

t("what was said is understood in the ways people say it", () => {
  assert.deepEqual(parseUseRequest("I've just taken one adrenaline from room D62"), { quantity: 1, quantityAssumed: false, item: "adrenaline", place: "room D62", batch: null });
  const b = parseUseRequest("Adrenaline 1 ampoule taken from store cupboard");
  assert.equal(b.item.toLowerCase(), "adrenaline"); assert.equal(b.quantity, 1); assert.equal(b.place, "store cupboard");
  const c = parseUseRequest("ok i have used 2 vials of adrenaline from anaphylaxis box 3, batch ending 4821");
  assert.equal(c.quantity, 2); assert.equal(c.item, "adrenaline"); assert.equal(c.place, "anaphylaxis box 3"); assert.equal(c.batch, "4821");
  const d = parseUseRequest("we used a box of gloves");
  assert.equal(d.item, "gloves"); assert.equal(d.quantity, 1);
  assert.equal(parseUseRequest("I have removed one ampuole from stock").item, "", "no product named");
  assert.equal(parseUseRequest("I've taken adrenaline").quantityAssumed, true);
});

t("questions and other sentences are not use requests", () => {
  for (const s of ["how many adrenaline do we have", "where is the adrenaline", "what did I use", "the adrenaline needs ordering", "we are out of adrenaline", "tell the HCA team the adrenaline is low", "hello"]) {
    assert.equal(parseUseRequest(s), null, s);
  }
});

t("a place means one of the item's own places, including its main room and the store", () => {
  assert.equal(resolveItemPlacement("room D62", adrenaline).placement.id, null, "D62 is where its main stock is kept");
  assert.equal(resolveItemPlacement("anaphylaxis box 3", adrenaline).placement.id, "kit:anaphylaxis_boxes:b3");
  assert.equal(resolveItemPlacement("store cupboard", adrenaline).placement.id, null);
  assert.equal(resolveItemPlacement("the car park", adrenaline).status, "none");
  assert.equal(resolveItemPlacement("anaphylaxis box 13", adrenaline).status, "none");
});

t("batch tails are as short as they can be while staying different", () => {
  const tails = batchTails(adrenaline.batches);
  assert.notEqual(tails[0].toLowerCase(), tails[1].toLowerCase());
  assert.ok("AB-1234821".endsWith(tails[0]) && "CD-9904821".endsWith(tails[1]));
  assert.deepEqual(batchTails([{ batch_number: "L1111" }, { batch_number: "L2222" }]), ["111", "222"]);
});

t("the flow you described: said where, asked which batch, then a card", () => {
  const first = buildUseDraft({ question: "I've just taken one adrenaline from room D62" }, { items });
  assert.equal(first.proposal, undefined);
  assert.match(first.text, /Which batch/);
  assert.equal(first.followUps.length, 2);
  assert.ok(first.followUps.every((c) => c.label.startsWith("Batch ending ") && c.hint.includes("in stock") && c.ask));
  const second = buildUseDraft({ question: first.followUps[0].ask }, { items });
  assert.ok(second.proposal, "tapping the first batch gives a card");
  const p = second.proposal.params;
  assert.equal(p.itemId, "adr"); assert.equal(p.quantity, 1); assert.equal(p.locationId, null); assert.equal(p.batchNumber, "AB-1234821");
  assert.match(second.proposal.lines.join("\n"), /Batch: AB-1234821 · expires 31\/03\/2027/);
  assert.match(second.proposal.lines.join("\n"), /Stock after: 19 in total, 17 in Main Surgery - D62/);
  assert.equal(second.proposal.requiredCapability, "inventory.write");
  assert.match(second.text, /Nothing has been changed yet/);
  // and the other batch
  const other = buildUseDraft({ question: first.followUps[1].ask }, { items });
  assert.equal(other.proposal.params.batchNumber, "CD-9904821");
});

t("a batch said in the sentence goes straight to the card", () => {
  assert.match(buildUseDraft({ question: "I've taken one adrenaline from room D62, batch ending 4821" }, { items }).text, /More than one batch ends in/, "4821 ends both batches here");
  assert.equal(buildUseDraft({ question: "I've taken one adrenaline from room D62, batch ending 1234821" }, { items }).proposal.params.batchNumber, "AB-1234821");
  assert.ok(buildUseDraft({ question: "I've taken one adrenaline from room D62 batch CD-9904821" }, { items }).proposal);
  assert.match(buildUseDraft({ question: "I've taken one adrenaline from room D62, batch ending 7777" }, { items }).text, /couldn't find a batch/);
});

t("no place said: asked, with where it is", () => {
  const r = buildUseDraft({ question: "I've taken one adrenaline" }, { items });
  assert.match(r.text, /Where did you take/);
  assert.match(r.text, /Anaphylaxis Box 3: 2/);
  assert.equal(r.followUps.length, 2);
  assert.match(r.followUps[0], /from Main Surgery - D62/);
  assert.match(buildUseDraft({ question: r.followUps[1] }, { items }).text, /Only 2 units|Nothing has been changed|Which batch/);
});

t("one place and one batch: straight to the card", () => {
  const r = buildUseDraft({ question: "I've used two nitrile gloves" }, { items });
  assert.ok(r.proposal);
  assert.equal(r.proposal.params.quantity, 2);
  assert.match(r.proposal.lines.join("\n"), /Stock after: 38 in total/);
});

t("things that don't add up are refused", () => {
  assert.match(buildUseDraft({ question: "I've taken 5 adrenaline from anaphylaxis box 3" }, { items }).text, /Only 2 units/);
  assert.match(buildUseDraft({ question: "I've taken one adrenaline from the car park" }, { items }).text, /recorded in/);
  assert.match(buildUseDraft({ question: "I've taken one paracetamol" }, { items }).text, /couldn't find any stock/);
  assert.match(buildUseDraft({ question: "I have removed one ampuole from stock" }, { items }).text, /Which product/);
  assert.match(buildUseDraft({ question: "I've taken one adrenaline" }, { items: [{ ...adrenaline, current_stock: 0, batches: [], locations: [] }] }).text, /none is recorded/);
});

t("the sentence as it was really typed, with the US drug name, slips and 'from stock'", () => {
  const chlor = { id: "chl", name: "Chlorphenamine", strength: "10mg/1ml", form: "ampoule", site: "Main Surgery", location: "Store", current_stock: 12, locations: [], batches: [{ batch_number: "CH-5521", expiry_date: "2027-06-30", quantity: 12 }] };
  const typed = "ive just used on ampoule of chlorpheniramine from stock";
  const p = parseUseRequest(typed);
  assert.equal(p.quantity, 1);
  assert.equal(p.item.toLowerCase(), "chlorpheniramine");
  assert.equal(p.place, null, "from stock is not a place");
  const r = buildUseDraft({ question: typed }, { items: [chlor, gloves] });
  assert.ok(r.proposal, r.text);
  assert.equal(r.proposal.params.itemId, "chl");
  assert.equal(r.proposal.params.batchNumber, "CH-5521");
  assert.match(r.proposal.lines.join(" | "), /Stock after: 11 in total/);
  for (const s of ["I've just used one ampoule of chlorphenamine", "i have used 1 chlorpheniramine", "ive taken a chlorpheniramine ampoule from the store cupboard"]) assert.ok(buildUseDraft({ question: s }, { items: [chlor] }).proposal, s);
});

t("a spelling slip is offered back, never chosen", () => {
  const chlor = { id: "chl", name: "Chlorphenamine", strength: "10mg/1ml", form: "ampoule", site: "Main Surgery", location: "Store", current_stock: 12, locations: [] };
  const r = buildUseDraft({ question: "I've just used one chlorphenaimne" }, { items: [chlor, gloves] });
  assert.equal(r.proposal, undefined);
  assert.match(r.text, /Did you mean/);
  assert.match(r.text, /Chlorphenamine/);
  assert.ok(buildUseDraft({ question: r.followUps[0] }, { items: [chlor, gloves] }).proposal, "tapping it carries on");
  assert.match(buildUseDraft({ question: "I've just used one zzzzzz" }, { items: [chlor] }).text, /couldn't find any stock/);
});

t("two products that fit are asked about", () => {
  const r = buildUseDraft({ question: "I've taken one adrenaline" }, { items: [adrenaline, adrenalinePen] });
  assert.equal(r.ambiguous, true);
  assert.equal(r.followUps.length, 2);
});

t("an expired batch carries a warning on the card", () => {
  const old = { ...adrenaline, batches: [{ batch_number: "OLD-0001", expiry_date: "2024-01-31", quantity: 20 }] };
  const r = buildUseDraft({ question: "I've taken one adrenaline from room D62" }, { items: [old], now: new Date(2026, 9, 8) });
  assert.match(r.proposal.lines.join("\n"), /past its expiry date/);
});

t("using stock takes from the chosen batch first, then the soonest expiring", () => {
  assert.equal(useFromBatches(adrenaline, 1).allocations[0].batch_number, "AB-1234821", "the default is the soonest-expiring");
  const chosen = useFromBatches(adrenaline, 1, { prefer: "cd-9904821" });
  assert.deepEqual(chosen.allocations, [{ batch_number: "CD-9904821", expiry_date: "2028-01-31", quantity: 1 }]);
  assert.equal(chosen.batches.find((b) => b.batch_number === "CD-9904821").quantity, 7);
  assert.equal(chosen.batches.find((b) => b.batch_number === "AB-1234821").quantity, 12);
  const over = useFromBatches(adrenaline, 10, { prefer: "CD-9904821" });
  assert.equal(over.allocations.reduce((s, a) => s + a.quantity, 0), 10);
  assert.equal(over.allocations[0].batch_number, "CD-9904821");
  assert.equal(over.allocations[0].quantity, 8, "all of the chosen batch first");
  assert.equal(over.allocations[1].batch_number, "AB-1234821");
  assert.equal(currentBatches({ current_stock: 5, batch_number: "X" }).length, 1);
});

console.log(`\n${n} passed`);
