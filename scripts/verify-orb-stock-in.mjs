import assert from "node:assert/strict";
import { buildStockInDraft, extractInRest, looksLikeInDetails, looksLikeStockIn, mergeInSentence, parseExpiryDate, parseInItems } from "../src/ai/stock/stockIn.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date("2026-10-09T10:00:00");

const chlor = { id: "chl", name: "Chlorphenamine", strength: "10mg/1ml", form: "ampoule", site: "Main Surgery", location: "Store", current_stock: 12, locations: [], batches: [{ batch_number: "CH-5521", expiry_date: "2027-06-30", quantity: 12 }] };
const gauze = { id: "gz", name: "Gauze swabs", strength: "", form: "", site: "Main Surgery", location: "Store", current_stock: 30, locations: [] };
const adrenaline = { id: "adr", name: "Adrenaline", strength: "1mg/ml", form: "ampoule", site: "Main Surgery", location: "Store", current_stock: 5, locations: [{ locationId: "kit:anaphylaxis_boxes:b3", locationName: "Anaphylaxis Box 3", locationType: "kit", quantity: 2 }], batches: [{ batch_number: "AD-100", expiry_date: "2027-01-31", quantity: 5 }] };
const items = [chlor, gauze, adrenaline];
const kits = [{ collection: "anaphylaxis_boxes", kit: { id: "b3", name: "Anaphylaxis Box 3" } }];

t("dates are read the way people say them", () => {
  assert.equal(parseExpiryDate("March 2028"), "2028-03-31");
  assert.equal(parseExpiryDate("31/03/2028"), "2028-03-31");
  assert.equal(parseExpiryDate("31 March 2028"), "2028-03-31");
  assert.equal(parseExpiryDate("the 5th of June 2027"), "2027-06-05");
  assert.equal(parseExpiryDate("03/28"), "2028-03-31");
  assert.equal(parseExpiryDate("2028-03-31"), "2028-03-31");
  assert.equal(parseExpiryDate("Feb 27"), "2027-02-28");
  assert.equal(parseExpiryDate("soon"), "");
});

t("booking stock in is told apart from everything else", () => {
  for (const s of ["I've received two boxes of gauze", "we've had a delivery of 20 chlorphenamine ampoules", "I have just booked in 5 salbutamol", "the delivery has arrived: 10 gauze swabs", "book in 3 boxes of gauze", "please add 10 chlorphenamine to stock", "I've taken delivery of 4 boxes of gloves"]) {
    assert.ok(extractInRest(s), s);
    assert.ok(looksLikeStockIn(s), s);
  }
  for (const s of ["I've received an email", "we received a call from the surgery", "have we received the order", "how many gauze do we have", "I've taken two gauze from the store", "add a new user", "when did the delivery arrive"]) {
    assert.ok(!looksLikeStockIn(s), s);
  }
});

t("quantity, product, batch, expiry and place are picked out", () => {
  const [a] = parseInItems("I've received 20 chlorphenamine ampoules, batch AB-4471, expires March 2028, into the store cupboard");
  assert.deepEqual([a.quantity, a.item.toLowerCase(), a.batch, a.expiry, a.place], [20, "chlorphenamine", "AB-4471", "2028-03-31", "store cupboard"]);
  const [b] = parseInItems("we've had a delivery of two boxes of gauze swabs batch 9921 expiry date 31/03/2029");
  assert.deepEqual([b.quantity, b.item.toLowerCase(), b.batch, b.expiry], [2, "gauze swabs", "9921", "2029-03-31"]);
  const [c] = parseInItems("I've received 5 gauze swabs, no batch, no expiry");
  assert.equal(c.noBatch, true);
  assert.equal(c.noExpiry, true);
  assert.equal(c.batch, null);
});

t("several products in one delivery keep their own batch and expiry", () => {
  const s = parseInItems("I've received 10 chlorphenamine batch 77 expires June 2028 and 4 gauze swabs, no batch, no expiry");
  assert.equal(s.length, 2);
  assert.deepEqual([s[0].quantity, s[0].batch, s[0].expiry], [10, "77", "2028-06-30"]);
  assert.deepEqual([s[1].quantity, s[1].noBatch, s[1].noExpiry], [4, true, true]);
});

t("everything given makes one card, and nothing changes until confirmed", () => {
  const r = buildStockInDraft({ question: "I've received 20 chlorphenamine ampoules, batch AB-4471, expires March 2028" }, { items, kits, now });
  assert.ok(r.proposal, r.text);
  assert.equal(r.proposal.kind, "stock-in");
  assert.equal(r.proposal.requiredCapability, "inventory.write");
  assert.deepEqual(r.proposal.params.lines[0], { itemId: "chl", itemLabel: "Chlorphenamine 10mg/1ml ampoule", quantity: 20, locationId: null, locationName: "Main Surgery - Store", locationType: "space", batchNumber: "AB-4471", expiryDate: "2028-03-31" });
  assert.match(r.proposal.lines.join(" | "), /20 × Chlorphenamine .* · batch AB-4471 · expires 31\/03\/2028 · 32 in stock after/);
  assert.match(r.text, /Nothing has been changed yet/);
});

