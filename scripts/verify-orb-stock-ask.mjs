// Covers how the Orb understands stock requests (src/ai/stock/stockAsk.js).
import assert from "node:assert/strict";
import {
  buildPlaces, itemLabel, itemPlacements, kitGaps, looksIdentifying, parseLocateQuestion, parseStockRequest, parseTeamMessage,
  placeContents, rankStockItems, resolvePlace, resolveStockItem, resolveTeam,
} from "../src/ai/stock/stockAsk.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const items = [
  { id: "eb", name: "BD Eclipse Needle (Blue)", current_stock: 120, site: "Main", location: "Store room", locations: [{ locationId: "kit:emergency_assets:trolley", locationName: "Emergency Trolley", locationType: "kit", quantity: 10 }] },
  { id: "eo", name: "BD Eclipse Needle (Orange)", current_stock: 80 },
  { id: "mg", name: "BD Microlance Needle 21G (Green)", current_stock: 60 },
  { id: "ad", name: "Adrenaline", strength: "1mg/1ml", form: "Ampoule", current_stock: 12, site: "Main", location: "Drug cupboard", locations: [
    { locationId: "kit:anaphylaxis_boxes:box_3", locationName: "Anaphylaxis Box 3", locationType: "kit", quantity: 2 },
    { locationId: "kit:anaphylaxis_boxes:box_1", locationName: "Anaphylaxis Box 1", locationType: "kit", quantity: 2 },
  ] },
  { id: "ep", name: "EpiPen Adrenaline Auto-injector", strength: "300mcg", current_stock: 4 },
  { id: "cp", name: "Chlorphenamine", strength: "10mg/1ml", form: "Ampoule", current_stock: 8, locations: [{ locationId: "kit:anaphylaxis_boxes:box_3", locationName: "Anaphylaxis Box 3", locationType: "kit", quantity: 1 }] },
  { id: "old", name: "BD Eclipse Needle (Blue)", archived_at: "2026-01-01", current_stock: 0 },
];
const kits = [
  { collection: "anaphylaxis_boxes", kit: { id: "box_3", name: "Anaphylaxis Box 3", items: [{ name: "Adrenaline 1mg/1ml", stock_item_id: "ad" }, { name: "Chlorphenamine", stock_item_id: "cp" }, { name: "Hydrocortisone 100mg", stock_item_id: "hc" }] } },
  { collection: "anaphylaxis_boxes", kit: { id: "box_13", name: "Anaphylaxis Box 13" } },
  { collection: "anaphylaxis_boxes", kit: { id: "box_1", name: "Anaphylaxis Box 1" } },
  { collection: "emergency_assets", kit: { id: "trolley", name: "Emergency Trolley" } },
];
const places = buildPlaces({ items, kits });
const roles = ["HCA", "Nurse", "Reception", "Practice Manager", "Medical Secretary", "User", "Partner"];

t("a product is found from how it is said, and the exact one wins", () => {
  assert.equal(resolveStockItem("BD needles blue", items).item.id, "eb");
  assert.equal(resolveStockItem("blue needles", items).item.id, "eb");
  assert.equal(resolveStockItem("chlorphenamine", items).item.id, "cp");
  assert.equal(resolveStockItem("the green needles", items).item.id, "mg");
});

t("when several products fit equally, it asks, and never picks one", () => {
  const r = resolveStockItem("BD needles", items);
  assert.equal(r.status, "many");
  assert.ok(r.items.length >= 2 && r.items.length <= 4);
  assert.equal(resolveStockItem("adrenaline", items).status, "many"); // the ampoule or the EpiPen
});

t("nothing close is no match, and archived products are never matched", () => {
  assert.equal(resolveStockItem("photocopier toner", items).status, "none");
  assert.equal(resolveStockItem("", items).status, "none");
  assert.ok(!rankStockItems("eclipse needle blue", items).some((r) => r.item.id === "old"));
});

t("a product is labelled with its name, strength and form", () => {
  assert.equal(itemLabel(items[3]), "Adrenaline 1mg/1ml Ampoule");
  assert.equal(itemLabel({}), "Unnamed item");
});

t("places come from kits and from wherever stock has been moved", () => {
  assert.deepEqual(places.map((p) => p.name).sort(), ["Anaphylaxis Box 1", "Anaphylaxis Box 13", "Anaphylaxis Box 3", "Emergency Trolley"]);
});

t("a place is matched by every word said, so box 3 is never box 13", () => {
  assert.equal(resolvePlace("box 3", places).place.name, "Anaphylaxis Box 3");
  assert.equal(resolvePlace("anaphylaxis box 3", places).place.name, "Anaphylaxis Box 3");
  assert.equal(resolvePlace("box 13", places).place.name, "Anaphylaxis Box 13");
  assert.equal(resolvePlace("box", places).status, "many");
  assert.equal(resolvePlace("box 7", places).status, "none");
  assert.equal(resolvePlace("the store room", places).status, "main");
  assert.equal(resolvePlace("trolley", places).place.name, "Emergency Trolley");
});

t("where an item is: the main store plus each place it has been moved to", () => {
  const rows = itemPlacements(items[3]);
  assert.deepEqual(rows.map((r) => [r.name, r.qty]), [["Main - Drug cupboard", 8], ["Anaphylaxis Box 3", 2], ["Anaphylaxis Box 1", 2]]);
  assert.deepEqual(itemPlacements({ id: "x", name: "X", current_stock: 5 }).map((r) => [r.name, r.qty]), [["Main store", 5]]);
  assert.deepEqual(itemPlacements({ id: "x", name: "X", current_stock: 0 }), []);
});

