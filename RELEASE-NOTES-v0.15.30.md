# Primovex v0.15.30 — ClinFlow Batch Intake

## Added

- Multi-select intake for the approved synthetic hospital PDF pack.
- Sequential Azure processing so selections are queued without overwhelming provider capacity.
- Per-document queued, analysing, completed and failed states.
- Partial-success handling: successful documents can enter ClinFlow even if another file fails.
- One-click handoff of all successful results into the ClinFlow review queue.
- Azure OCR evidence, extraction metrics, controlled values and an audit timeline for each imported document.

## Safety

- Exact synthetic-document fingerprint enforcement remains server-side.
- Each PDF remains limited to 4 MB and two pages in this foundation release.
- PDFs and extracted OCR text remain session-only and are not persisted by Primovex.
- Patient matching, clinical interpretation, coding, QAIF suggestions and workflow actions require human review.
- Documents are processed one at a time to respect service capacity and make failures recoverable.

## Fixed

- Firebase Admin 14 Firestore initialization in ClinFlow and shared Connect services.
- Azure endpoint and rotated-key configuration for the deployed gateway.
