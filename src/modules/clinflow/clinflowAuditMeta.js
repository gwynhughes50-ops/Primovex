// What ClinFlow adds to the audit trail so that a coding decision can be reconstructed later: which terminology (SNOMED release, dm+d release, abbreviation list)
// was in use when a code was suggested, accepted or filed, and where the coding stood when the letter went to Docman or was finished.
// The audit service keeps only simple values and drops any key that could name a patient, so these are counts, kinds and release labels, never the letter's words.
// Pure (no screens).
import { reviewOutcome } from "./clinflowCodeReview.js";

const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// The lists in use: `snomed` and `medicines` are the loaded lists' description lines ("" when not loaded), `abbreviations` the list's name
export function termVersions({ snomed = "", medicines = "", abbreviations = "" } = {}) {
  return {
    snomedList: text(snomed) || "not loaded",
    medicinesList: text(medicines) || "not loaded",
    abbreviationList: text(abbreviations) || "built-in list",
  };
}

// Where the coding of a letter stands: how many codes are accepted, removed, added by the coder, and still unchecked
export function codingAuditMeta(candidates = [], review = null) {
  const outcome = reviewOutcome(candidates, review);
  return {
    codesAccepted: outcome.accepted.length,
    codesRemoved: outcome.removed.length,
    codesAdded: outcome.accepted.filter((c) => c.added).length,
    codesWaiting: outcome.waiting.length,
    codesCalculated: outcome.accepted.filter((c) => c.calculated).length,
  };
}

// A terminology list or abbreviation file being loaded or taken off: what it was, so the version in use on a given day can be shown
export function terminologyEvent(kind, action, { info = "", fileLabel = "" } = {}) {
  const words = { snomed: "UK SNOMED list", dmd: "dm+d medicines list", abbreviations: "abbreviations list" }[kind] || "terminology list";
  return {
    action: action === "remove" ? "clinflow.terminology.remove" : "clinflow.terminology.load",
    summary: action === "remove" ? `${words} removed from this computer` : `${words} loaded on this computer`,
    metadata: { kind, release: text(info).slice(0, 170), fileLabel: text(fileLabel).slice(0, 120), automatedTransmission: false },
  };
}
