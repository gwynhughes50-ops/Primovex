import { OWNERS, buildNextSteps } from "./clinflowNextSteps.js";

// The tabs on the letters list. A letter is in exactly one, worked out from what ClinFlow suggested or a person confirmed, so a letter is never lost between tabs:
//   High   - urgent, or marked urgent by a person
//   Medium - action is needed and someone beyond admin has to do some of it (GP, nurse, pharmacist, manager), or ClinFlow cannot tell and a person has to look:
//            a letter ClinFlow is unsure about is never tucked away in a quieter tab
//   Low    - action is needed but every step is admin work (booking, filing, checking codes)
//   NFW    - no action needed
//   Finished - already finished
export const LANES = [["all", "Active"], ["high", "High"], ["medium", "Medium"], ["low", "Low"], ["nfw", "NFW"], ["finished", "Finished"]];
export const LANE_WORDS = { high: "High", medium: "Medium", low: "Low", nfw: "NFW", finished: "Finished" };

const ADMIN_DESTINATIONS = new Set(["Admin", "Workflow Team", "Registration Forms"]);

export function laneOf(document) {
  if (document?.status === "completed") return "finished";
  const review = document?.triageReview;
  const confirmed = review?.status === "human_confirmed";
  const decision = confirmed ? review.confirmedDecision : document?.clinflowAnalysis?.triage?.decision;
  if (document?.priority === "high" || decision === "urgent") return "high";
  if (decision === "no_workflow" || (!decision && document?.destination === "NFWF")) return "nfw";
  if (decision !== "workflow_required") return "medium";
  // a person who chose where it goes has decided who deals with it; otherwise look at who the steps are for
  if (confirmed && review.confirmedDestination) return ADMIN_DESTINATIONS.has(review.confirmedDestination) ? "low" : "medium";
  if (!document?.clinflowAnalysis) return "medium";
  const owners = buildNextSteps(document.clinflowAnalysis, {}, document.syntheticOcr?.content).steps.map((step) => step.owner);
  return owners.length && owners.every((owner) => owner === OWNERS.admin) ? "low" : "medium";
}

// The tab each letter is in, and how many are in each tab. Worked out once per change to the list, not on every redraw.
export function lanesFor(documents = []) {
  const byId = new Map();
  const counts = { all: 0, high: 0, medium: 0, low: 0, nfw: 0, finished: 0 };
  for (const document of documents) {
    const lane = laneOf(document);
    byId.set(document.id, lane);
    counts[lane] += 1;
    if (lane !== "finished") counts.all += 1;
  }
  return { byId, counts };
}

// Does a letter in this lane show under this tab? "all" is every letter not yet finished.
export const inLane = (lane, tab) => (tab === "all" ? lane !== "finished" : lane === tab);
