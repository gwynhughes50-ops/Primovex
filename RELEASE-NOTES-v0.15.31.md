# Primovex v0.15.31 — ClinFlow Docman Companion Summary

## Included

- Organises the controlled Azure OCR findings into diagnoses, observations, medicines and follow-up actions for review.
- Adds a dedicated SNOMED CT candidate review. Candidate terms are never presented as verified codes.
- Produces an A4 ClinFlow companion summary PDF for manual clinician verification and sign-off.
- Preserves the original source PDF unchanged for a separate download during the active review session.
- Supports the temporary workflow of dragging the reviewed summary and original letter into Docman as separate documents.
- Adds explicit patient-identity, clinical-meaning, urgency, medicines and coding verification warnings.
- Keeps automatic Docman transmission, automatic filing and automatic clinical coding disabled.

## Safety boundary

This remains a synthetic-document development release. OCR output and summaries are decision support only. A trained clinician must compare the summary with the original letter, verify the patient and clinical content, and accept any terminology before filing.

