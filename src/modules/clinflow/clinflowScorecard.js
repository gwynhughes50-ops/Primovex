// How well ClinFlow is doing, worked out from what the staff have told it: the triage they confirmed or corrected, what they ticked as accurate in
// Score / Teach, and what the coder accepted, removed or added. For the person who reviews the rules; nothing here changes a rule. Pure (no screens).
import { reviewCandidates, reviewStats } from "./clinflowCodeReview.js";
import { NFW_REASON_WORDS, nfwStats } from "./clinflowNfwf.js";

export const AREAS = { identity: "Patient identity", summary: "Summary", medicines: "Medicines", actions: "Actions", urgency: "Urgency", coding: "Coding prompts" };
export const DECISION_WORDS = { urgent: "Urgent", workflow_required: "Workflow required", no_workflow: "NFWF", review_required: "Human review required" };
const word = (decision) => DECISION_WORDS[decision] || String(decision || "").replace(/_/g, " ");
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// teaching: the saved Score / Teach records. documents: ClinFlow's documents with their analysis and any code review.
export function buildScorecard({ teaching = [], documents = [] } = {}) {
  const everything = [...teaching].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  // a clinician's spot-check of a "no action needed" letter is a second opinion on a decision already counted, so it is not counted as another triage decision
  const records = everything.filter((r) => r.source !== "spot_check");
  const agreed = records.filter((r) => r.suggestedDecision === r.confirmedDecision).length;
  const triage = {
    total: records.length, agreed, corrected: records.length - agreed, rightPct: pct(agreed, records.length),
    destinationChanged: records.filter((r) => r.suggestedDestination && r.confirmedDestination && r.suggestedDestination !== r.confirmedDestination).length,
    byDecision: Object.entries(records.reduce((tally, r) => { tally[r.confirmedDecision] = (tally[r.confirmedDecision] || 0) + 1; return tally; }, {})).map(([decision, count]) => ({ decision, label: word(decision), count })),
  };
  // "What was accurate?" ticks: only the cases where the person filled that in count, so a letter nobody scored does not look wrong
  const scored = records.filter((r) => r.accuracyChecks && Object.keys(r.accuracyChecks).length);
  const areas = Object.entries(AREAS).map(([key, label]) => {
    const right = scored.filter((r) => r.accuracyChecks[key]).length;
    return { key, label, right, total: scored.length, pct: pct(right, scored.length) };
  });
  const coding = { documents: 0, suggested: 0, accepted: 0, removed: 0, added: 0, waiting: 0, rightPct: null, missedPct: null };
  for (const doc of documents) {
    if (!doc?.clinflowAnalysis || !doc?.codeReview) continue;
    const stats = reviewStats(reviewCandidates(doc.clinflowAnalysis, doc.syntheticOcr?.content), doc.codeReview);
    if (!stats.accepted && !stats.removed && !stats.added) continue;
    coding.documents += 1;
    coding.suggested += stats.suggested; coding.accepted += stats.accepted; coding.removed += stats.removed; coding.added += stats.added; coding.waiting += stats.waiting;
  }
  coding.rightPct = pct(coding.accepted, coding.accepted + coding.removed);
  coding.missedPct = pct(coding.added, coding.accepted + coding.added);
  const corrections = everything
    .filter((r) => r.suggestedDecision !== r.confirmedDecision || text(r.correctedSummary) || text(r.learningNotes) || text(r.correctionReason))
    .map((r) => ({ id: r.id, at: r.createdAt, document: r.documentProfile, suggested: word(r.suggestedDecision), confirmed: word(r.confirmedDecision), destination: r.confirmedDestination || "", reason: text(r.correctionReason), summary: text(r.correctedSummary), notes: text(r.learningNotes), reasonCode: r.reasonCode || "", reasonWords: NFW_REASON_WORDS[r.reasonCode] || "", checked: r.source === "spot_check" }));
  return { triage, areas, scoredCount: scored.length, coding, corrections, nfw: nfwStats(teaching) };
}

// a spreadsheet cell that cannot be read as a formula, whatever a person typed into the box
const cell = (value) => { let v = String(value ?? "").replace(/\r?\n/g, " "); if (/^[=+\-@\t]/.test(v)) v = `'${v}`; return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };

// The scorecard and every correction as a CSV for the person who reviews the rules
export function scorecardCsv(card, teaching = []) {
  const rows = [
    ["ClinFlow scorecard"],
    ["Triage confirmed", card.triage.total], ["Triage right first time", card.triage.rightPct === null ? "" : `${card.triage.rightPct}%`], ["Triage corrected", card.triage.corrected],
    ...card.areas.map((a) => [`Accurate: ${a.label}`, a.pct === null ? "" : `${a.pct}% (${a.right} of ${a.total})`]),
    ["No-action suggestions confirmed right", card.nfw.rightPct === null ? "" : `${card.nfw.rightPct}% (${card.nfw.right} of ${card.nfw.suggested})`], ["No-action suggestions said to be wrong", card.nfw.wrong],
    ["Clinician spot-checks agreeing", card.nfw.checkedPct === null ? "" : `${card.nfw.checkedPct}% (${card.nfw.checkedAgreed} of ${card.nfw.checked})`],
    ...card.nfw.reasons.map((x) => [`No-action wrong because: ${x.label}`, x.count]), ...card.nfw.missedWording.map((x) => ["Wording ClinFlow missed", x.sentence, x.count]),
    ["Codes accepted", card.coding.accepted], ["Codes removed", card.coding.removed], ["Codes added by the coder", card.coding.added], ["Codes right", card.coding.rightPct === null ? "" : `${card.coding.rightPct}%`],
    [],
    ["Date", "Document", "ClinFlow suggested", "Confirmed as", "Destination", "NFWF category", "Reason for correction", "Corrected summary", "Learning notes", "Accurate: identity", "Accurate: summary", "Accurate: medicines", "Accurate: actions", "Accurate: urgency", "Accurate: coding", "Ruleset", "Status", "Source", "Reason picked", "Words that needed action"],
    ...[...teaching].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).map((r) => [
      r.createdAt, r.documentProfile, word(r.suggestedDecision), word(r.confirmedDecision), r.confirmedDestination, r.nfwfCategory, r.correctionReason, r.correctedSummary, r.learningNotes,
      ...Object.keys(AREAS).map((k) => (r.accuracyChecks?.[k] ? "yes" : "no")), r.rulesetVersion, r.governanceStatus,
      r.source === "spot_check" ? "clinician spot-check" : "confirmed in triage", NFW_REASON_WORDS[r.reasonCode] || "", (r.reasonSentences || []).join(" | "),
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
