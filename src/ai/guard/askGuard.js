import { checkText } from "./patientGuard";
import { routeApprovedTool } from "@/ai/tools/intentRouter";

// What is said to Ask Primovex, checked before it is classified or sent anywhere. A command that is about a colleague by name (a message to them, a look-up
// of their last sign-in or their SARs) only ever looks the colleague up, so the name in it is not a patient's; every other identifier in it is still checked.
const STAFF_NAME_TOOLS = new Set(["person.messageDraft", "team.messageDraft", "security.lastLogin", "governance.sarOverview", "rota.myShifts", "rota.swapDraft"]);

export function checkAskInput(input, { allow = [], conversation = [] } = {}) {
  let toolId = null;
  try { toolId = routeApprovedTool(input, { conversation })?.toolId || null; } catch { toolId = null; }
  // When the staff list could be read, a colleague's name is simply allowed and every other name is checked, even in these commands. Only someone whose
  // role cannot read the staff list (so a colleague's name can't be told from a patient's) has the name left to the look-up, which finds a colleague or says it can't.
  const noStaffList = allow.length <= 1;
  return checkText(input, { allow, ignoreNames: noStaffList && STAFF_NAME_TOOLS.has(toolId) });
}
