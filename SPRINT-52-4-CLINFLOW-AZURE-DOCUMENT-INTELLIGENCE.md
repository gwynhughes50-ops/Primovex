# Sprint 52.4 — ClinFlow Azure Document Intelligence Foundation

Release: Primovex v0.15.29

## Outcome

ClinFlow can submit the approved Primovex synthetic hospital document pack to Azure AI Document Intelligence through authenticated Firebase Cloud Functions. Azure credentials remain server-side in Google Secret Manager.

## Included

- `prebuilt-layout` analysis using Azure Document Intelligence REST API `2024-11-30`.
- Secure callable gateway in `europe-west2`.
- Node.js 22 Cloud Functions runtime.
- Server-side `clinflow.capture` permission enforcement.
- Exact SHA-256 allowlist for the five approved synthetic PDFs.
- PDF validation and 4 MB limit.
- F0-aligned single-instance, single-concurrency provider access.
- In-memory upload and result review; Primovex stores neither the PDF nor extracted text.
- Metadata-only analysis audit records.
- OCR text, confidence, table structure and controlled ground-truth comparison.
- Explicit synthetic attestation and clear-document control.
- Desktop/mobile-responsive NHS Blue test panel.

## Safety boundary

This is not a production clinical document gateway. Real patient or staff information remains technically blocked. Only the exact supplied synthetic test pack is accepted. Extracted values require human review and cannot trigger an automated clinical action.

## Deliberately deferred

- Real clinical documents and patient matching.
- Persistent document storage or retention workflows.
- Production malware scanning and content-disarm controls.
- App Check enforcement and production tenant routing.
- Docman/EMIS integration.
- Automated clinical coding, medication changes or workflow completion.
- Signed DPIA, DCB0129/DCB0160 evidence and controller deployment approval.

## Verification completed

- Vite production build.
- Firebase Functions JavaScript syntax checks.
- Unit tests for pack fingerprints, endpoint validation, output reduction and ground-truth comparison.
- Tauri desktop build and installer packaging (see release hand-off).

## Deployment completed

On 1 August 2026, `clinFlowDocumentIntelligenceHealth` and `analyzeSyntheticClinFlowDocument` were deployed successfully to Firebase project `medtrak-b1cad`, region `europe-west2`, using Node.js 22. The updated Firestore rules were compiled and released successfully.
