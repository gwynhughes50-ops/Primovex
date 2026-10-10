import assert from "node:assert/strict";
import { routeApprovedTool } from "../src/ai/tools/intentRouter.js";

// The newer Orb abilities, through the real router, so a new rule can't quietly steal an older question
// (and an older rule can't steal a new one).
let n = 0;
const route = (prompt, expected, conversation = []) => {
  const routed = routeApprovedTool(prompt, { conversation });
  const got = routed?.toolId ?? null;
  assert.equal(got, expected, `"${prompt}" routed to ${got}, expected ${expected} (${JSON.stringify(routed)})`);
  n += 1;
  return routed;
};

// management questions
route("when was the last fire alarm test done", "compliance.lastCheck");
route("When did we last test the fire alarm?", "compliance.lastCheck");
route("what are the tap water temps in the last month", "compliance.waterTemps");
route("hot water temperatures last month", "compliance.waterTemps");
route("when did Craig last login", "security.lastLogin");
route("how many SAR does Craig have outstanding", "governance.sarOverview");
route("how many SARs are outstanding", "governance.sarOverview");
route("where are we up to with concerns", "governance.concernsOverview");
route("how many open complaints do we have", "governance.concernsOverview");
const he = route("how many SAR does he have outstanding", "governance.sarOverview", [{ role: "user", content: "when did Craig last login" }]);
assert.equal(he.input.person, "craig");

// stock in, and the answer to its question
route("I have received 20 chlorphenamine ampoules", "stock.inDraft");
route("we have had a delivery of two boxes of gauze swabs, batch 9921", "stock.inDraft");
route("book in 5 salbutamol inhalers", "stock.inDraft");
const asked = [{ role: "user", content: "I have received 20 chlorphenamine ampoules" }, { role: "assistant", intent: "stock.inDraft", proposal: null, pending: { toolId: "stock.inDraft", sentence: "I have received 20 chlorphenamine ampoules" } }];
const answer = route("batch 4471, expires March 2028", "stock.inDraft", asked);
assert.equal(answer.input.question, "I have received 20 chlorphenamine ampoules, batch 4471, expires March 2028");
route("batch 4471, expires March 2028", null, [{ role: "assistant", intent: "inventory.lowStock", pending: null }]);
route("how many gauze swabs do we have", "inventory.categoryLookup", asked); // an ordinary question is never mistaken for the answer

// counts, expiry round, reminders, messages, navigation, briefing
route("count the nurses room: gloves 12, syringes 40", "stock.countDraft");
route("I have counted the store cupboard", "stock.countDraft");
const counting = [{ role: "user", content: "count the nurses room" }, { role: "assistant", intent: "stock.countDraft", proposal: null, pending: { toolId: "stock.countDraft", sentence: "count the nurses room" } }];
assert.equal(route("gloves 12 and syringes 40", "stock.countDraft", counting).input.question, "count the nurses room: gloves 12 and syringes 40");
const carded = [{ role: "assistant", intent: "stock.countDraft", proposal: { status: "proposed", kind: "stock-count" }, pending: { toolId: "stock.countDraft", sentence: "count the nurses room: gloves 12" } }];
assert.equal(route("syringes 40", "stock.countDraft", carded).input.question, "count the nurses room: gloves 12, syringes 40");
route("yes", null, carded);
route("take the expired stock off", "stock.expiredDraft");
route("what expires this month", "inventory.expiring");
route("remind me to check the vaccine fridge tomorrow at 9", "reminder.draft");
route("remind everyone to sign the fire register", "reminder.draft");
route("tell Ben the vaccine fridge needs checking", "person.messageDraft");
route("tell the HCA team BD blue needles need ordering", "team.messageDraft");
route("show me the alerts", "app.navigate");
route("go to purchase orders", "app.navigate");
route("take me to compliance", "app.navigate");
route("what needs attention before I leave", "briefing.daily");
route("morning briefing", "briefing.daily");
route("what needs attention", "operations.summary");

// fridge checks
route("which fridges haven't been checked today", "coldChain.checksToday");
route("have the fridges been checked yet", "coldChain.checksToday");
route("are all fridges ok today", "coldChain.latestStatus");

// the older questions still go where they went
route("tell me about SAR-2026-004", "governance.sarLookup");
route("find concern CN-2026-12", "governance.concernLookup");
route("what is the status of fridge 2", "coldChain.unitStatus");
route("are all fridges ok today", "coldChain.latestStatus");
route("I've taken two gloves from the store cupboard", "stock.useDraft");
route("which stock is low", "inventory.lowStock");
route("how do I add a new product to stock", "help.howTo");
route("how many significant events are open", "governance.seLookup");

console.log(`\n${n} passed`);
