// What the person who opened a letter decided about each step in "What to do with this letter": they do it themselves, send it to a colleague, or say no action is
// needed (with a reason). The suggested owner (GP, nurse, admin...) is only a suggestion; the choice is theirs, and every choice is kept on the letter and written
// to the audit trail with who made it and when. Pure (no screens, nothing sent from here).

export const NO_ACTION_REASONS = ["For information only", "Already done", "The hospital is arranging it", "Not relevant to the practice", "Dealt with another way"];
export const CHOICES = { self: "You are doing this", done: "Done", sent: "Sent to a colleague", none: "No action needed" };

// A step's identity on the letter: what kind of step it is and the words it came from, so the same step is the same step each time the letter is opened
export const stepKey = (step) => `${step?.kind || "step"}|${String(step?.because || step?.title || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80)}`;

// A new decision, or null if it is not a valid one (a "no action" needs a reason from the list)
export function makeDecision(choice, { byUid = "", byName = "", at = new Date(), to = "", reason = "", note = "" } = {}) {
  if (!Object.keys(CHOICES).includes(choice)) return null;
  if (choice === "none" && !NO_ACTION_REASONS.includes(reason)) return null;
  return { choice, byUid: String(byUid), byName: String(byName).slice(0, 80), at: (at instanceof Date ? at : new Date(at)).toISOString(), to: String(to).slice(0, 120), reason: choice === "none" ? reason : "", note: String(note).slice(0, 200) };
}

// The decisions after one more (a null decision puts the step back to undecided), with the earlier choice kept in a short history for the record
export function applyDecision(decisions = {}, key, decision) {
  const next = { ...decisions };
  const before = decisions[key];
  if (!decision) { delete next[key]; return next; }
  next[key] = { ...decision, history: [...(before ? [{ choice: before.choice, byName: before.byName, at: before.at }] : []), ...(before?.history || [])].slice(0, 5) };
  return next;
}

// How a decision reads on the screen
export function describeDecision(decision) {
  if (!decision) return "";
  const who = decision.byName ? ` by ${decision.byName}` : "";
  if (decision.choice === "sent") return `Sent to ${decision.to || "a colleague"}${who}`;
  if (decision.choice === "none") return `No action needed: ${decision.reason}${who}`;
  if (decision.choice === "done") return `Done${who}`;
  return `${CHOICES[decision.choice]}${who}`;
}

// Where the steps stand, for the audit trail when a letter is filed or finished: counts only, never the words
export function decisionCounts(steps = [], decisions = {}) {
  const counts = { steps: steps.length, undecided: 0, self: 0, done: 0, sent: 0, none: 0 };
  for (const step of steps) {
    const d = decisions[stepKey(step)];
    if (!d) counts.undecided += 1; else counts[d.choice] += 1;
  }
  return counts;
}
