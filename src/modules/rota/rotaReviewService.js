import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { anonymise, restoreNames } from "./rotaReview";

// Asks the server for a written summary of the rota check. The findings go with every person's name replaced by a letter (see anonymise); the names are put back into the summary here, on this
// device, after it comes back. The server refuses to call the AI if a real name is still in what it was sent. Never needed: without it the findings are shown as they are.

// What to tell the person when the summary was not used
const REASONS = {
  "not-allowed": "Only the person who builds the rota, or an administrator, can ask for a summary.",
  names: "A name was still in the findings, so nothing was sent. Nothing was written.",
  personal: "Something in the findings looked like personal data, so nothing was sent.",
  shape: "The findings could not be sent in the form needed.",
  "too-long": "The findings were too long to send.",
  unavailable: "The AI is not available just now. The findings above are still right.",
  "not-json": "The AI's answer could not be used, so it is not shown.",
  "new-number": "The AI's answer used a figure that was not in the findings, so it is not shown.",
  "new-person": "The AI's answer mentioned someone who was not in the findings, so it is not shown.",
  name: "The AI's answer used a name, so it is not shown.",
  link: "The AI's answer contained a link, so it is not shown.",
};
export const reasonText = (reason) => REASONS[reason] || "A summary could not be written this time. The findings above are still right.";

export async function askForSummary(findings, rules) {
  if (isSafeSyntheticMode()) return { enabled: false, demo: true };
  const { payload, map } = anonymise(findings, rules);
  const result = (await httpsCallable(functions, "rotaReviewSummary", { timeout: 35000 })(payload)).data || {};
  if (!result.ok) return result;
  return { ...result, headline: restoreNames(result.headline, map), summary: restoreNames(result.summary, map), priorities: (result.priorities || []).map((p) => restoreNames(p, map)) };
}
