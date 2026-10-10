import assert from "node:assert/strict";
import { NAV_PLACES, getRoleHome, navFor, visibleActions } from "../src/mobile/roleHomes.js";
import { buildAttention } from "../src/mobile/homeAttention.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date("2026-10-10T12:00:00");
const daysFromNow = (d) => { const x = new Date(now); x.setDate(x.getDate() + d); return x; };

const ROLES = ["System Admin", "Practice Manager", "Nurse", "HCA", "Reception", "Caretaker", "Partner", "User", "ReadOnly"];

t("each role gets its own kind of home", () => {
  const ids = Object.fromEntries(ROLES.map((r) => [r, getRoleHome(r, ["*"]).id]));
  assert.deepEqual(ids, { "System Admin": "manager", "Practice Manager": "manager", Nurse: "clinical", HCA: "clinical", Reception: "reception", Caretaker: "caretaker", Partner: "partner", User: "general", ReadOnly: "general" });
});

t("every tile has a key, label, helper and icon; keys are unique within a home; the Orb is never hidden", () => {
  for (const role of ROLES) {
    const home = getRoleHome(role, ["*"]);
    const keys = home.actions.map((a) => a.key);
    assert.equal(new Set(keys).size, keys.length, `${role} has a repeated tile`);
    for (const a of [home.primary, ...home.actions]) {
      assert.ok(a.key && a.label && a.helper && a.Icon, `${role}: ${a.key}`);
    }
  }
});

t("the manager's home has the SARs and Fridge check tiles and the Orb as a slim bar", () => {
  const home = getRoleHome("Practice Manager", ["*"]);
  assert.ok(home.actions.some((a) => a.key === "sars"));
  assert.ok(home.actions.some((a) => a.key === "briefing"));
  assert.equal(home.primary.compact, true);
  assert.ok(home.actions.some((a) => a.key === "fridge-check"));
  assert.equal(home.attention, true);
});

t("the fridge check tile is only for people who may record temperatures (nurse, HCA, manager), and caretaker and reception don't get it", () => {
  assert.ok(visibleActions(getRoleHome("Nurse"), ["temperature.write"]).some((a) => a.key === "fridge-check"));
  assert.ok(!visibleActions(getRoleHome("Nurse"), ["inventory.read"]).some((a) => a.key === "fridge-check"));
  assert.ok(!getRoleHome("Caretaker").actions.some((a) => a.key === "fridge-check"));
  assert.ok(!getRoleHome("Reception").actions.some((a) => a.key === "fridge-check"));
});

t("tiles that need a permission are hidden from people without it", () => {
  const home = getRoleHome("Practice Manager", []);
  const keys = visibleActions(home, ["inventory.read"]).map((a) => a.key);
  assert.ok(!keys.includes("sars") && !keys.includes("concerns"));
  assert.ok(visibleActions(home, ["governance.read"]).some((a) => a.key === "sars"));
  assert.ok(visibleActions(home, ["*"]).some((a) => a.key === "concerns"));
});

t("the clinical home is about taking stock, kits and temperature, not management", () => {
  const home = getRoleHome("HCA", []);
  assert.equal(home.primary.key, "scan-stock");
  const keys = home.actions.map((a) => a.key);
  for (const k of ["orb-voice", "stock", "kits", "temperature", "fridge-check", "issue"]) assert.ok(keys.includes(k), k);
  assert.ok(!keys.includes("sars") && !keys.includes("concerns"));
  assert.equal(home.attention, false);
});

t("caretaker, reception and partner each get what they do", () => {
  assert.equal(getRoleHome("Caretaker").primary.key, "scan-room");
  assert.ok(getRoleHome("Caretaker").actions.some((a) => a.key === "checks"));
  assert.ok(!getRoleHome("Caretaker").actions.some((a) => a.key === "stock"));
  assert.equal(getRoleHome("Reception").primary.key, "issue");
  assert.ok(!getRoleHome("Reception").actions.some((a) => ["stock", "scan-stock", "checks"].includes(a.key)));
  const partner = getRoleHome("Partner", ["governance.read"]);
  assert.deepEqual(visibleActions(partner, ["governance.read"]).slice(0, 3).map((a) => a.key), ["sars", "concerns", "significant-events"]);
  assert.ok(!partner.actions.some((a) => ["stock", "scan-stock"].includes(a.key)));
});

