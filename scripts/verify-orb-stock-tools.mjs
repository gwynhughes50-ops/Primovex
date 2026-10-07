// Covers what the Orb says and proposes for stock requests (src/ai/stock/stockTools.js) and the
// confirm-before-anything-changes proposals (src/orb/actionProposals.js).
import assert from "node:assert/strict";
import { buildLocateResult, buildReorderDraft, buildTeamDraft } from "../src/ai/stock/stockTools.js";
import { PROPOSAL_TTL_MS, createProposal, proposalProblem } from "../src/orb/actionProposals.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const items = [
  { id: "eb", name: "BD Eclipse Needle (Blue)", current_stock: 120, site: "Main", location: "Store room", min_stock: 20, order_quantity: 4, preferred_supplier_name: "Medisupply", locations: [{ locationId: "kit:emergency_assets:trolley", locationName: "Emergency Trolley", locationType: "kit", quantity: 10 }] },
  { id: "eo", name: "BD Eclipse Needle (Orange)", current_stock: 80 },
  { id: "mg", name: "BD Microlance Needle 21G (Green)", current_stock: 60 },
  { id: "ad", name: "Adrenaline", strength: "1mg/1ml", form: "Ampoule", current_stock: 12, site: "Main", location: "Drug cupboard", locations: [
    { locationId: "kit:anaphylaxis_boxes:box_3", locationName: "Anaphylaxis Box 3", locationType: "kit", quantity: 2 },
    { locationId: "kit:anaphylaxis_boxes:box_1", locationName: "Anaphylaxis Box 1", locationType: "kit", quantity: 2 },
  ] },
  { id: "ep", name: "EpiPen Adrenaline Auto-injector", strength: "300mcg", current_stock: 4 },
  { id: "cp", name: "Chlorphenamine", strength: "10mg/1ml", form: "Ampoule", current_stock: 8, locations: [{ locationId: "kit:anaphylaxis_boxes:box_3", locationName: "Anaphylaxis Box 3", locationType: "kit", quantity: 1 }] },
  { id: "gl", name: "Nitrile Gloves (Medium)", current_stock: 0 },
];
const kits = [
  { collection: "anaphylaxis_boxes", kit: { id: "box_3", name: "Anaphylaxis Box 3", items: [{ name: "Adrenaline 1mg/1ml", stock_item_id: "ad" }, { name: "Chlorphenamine", stock_item_id: "cp" }, { name: "Hydrocortisone 100mg", stock_item_id: "hc" }] } },
  { collection: "anaphylaxis_boxes", kit: { id: "box_13", name: "Anaphylaxis Box 13" } },
  { collection: "anaphylaxis_boxes", kit: { id: "box_1", name: "Anaphylaxis Box 1" } },
  { collection: "emergency_assets", kit: { id: "trolley", name: "Emergency Trolley" } },
];
const roleNames = ["System Admin", "HCA", "Nurse", "Reception", "Practice Manager", "User"];
const data = { items, kits };

// ---- where is it / how many

t("how many of something are at a place, in plain words", () => {
  const r = buildLocateResult({ question: "How many adrenaline are in anaphylaxis box 3?" }, data);
  // two products fit "adrenaline": it asks which, never guesses
  assert.match(r.text, /More than one product fits “adrenaline”/);
  assert.ok(r.followUps.some((q) => /Adrenaline 1mg\/1ml Ampoule are in anaphylaxis box 3/.test(q)));
  const exact = buildLocateResult({ question: "how many Adrenaline 1mg/1ml ampoule are in anaphylaxis box 3" }, data);
  assert.equal(exact.text, "2 units of Adrenaline 1mg/1ml Ampoule are recorded in Anaphylaxis Box 3. 12 units in total across the practice.");
});

t("none at a place says where it is instead", () => {
  const r = buildLocateResult({ item: "Adrenaline 1mg/1ml ampoule", place: "box 13" }, data);
  assert.match(r.text, /There is no Adrenaline 1mg\/1ml Ampoule recorded in Anaphylaxis Box 13\. 12 units are recorded elsewhere: 8 in Main - Drug cupboard, 2 in Anaphylaxis Box 3 and 2 in Anaphylaxis Box 1\./);
});

