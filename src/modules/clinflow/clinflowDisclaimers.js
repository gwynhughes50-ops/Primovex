// Single source of truth for ClinFlow's AI-output disclaimer wording, so the
// PDF exports and the on-screen UI never drift apart. Kept short and reused
// verbatim rather than repeated inline everywhere, per the design brief:
// short and standardised so it doesn't become wallpaper.

// Footer disclaimer — every generated summary sheet, evidence trail,
// workflow form and exported clinical note.
export const AI_OUTPUT_FOOTER = "AI-generated clinical correspondence summary. Human verification required before filing, coding, prescribing, acting on medication instructions, or changing patient management. The original document remains the source of truth.";

// Prominent top banner — only shown for higher-risk outputs (urgent,
// medication changes, safety-critical correspondence).
export const HIGH_RISK_BANNER = "Human review required before action.";

// Header wording for genuinely synthetic/demo test documents (the bundled
// synthetic hospital pack, mock UI data). Fine during development and
// testing.
export const SYNTHETIC_TEST_BANNER = "SYNTHETIC TEST · NOT FOR CLINICAL USE · TRAINED CLINICIAN VERIFICATION REQUIRED";

// Header wording for real, attested-anonymised documents processed through
// the live extraction pipeline — deliberately avoids "not for clinical use"
// since ClinFlow is intended to support clinical workflow; the point is
// mandatory verification, not that the output is unusable.
export const CLINICAL_DECISION_SUPPORT_BANNER = "CLINICAL DECISION-SUPPORT OUTPUT · REQUIRES VERIFICATION BY AN APPROPRIATELY TRAINED HEALTHCARE PROFESSIONAL BEFORE USE";

/** True once a document has gone through the real (non-pack) extraction pipeline. */
export function isRealAnalysedDocument(ocr) {
  return Boolean(ocr?.llmExtraction || ocr?.llmExtractionError);
}
