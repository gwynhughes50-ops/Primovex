import assert from "node:assert/strict";
import { routeApprovedTool } from "../src/ai/tools/intentRouter.js";

let n = 0;
const route = (prompt, expected) => {
  const got = routeApprovedTool(prompt, {})?.toolId;
  assert.equal(got, expected, `"${prompt}" routed to ${got}, expected ${expected}`);
  n += 1;
};

route("send a message to the HCA team BD needles blue need ordering", "team.messageDraft");
route("tell the nurses the fridge needs checking", "team.messageDraft");
route("BD blue needles need ordering", "reorder.draft");
route("reorder 5 chlorphenamine ampoules", "reorder.draft");
route("what's in anaphylaxis box 3", "inventory.locate");
route("how many adrenaline are in anaphylaxis box 3", "inventory.locate");
route("where are the blue needles", "inventory.locate");
// existing behaviour must not change
route("which stock items are low", "inventory.lowStock");
route("what is expiring soon", "inventory.expiring");
route("where is the ECG machine", "facilities.equipmentLocation");
console.log(`${n} passed`);
