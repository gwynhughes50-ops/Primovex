import assert from "node:assert/strict";
import { routeApprovedTool } from "../src/ai/tools/intentRouter.js";

let n = 0;
const route = (prompt, expected) => {
  const routed = routeApprovedTool(prompt, {}); const got = routed?.toolId;
  assert.equal(got, expected, `"${prompt}" routed to ${got}, expected ${expected} (${JSON.stringify(routed)})`);
  n += 1;
};

route("send a message to the HCA team BD needles blue need ordering", "team.messageDraft");
route("tell the nurses the fridge needs checking", "team.messageDraft");
route("BD blue needles need ordering", "reorder.draft");
route("reorder 5 chlorphenamine ampoules", "reorder.draft");
route("what's in anaphylaxis box 3", "inventory.locate");
route("how many adrenaline are in anaphylaxis box 3", "inventory.locate");
route("where are the blue needles", "inventory.locate");
route("how many significant events are open", "governance.seLookup");
route("do I have any significant event reviews to do", "governance.seLookup");
route("what is the status of SE-2026-10081405", "governance.seLookup");
route("when is the next SE meeting", "governance.seLookup");
route("what is the SAR status for SAR-2026-0803141522", "governance.sarLookup");
route("report a significant event: the wrong vaccine was drawn up, no harm", "se.reportDraft");
route("I need to report a near miss", "se.reportDraft");
route("how do I report a significant event", "help.howTo");
// existing behaviour must not change
route("which stock items are low", "inventory.lowStock");
route("what is expiring soon", "inventory.expiring");
route("where is the ECG machine", "facilities.equipmentLocation");
console.log(`${n} passed`);