t("where an item is kept lists every place with its quantity", () => {
  const r = buildLocateResult({ question: "where are the blue needles" }, data);
  assert.match(r.text, /^BD Eclipse Needle \(Blue\): 120 units in total\.\nKept 110 in Main - Store room and 10 in Emergency Trolley\./);
  assert.deepEqual(r.followUps, ["what's in Emergency Trolley"]);
  assert.match(buildLocateResult({ question: "where is the photocopier toner" }, data).text, /couldn't find any stock matching/);
});

t("what is in a box, and what it should hold but has no stock recorded for", () => {
  const r = buildLocateResult({ question: "what's in box 3" }, data);
  assert.match(r.text, /^Anaphylaxis Box 3 holds 2 products:\n• Adrenaline 1mg\/1ml Ampoule: 2\n• Chlorphenamine 10mg\/1ml Ampoule: 1\nExpected there but with no stock recorded: Hydrocortisone 100mg\./);
  assert.match(r.followUps[0], /^message the HCA team that Anaphylaxis Box 3 is missing Hydrocortisone 100mg$/);
  assert.match(buildLocateResult({ question: "what's in box 13" }, data).text, /Nothing is recorded in Anaphylaxis Box 13 yet/);
});

t("a place that does not exist, or fits several, is asked about", () => {
  assert.match(buildLocateResult({ question: "what's in box 7" }, data).text, /couldn't find a place called “box 7”\.\nPlaces I know about include/);
  const many = buildLocateResult({ question: "what's in anaphylaxis box" }, data);
  assert.match(many.text, /More than one place fits/);
  assert.ok(many.followUps.length >= 2);
});

t("the store room lists what is held there", () => {
  const r = buildLocateResult({ question: "what's in the store room" }, data);
  assert.match(r.text, /^The main store holds \d+ products?\./);
});

// ---- a message to a team

t("a message to a team becomes a proposal, and nothing is sent", () => {
  const r = buildTeamDraft({ question: "tell the HCA team BD blue needles need ordering" }, { roleNames, items });
  assert.equal(r.proposal.kind, "team-message");
  assert.equal(r.proposal.status, "proposed");
  assert.deepEqual(r.proposal.params, { role: "HCA", text: "BD blue needles need ordering", actionUrl: "/inventory" });
  assert.deepEqual(r.proposal.lines, ["To: everyone with the role HCA", "Message: “BD blue needles need ordering”"]);
  assert.equal(r.proposal.requiredCapability, "inventory.write");
  assert.match(r.text, /Nothing has been sent yet\./);
  assert.deepEqual(r.followUps, ["reorder BD Eclipse Needle (Blue)"]); // it is about ordering, so the reorder is offered too
});

t("the language assistant's parts work the same way", () => {
  const r = buildTeamDraft({ team: "nurses", message: "fridge two needs checking." }, { roleNames, items });
  assert.deepEqual([r.proposal.params.role, r.proposal.params.text], ["Nurse", "Fridge two needs checking"]);
});

t("an unknown team, a missing message, patient detail or a long message is not proposed", () => {
  const unknown = buildTeamDraft({ question: "tell the wizards hello there" }, { roleNames, items });
  assert.ok(!unknown.proposal);
  assert.match(unknown.text, /couldn't tell which team/);
  assert.ok(!buildTeamDraft({ question: "tell the HCA team" }, { roleNames, items }).proposal);
  const id = buildTeamDraft({ question: "tell the HCA team NHS 943 476 5919 needs a call" }, { roleNames, items });
  assert.ok(!id.proposal);
  assert.match(id.text, /don't put patient details/);
  assert.ok(!buildTeamDraft({ team: "HCA", message: "x".repeat(301) }, { roleNames, items }).proposal);
  assert.ok(!buildTeamDraft({ question: "how many needles" }, { roleNames, items }).proposal);
});

// ---- a reorder, or something missing

t("a reorder becomes a proposal with the real product, quantity, stock and supplier", () => {
  const r = buildReorderDraft({ question: "BD blue needles need ordering" }, { items, roleNames });
  assert.equal(r.proposal.kind, "reorder");
  assert.deepEqual(r.proposal.params, { itemId: "eb", itemLabel: "BD Eclipse Needle (Blue)", quantity: 4 }); // the product's usual order quantity
  assert.deepEqual(r.proposal.lines, ["Product: BD Eclipse Needle (Blue)", "Quantity to order: 4", "In stock now: 120 (minimum 20)", "Supplier: Medisupply"]);
  assert.match(r.text, /nothing is ordered from a supplier until someone approves it/);
  assert.equal(buildReorderDraft({ question: "reorder 9 blue needles" }, { items, roleNames }).proposal.params.quantity, 9);
});

t("an existing pending request is not duplicated", () => {
  const r = buildReorderDraft({ question: "order more blue needles" }, { items, roleNames, pending: [{ item_id: "eb", status: "pending", requested_qty: 3 }] });
  assert.ok(!r.proposal);
  assert.match(r.text, /already a pending reorder request for BD Eclipse Needle \(Blue\) \(3 units\)/);
  assert.ok(buildReorderDraft({ question: "order more blue needles" }, { items, roleNames, pending: [{ item_id: "eb", status: "ordered" }] }).proposal);
});

t("a product that fits several, or none, is asked about and nothing is created", () => {
  const many = buildReorderDraft({ question: "reorder bd needles" }, { items, roleNames });
  assert.ok(!many.proposal && many.ambiguous);
  assert.ok(many.followUps.every((q) => q.startsWith("reorder ")));
  const none = buildReorderDraft({ question: "reorder photocopier toner" }, { items, roleNames });
  assert.ok(!none.proposal);
  assert.match(none.text, /haven't raised anything/);
  assert.ok(!buildReorderDraft({ question: "which stock needs ordering" }, { items, roleNames }).proposal);
});

t("something missing from a box offers a reorder or telling a team, and creates nothing itself", () => {
  const r = buildReorderDraft({ question: "box 3 is missing a chlorphenamine" }, { items, roleNames, kits });
  assert.ok(!r.proposal);
  assert.match(r.text, /Anaphylaxis Box 3 is missing Chlorphenamine 10mg\/1ml Ampoule\. I can raise a reorder for it, or tell a team/);
  assert.deepEqual(r.followUps, ["reorder Chlorphenamine 10mg/1ml Ampoule", "tell the HCA team Anaphylaxis Box 3 is missing Chlorphenamine 10mg/1ml Ampoule", "tell the Nurse team Anaphylaxis Box 3 is missing Chlorphenamine 10mg/1ml Ampoule"].slice(0, 3));
});

t("every suggested follow-up for a message or reorder is itself understood", () => {
  const gap = buildReorderDraft({ question: "we are out of chlorphenamine" }, { items, roleNames, kits });
  const follow = buildTeamDraft({ question: gap.proposal ? "" : "tell the HCA team Chlorphenamine needs ordering" }, { roleNames, items });
  assert.equal(follow.proposal.params.role, "HCA");
});

// ---- the confirm card's rules

t("a proposal can be run once, by someone with permission, before it expires", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const p = createProposal({ kind: "reorder", title: "x", requiredCapability: "inventory.write", now });
  assert.equal(p.status, "proposed");
  assert.equal(Date.parse(p.expiresAt) - now, PROPOSAL_TTL_MS);
  assert.equal(proposalProblem(p, { capabilities: ["inventory.write"], now: now + 60_000 }), "");
  assert.match(proposalProblem(p, { capabilities: ["inventory.read"], now }), /don't have permission/);
  assert.match(proposalProblem(p, { capabilities: ["inventory.write"], now: now + PROPOSAL_TTL_MS + 1 }), /prepared a while ago/);
  assert.equal(proposalProblem(p, { capabilities: ["*"], now }), "");
  for (const [status, re] of [["working", /already being done/], ["done", /already been done/], ["cancelled", /cancelled/], ["failed", /didn't work/]]) {
    assert.match(proposalProblem({ ...p, status }, { capabilities: ["*"], now }), re);
  }
  assert.match(proposalProblem(null), /nothing to confirm/);
});

t("two proposals never share an id", () => {
  const ids = new Set(Array.from({ length: 50 }, () => createProposal({ kind: "x", title: "x" }).id));
  assert.equal(ids.size, 50);
});

console.log(`\n${n} passed`);