t("what is at a place, and what a kit should hold that has no stock recorded", () => {
  const box3 = places.find((p) => p.name === "Anaphylaxis Box 3");
  assert.deepEqual(placeContents(box3, items).map((r) => [r.label, r.qty]), [["Adrenaline 1mg/1ml Ampoule", 2], ["Chlorphenamine 10mg/1ml Ampoule", 1]]);
  assert.deepEqual(kitGaps(box3, items), ["Hydrocortisone 100mg"]);
  assert.deepEqual(kitGaps(places.find((p) => p.name === "Anaphylaxis Box 13"), items), []);
});

t("questions about location are read into what they ask", () => {
  assert.deepEqual(parseLocateQuestion("How many adrenaline are in anaphylaxis box 3?"), { kind: "howmany", item: "adrenaline", place: "anaphylaxis box 3" });
  assert.deepEqual(parseLocateQuestion("how many blue needles do we have in the store room"), { kind: "howmany", item: "blue needles", place: "store room" });
  assert.deepEqual(parseLocateQuestion("what's in box 3"), { kind: "contents", item: null, place: "box 3" });
  assert.deepEqual(parseLocateQuestion("what do we have in the emergency trolley?"), { kind: "contents", item: null, place: "emergency trolley" });
  assert.deepEqual(parseLocateQuestion("where do we keep the green needles"), { kind: "where", item: "green needles", place: null });
  assert.deepEqual(parseLocateQuestion("where are the BD blue needles?"), { kind: "where", item: "BD blue needles", place: null });
  assert.equal(parseLocateQuestion("how are you"), null);
  assert.equal(parseLocateQuestion("what is low on stock"), null);
});

t("a team is found by role, however it is said", () => {
  assert.equal(resolveTeam("the HCA team", roles), "HCA");
  assert.equal(resolveTeam("HCAs", roles), "HCA");
  assert.equal(resolveTeam("healthcare assistants", roles), "HCA");
  assert.equal(resolveTeam("the nurses", roles), "Nurse");
  assert.equal(resolveTeam("reception team", roles), "Reception");
  assert.equal(resolveTeam("practice managers", roles), "Practice Manager");
  assert.equal(resolveTeam("secretaries", roles), "Medical Secretary");
  assert.equal(resolveTeam("wizards", roles), null);
  assert.equal(resolveTeam("stock controllers", roles), null); // that role doesn't exist here
  assert.equal(resolveTeam("", roles), null);
});

t("a message to a team is split into who and what", () => {
  assert.deepEqual(parseTeamMessage("tell the HCA team BD blue needles need ordering", roles), { team: "HCA", message: "BD blue needles need ordering" });
  assert.deepEqual(parseTeamMessage("Message the nurses that the fridge in room 3 is warm", roles), { team: "Nurse", message: "The fridge in room 3 is warm" });
  assert.deepEqual(parseTeamMessage("let reception know the phones are down.", roles), { team: "Reception", message: "The phones are down" });
  assert.deepEqual(parseTeamMessage("send a message to the practice managers: stock check due", roles), { team: "Practice Manager", message: "Stock check due" });
  assert.deepEqual(parseTeamMessage("tell the HCA team", roles), { team: "HCA", message: "" });
  const none = parseTeamMessage("tell the wizards hello there", roles);
  assert.equal(none.team, null);
  assert.equal(parseTeamMessage("how many needles", roles), null);
});

t("anything that looks like a patient identifier is refused", () => {
  ["call 07700 900123", "NHS 943 476 5919", "mail me@example.org", "born 03/04/1975", "EMIS 1234567"].forEach((s) => assert.ok(looksIdentifying(s), s));
  ["BD blue needles need ordering", "box 3 is missing 2 ampoules", "fridge 2 is at 9.1 degrees"].forEach((s) => assert.ok(!looksIdentifying(s), s));
});

t("reorder and gap requests are read", () => {
  assert.deepEqual(parseStockRequest("BD blue needles need ordering"), { mode: "reorder", item: "BD blue needles", quantity: null });
  assert.deepEqual(parseStockRequest("reorder 5 boxes of green needles"), { mode: "reorder", item: "green needles", quantity: 5 });
  assert.deepEqual(parseStockRequest("order more adrenaline"), { mode: "reorder", item: "adrenaline", quantity: null });
  assert.equal(parseStockRequest("we need more gloves").item, "gloves");
  assert.deepEqual(parseStockRequest("box 3 is missing a chlorphenamine"), { mode: "gap", item: "chlorphenamine", place: "box 3" });
  assert.deepEqual(parseStockRequest("we are out of green needles"), { mode: "gap", item: "green needles", place: null });
  assert.deepEqual(parseStockRequest("the saline has run out in room 2"), { mode: "gap", item: "saline", place: "room 2" });
});

t("questions are never mistaken for requests", () => {
  ["which stock needs ordering", "what is low", "how many needles do we have", "is anything out of stock", "show me what needs ordering", "do we need to order gloves"].forEach((q) => assert.equal(parseStockRequest(q), null, q));
});

console.log(`\n${n} passed`);
