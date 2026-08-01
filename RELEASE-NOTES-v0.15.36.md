# Primovex v0.15.36 - ClinFlow 4.3 Governed Intelligence

## Purpose

This release migrates the useful operational concepts from the standalone ClinFlow AI 4.3 reference into the current secured Primovex ClinFlow architecture. It does not copy the legacy application's embedded patient demonstrations, browser-only security model, automatic learning behaviour or unverified clinical codes.

## Added

- Versioned ClinFlow 4.3-compatible triage ruleset.
- Explicit Urgent, Workflow Required, NFWF and Human Review outcomes.
- Separate workflow-decision explanation: whether work is still required, why, and the suggested destination.
- NFWF assessment with evidence score, category, positive reasons and safety blockers.
- Suggested destinations for GP, Pharmacist, Nurse/HCA, Admin, Workflow Team, Child Protection and Registration Forms.
- Governed clinical-trigger evidence for urgent, workflow, medication, completed-action and information-only language.
- Wider Wales and England quality/register prompts covering diabetes, AF, COPD, asthma, CKD, blood pressure, smoking, BMI and high-priority coding review.
- Score and Teach review form for approved synthetic cases.
- Accuracy dimensions for identity, summary, medicines, actions, urgency and coding prompts.
- Correction reason, destination, NFWF category, corrected summary and learning notes in the local governed teaching queue.
- Richer Docman companion summary with workflow and NFWF reasoning.
- Persistence of manual route and priority changes in the local ClinFlow cache.
- Automated governed-intelligence verification script.

## Safety and governance

- All AI outputs remain suggestions requiring a trained human reviewer.
- NFWF is never selected from absence of action alone; positive evidence is required and blockers prevent it.
- Teaching records cannot alter live rules automatically.
- No source PDF, OCR text, corrected summary or learning-note content is written to Firestore.
- Current synthetic-only Azure gateway restrictions remain in place.
- No code is automatically accepted, filed in Docman or written to EMIS.
- QAIF/QOF outputs remain record-check prompts, never confirmed opportunities from a letter alone.
- SNOMED CT candidates still require current UK Edition validation, patient matching and clinician acceptance.

## Verification

- ClinFlow governed decision tests pass.
- Vite production build passes.
- Desktop Tauri installer is build-tested as part of release packaging.
