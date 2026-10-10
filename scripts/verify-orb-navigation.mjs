import assert from "node:assert/strict";
import { looksLikeNavigation, parseNavigation, resolveNavigation } from "../src/ai/navigation/navigate.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("going to a screen is told apart from asking about it", () => {
  for (const [s, id] of [["show me the alerts", "alerts"], ["go to purchase orders", "purchasing"], ["open the reorder centre", "reorder"], ["take me to compliance", "compliance"], ["Open inventory.", "inventory"], ["please go to the dashboard", "dashboard"], ["can you open the concerns", "concerns"], ["navigate to SARs", "sars"], ["open significant events", "significant-events"], ["bring up the temperature log", "temperature"], ["go to the anaphylaxis boxes", "anaphylaxis"], ["open practice admin", "practice-admin"], ["switch to the help page", "help"]]) {
    assert.equal(parseNavigation(s)?.id, id, s);
  }
  for (const s of ["show me stock that is low", "open a new product", "go to town on the cleaning", "what are the alerts", "how do I open the alerts", "show me what expires this month", "I've opened a box of gloves", "open the fridge", "show me temperatures"]) {
    assert.ok(!looksLikeNavigation(s), s);
  }
});

t("on the desktop it opens the page", () => {
  const r = resolveNavigation({ id: "purchasing" }, { capabilities: ["purchasing.read"], platform: "desktop" });
  assert.equal(r.text, "Opening Purchasing.");
  assert.deepEqual(r.action, { label: "Open Purchasing", route: "/purchasing", auto: true });
});

t("only a screen they are allowed into", () => {
  const r = resolveNavigation({ id: "admin" }, { capabilities: ["inventory.read"], platform: "desktop" });
  assert.match(r.text, /don't have access to Advanced Administration/);
  assert.equal(r.action, undefined);
  assert.ok(resolveNavigation({ id: "admin" }, { capabilities: ["*"], platform: "desktop" }).action);
  assert.ok(resolveNavigation({ id: "alerts" }, { capabilities: [], platform: "desktop" }).action, "a screen with no permission needed is open to everyone");
});

t("on the phone it switches tab, opens a page, or says it is desktop only", () => {
  const tab = resolveNavigation({ id: "compliance" }, { capabilities: ["compliance.read"], platform: "mobile" });
  assert.deepEqual(tab.action, { label: "Open Compliance", route: "/compliance", tab: "compliance", auto: true });
  const page = resolveNavigation({ id: "sars" }, { capabilities: ["governance.read"], platform: "mobile" });
  assert.deepEqual(page.action, { label: "Open SARs", route: "/governance/sars", tab: null, auto: true });
  const desktopOnly = resolveNavigation({ id: "purchasing" }, { capabilities: ["purchasing.read"], platform: "mobile" });
  assert.equal(desktopOnly.action, undefined);
  assert.match(desktopOnly.text, /only on the desktop app/);
  assert.match(resolveNavigation({ id: "nowhere" }, {}).text, /not sure where you mean/);
});

t("getting ready for a visit opens the inspection pack for that visit, for people allowed to prepare it", () => {
  for (const [s, id] of [
    ["we have a HIW inspection, print off a report ready", "inspection-hiw"],
    ["Get the HIW evidence ready", "inspection-hiw"],
    ["we have a health and safety visit, can you prepare a report", "inspection-hs"],
    ["print the H&S inspection pack", "inspection-hs"],
    ["we have an inspection coming, get a report ready", "inspection"],
    ["the inspectors are in, print me a summary", "inspection"],
  ]) assert.equal(parseNavigation(s)?.id, id, s);
  for (const s of ["how do I prepare for an inspection", "what is a HIW inspection", "when was the last fire alarm", "print the stock report", "we had an inspection last year", "show me the alerts for the health and safety room"]) {
    assert.ok(!["inspection", "inspection-hiw", "inspection-hs"].includes(parseNavigation(s)?.id), s);
  }
  const allowed = resolveNavigation({ id: "inspection-hiw" }, { capabilities: ["reports.inspection"] });
  assert.equal(allowed.action.route, "/inspection?visit=hiw");
  assert.match(allowed.text, /HIW inspection pack/);
  assert.match(resolveNavigation({ id: "inspection-hs" }, { capabilities: ["reports.read"] }).text, /don't have access/);
  assert.match(resolveNavigation({ id: "inspection" }, { capabilities: ["*"], platform: "mobile" }).text, /only on the desktop app/);
});

console.log(`\n${n} passed`);