t("a product that has batches and expiry dates must have them on the delivery: the Orb asks", () => {
  const r = buildStockInDraft({ question: "I've received 20 chlorphenamine ampoules" }, { items, kits, now });
  assert.equal(r.proposal, undefined);
  assert.equal(r.pending, true);
  assert.match(r.text, /what's the batch number and expiry date/);
  // a product that never had either needs neither
  const plain = buildStockInDraft({ question: "I've received 6 boxes of gauze swabs" }, { items, kits, now });
  assert.ok(plain.proposal, plain.text);
  assert.equal(plain.proposal.params.lines[0].batchNumber, "");
});

t("the answer to that question is joined to the delivery, and the card appears", () => {
  assert.ok(looksLikeInDetails("batch AB-4471, expires March 2028"));
  assert.ok(looksLikeInDetails("no batch number"));
  assert.ok(looksLikeInDetails("March 2028"));
  assert.ok(looksLikeInDetails("into the anaphylaxis box"));
  assert.ok(!looksLikeInDetails("how many gauze do we have"));
  assert.ok(!looksLikeInDetails("where is the chlorphenamine"));
  const first = "I've received 20 chlorphenamine ampoules";
  const merged = mergeInSentence(first, "batch AB-4471, expires March 2028");
  const r = buildStockInDraft({ question: merged }, { items, kits, now });
  assert.ok(r.proposal, r.text);
  assert.equal(r.proposal.params.lines[0].batchNumber, "AB-4471");
  // answered in two goes
  const half = buildStockInDraft({ question: mergeInSentence(first, "batch AB-4471") }, { items, kits, now });
  assert.equal(half.pending, true, "a batch with no expiry date still needs the date");
  const full = buildStockInDraft({ question: mergeInSentence(mergeInSentence(first, "batch AB-4471"), "expires 03/2028") }, { items, kits, now });
  assert.ok(full.proposal, full.text);
  assert.equal(full.proposal.params.lines[0].expiryDate, "2028-03-31");
});

t("a date that has passed or can't be read is refused", () => {
  const past = buildStockInDraft({ question: "I've received 20 chlorphenamine, batch 5, expires March 2025" }, { items, kits, now });
  assert.equal(past.proposal, undefined);
  assert.match(past.text, /already passed/);
  const odd = buildStockInDraft({ question: "I've received 20 chlorphenamine, batch 5, expires soonish" }, { items, kits, now });
  assert.equal(odd.proposal, undefined);
  assert.match(odd.text, /couldn't read “soonish” as a date/);
});

t("a delivery can go into a kit or box that already holds stock", () => {
  const r = buildStockInDraft({ question: "I've received 2 adrenaline batch AD-200 expires May 2028 into anaphylaxis box 3" }, { items, kits, now });
  assert.ok(r.proposal, r.text);
  const line = r.proposal.params.lines[0];
  assert.deepEqual([line.locationId, line.locationName, line.locationType], ["kit:anaphylaxis_boxes:b3", "Anaphylaxis Box 3", "kit"]);
  const nowhere = buildStockInDraft({ question: "I've received 2 gauze swabs into the moon base" }, { items, kits, now });
  assert.equal(nowhere.proposal, undefined);
  assert.match(nowhere.text, /don't know a place called “moon base”/);
});

t("an unknown product is not invented; a near name is offered", () => {
  const none = buildStockInDraft({ question: "I've received 20 widgets" }, { items, kits, now });
  assert.equal(none.proposal, undefined);
  assert.match(none.text, /couldn't find any stock matching “widgets”/);
  const near = buildStockInDraft({ question: "I've received 20 chlorphenamin ampoules batch 1 expires 2028" }, { items, kits, now });
  assert.ok(near.proposal || near.followUps.length, near.text);
});

t("a batch already on file with a different expiry date raises a warning", () => {
  const r = buildStockInDraft({ question: "I've received 5 chlorphenamine, batch CH-5521, expires December 2028" }, { items, kits, now });
  assert.ok(r.proposal);
  assert.match(r.proposal.lines.join("\n"), /Warning: Batch CH-5521 is already recorded with expiry 30\/06\/2027/);
});

t("two products make one card", () => {
  const r = buildStockInDraft({ question: "I've received 10 chlorphenamine batch 77 expires June 2028 and 4 gauze swabs" }, { items, kits, now });
  assert.ok(r.proposal, r.text);
  assert.equal(r.proposal.params.lines.length, 2);
  assert.match(r.proposal.title, /Add 2 items to stock/);
});

console.log(`\n${n} passed`);
