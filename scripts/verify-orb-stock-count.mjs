import assert from "node:assert/strict";
import { buildStockCountDraft, extractCount, looksLikeCountItems, looksLikeStockCount, mergeCountSentence, parseCountItems, parseCountPiece } from "../src/ai/stock/stockCount.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const gloves = { id: "gl", name: "Nitrile gloves", strength: "", form: "medium", site: "Main Surgery", location: "Store", current_stock: 40, locations: [{ locationId: "room-nr", locationName: "Nurses Room", locationType: "space", quantity: 15 }] };
const syringes = { id: "sy", name: "Syringes", strength: "5ml", form: "", site: "Main Surgery", location: "Store", current_stock: 100, locations: [{ locationId: "room-nr", locationName: "Nurses Room", locationType: "space", quantity: 40 }] };
const tape = { id: "tp", name: "Micropore tape", strength: "", form: "", site: "Main Surgery", location: "Store", current_stock: 8, locations: [{ locationId: "room-nr", locationName: "Nurses Room", locationType: "space", quantity: 8 }] };
const adrenaline = { id: "adr", name: "Adrenaline", strength: "1mg/ml", form: "ampoule", site: "Main Surgery", location: "Store", current_stock: 5, locations: [{ locationId: "kit:anaphylaxis_boxes:b3", locationName: "Anaphylaxis Box 3", locationType: "kit", quantity: 2 }] };
const items = [gloves, syringes, tape, adrenaline];
const kits = [{ collection: "anaphylaxis_boxes", kit: { id: "b3", name: "Anaphylaxis Box 3" } }];

t("a count sentence gives the place and what was counted", () => {
  assert.deepEqual(extractCount("count the nurses room: gloves 12, syringes 40"), { place: "nurses room", rest: "gloves 12, syringes 40" });
  assert.deepEqual(extractCount("I've counted the store cupboard - gloves 12"), { place: "store cupboard", rest: "gloves 12" });
  assert.deepEqual(extractCount("stock count for anaphylaxis box 3, adrenaline 2"), { place: "anaphylaxis box 3", rest: "adrenaline 2" });
  assert.deepEqual(extractCount("count the nurses room"), { place: "nurses room", rest: "" });
  assert.deepEqual(extractCount("in the nurses room there are 12 gloves and 40 syringes"), { place: "nurses room", rest: "12 gloves and 40 syringes" });
  assert.deepEqual(extractCount("we're counting the nurses room gloves 12 syringes 40"), { place: "nurses room", rest: "gloves 12 syringes 40" });
  assert.equal(extractCount("how many gloves do we have"), null);
  assert.equal(extractCount("what is the count of gloves"), null);
  assert.ok(looksLikeStockCount("Count the nurses room"));
  assert.ok(!looksLikeStockCount("I've taken two gloves"));
});

t("each counted product is read, in any of the ways it's said", () => {
  assert.deepEqual(parseCountPiece("gloves 12"), { item: "gloves", counted: 12 });
  assert.deepEqual(parseCountPiece("12 gloves"), { item: "gloves", counted: 12 });
  assert.deepEqual(parseCountPiece("gloves: 12"), { item: "gloves", counted: 12 });
  assert.deepEqual(parseCountPiece("gloves are twelve"), { item: "gloves", counted: 12 });
  assert.deepEqual(parseCountPiece("no gloves"), { item: "gloves", counted: 0 });
  assert.deepEqual(parseCountPiece("gloves none"), { item: "gloves", counted: 0 });
  assert.deepEqual(parseCountItems("gloves 12, syringes 40 and micropore tape 6").map((x) => [x.item, x.counted]), [["gloves", 12], ["syringes", 40], ["micropore tape", 6]]);
  assert.equal(parseCountPiece("where is the tape"), null);
});