t("the bottom bar is always four places, home first and me last, only places the role uses", () => {
  const expected = { manager: ["home", "stock", "facilities", "me"], clinical: ["home", "stock", "checks", "me"], caretaker: ["home", "facilities", "checks", "me"], reception: ["home", "rooms", "messages", "me"], partner: ["home", "sars", "concerns", "me"] };
  for (const [id, nav] of Object.entries(expected)) {
    const role = { manager: "Practice Manager", clinical: "Nurse", caretaker: "Caretaker", reception: "Reception", partner: "Partner" }[id];
    assert.deepEqual(navFor(getRoleHome(role, ["*"])), nav, id);
  }
  for (const role of ROLES) {
    const nav = navFor(getRoleHome(role, ["*"]));
    assert.equal(nav.length, 4, role);
    assert.equal(nav[0], "home");
    assert.equal(nav[3], "me");
    nav.forEach((k) => assert.ok(NAV_PLACES[k], `${role}: ${k}`));
  }
  assert.deepEqual(navFor({ nav: ["home", "me"] }), ["home", "messages", "rooms", "me"], "a short list is padded");
});

const sar = (status, dueInDays) => ({ status, dueDate: daysFromNow(dueInDays) });
const concern = (status, finalDueInDays, extra = {}) => ({ status, acknowledgedAt: daysFromNow(-5), finalResponseDueAt: daysFromNow(finalDueInDays), ...extra });

t("the attention strip lists what's urgent, most urgent first, each a tap from where it's dealt with", () => {
  const chips = buildAttention({
    sars: [sar("in_progress", -2), sar("assigned", -1), sar("new", 3), sar("completed", -10), sar("new", 20)],
    concerns: [concern("investigation", -4), concern("response", 2), concern("closed", -9)],
    stockAlerts: [{ state: "expired" }, { state: "out" }, { state: "low" }, { state: "low" }, { state: "soon" }],
    messages: 2, now,
  });
  assert.deepEqual(chips.map((c) => [c.key, c.label, c.tone, c.action]), [
    ["sars-overdue", "2 SARs overdue", "critical", "sars"],
    ["concerns-overdue", "1 concern overdue", "critical", "concerns"],
    ["stock-urgent", "2 stock items expired or out", "critical", "stock"],
    ["sars-soon", "1 SAR due this week", "warning", "sars"],
    ["concerns-soon", "1 concern due soon", "warning", "concerns"],
    ["stock-low", "2 running low", "warning", "stock"],
    ["messages", "2 unread messages", "info", "messages"],
  ]);
});

t("a quarantined fridge heads the strip", () => {
  const chips = buildAttention({ fridgeQuarantined: 1, fridgeIncidents: 2, fridgesUnchecked: 1, messages: 1, now });
  assert.deepEqual(chips.map((c) => c.key), ["fridges-quarantined", "fridge-incidents", "fridges-unchecked", "messages"]);
  assert.equal(chips[0].label, "1 fridge quarantined");
  assert.equal(buildAttention({ fridgeQuarantined: 0, now })[0].key, "clear");
});

t("open fridge incidents and fridges not checked today are on the strip", () => {
  const chips = buildAttention({ fridgeIncidents: 1, fridgesUnchecked: 2, now });
  assert.deepEqual(chips.map((c) => [c.key, c.label, c.tone, c.action]), [["fridge-incidents", "1 fridge incident open", "critical", "temperature"], ["fridges-unchecked", "2 fridges not checked today", "warning", "fridge-check"]]);
  assert.equal(buildAttention({ fridgeIncidents: 0, fridgesUnchecked: 0, now })[0].key, "clear");
  assert.equal(buildAttention({ fridgeIncidents: null, fridgesUnchecked: null, now })[0].key, "clear");
});

t("an area the person can't see is left out, and a clear day says so", () => {
  const chips = buildAttention({ sars: null, concerns: null, stockAlerts: [{ state: "low" }], messages: 0, now });
  assert.deepEqual(chips.map((c) => c.key), ["stock-low"]);
  assert.deepEqual(buildAttention({ sars: [], concerns: [], stockAlerts: [], messages: 0, now }), [{ key: "clear", tone: "ok", label: "Nothing urgent right now", action: null }]);
  assert.equal(buildAttention({ now })[0].key, "clear");
  assert.equal(buildAttention({ messages: 1, now })[0].label, "1 unread message");
});

console.log(`\n${n} passed`);