t("the card shows counted against recorded, and changes nothing yet", () => {
  const r = buildStockCountDraft({ question: "count the nurses room: gloves 12, syringes 40" }, { items, kits });
  assert.ok(r.proposal, r.text);
  assert.equal(r.proposal.kind, "stock-count");
  assert.equal(r.proposal.requiredCapability, "inventory.write");
  const text = r.proposal.lines.join("\n");
  assert.match(text, /Nitrile gloves medium: counted 12, recorded 15 · 3 fewer/);
  assert.match(text, /Syringes 5ml: counted 40, recorded 40 · matches/);
  assert.match(text, /Recorded here but not counted yet \(left as they are\): Micropore tape/);
  assert.match(r.text, /1 figure will change/);
  assert.match(r.text, /Nothing has been changed yet/);
  assert.deepEqual(r.proposal.params.lines.map((l) => [l.itemId, l.counted, l.recorded, l.locationId]), [["gl", 12, 15, "room-nr"], ["sy", 40, 40, "room-nr"]]);
  assert.ok(r.pending, "more items can be added to it");
});

t("a count with no items yet asks for them, and the next answer builds the card", () => {
  const first = buildStockCountDraft({ question: "count the nurses room" }, { items, kits });
  assert.equal(first.proposal, undefined);
  assert.equal(first.pending, true);
  assert.match(first.text, /Counting Nurses Room/);
  assert.ok(looksLikeCountItems("gloves 12"));
  assert.ok(looksLikeCountItems("gloves 12 and syringes 40"));
  assert.ok(!looksLikeCountItems("where are the gloves"));
  assert.ok(!looksLikeCountItems("how many gloves 12"));
  const s1 = mergeCountSentence("count the nurses room", "gloves 12");
  assert.equal(s1, "count the nurses room: gloves 12");
  const s2 = mergeCountSentence(s1, "syringes 38");
  assert.equal(s2, "count the nurses room: gloves 12, syringes 38");
  const card = buildStockCountDraft({ question: s2 }, { items, kits });
  assert.equal(card.proposal.params.lines.length, 2);
  assert.match(card.proposal.lines.join("\n"), /Syringes 5ml: counted 38, recorded 40 · 2 fewer/);
});

t("the last figure said for a product wins, and big differences are flagged", () => {
  const r = buildStockCountDraft({ question: "count the nurses room: gloves 12, gloves 3" }, { items, kits });
  assert.equal(r.proposal.params.lines.length, 1);
  assert.equal(r.proposal.params.lines[0].counted, 3);
  assert.match(r.proposal.lines.join("\n"), /Check these big differences: Nitrile gloves medium/);
});

t("the main store and a kit are counted too", () => {
  const main = buildStockCountDraft({ question: "count the store cupboard: gloves 30" }, { items, kits });
  assert.ok(main.proposal, main.text);
  assert.deepEqual([main.proposal.params.lines[0].locationId, main.proposal.params.lines[0].recorded], [null, 25]);
  const kit = buildStockCountDraft({ question: "count anaphylaxis box 3: adrenaline 1" }, { items, kits });
  assert.ok(kit.proposal, kit.text);
  assert.deepEqual([kit.proposal.params.lines[0].locationId, kit.proposal.params.lines[0].locationType, kit.proposal.params.lines[0].recorded], ["kit:anaphylaxis_boxes:b3", "kit", 2]);
});

t("an unknown place is asked about, an unknown product is left out and said so", () => {
  const nowhere = buildStockCountDraft({ question: "count the moon base: gloves 12" }, { items, kits });
  assert.equal(nowhere.proposal, undefined);
  assert.match(nowhere.text, /don't know a place called “moon base”/);
  assert.ok(nowhere.followUps.length > 0);
  const partly = buildStockCountDraft({ question: "count the nurses room: gloves 12, widgets 5" }, { items, kits });
  assert.equal(partly.proposal.params.lines.length, 1);
  assert.match(partly.proposal.lines.join("\n"), /Not recognised, so not counted: widgets/);
  const allBad = buildStockCountDraft({ question: "count the nurses room: widgets 5" }, { items, kits });
  assert.equal(allBad.proposal, undefined);
  assert.equal(allBad.pending, true);
});

console.log(`\n${n} passed`);
