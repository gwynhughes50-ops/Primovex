# Primovex v0.15.35 - Persistent ClinFlow and Governed Triage

## Document preservation

- Approved synthetic ClinFlow analysis records are cached in version-stable IndexedDB storage.
- Cached analysis records are restored after Primovex restarts and application upgrades.
- The original PDF remains session-only and is never placed in browser storage.
- Archived synthetic records are removed from the local cache while their governed cloud audit history remains.

## Governed triage foundation

- Every analysed document receives one suggested outcome: Urgent, Workflow required, NWF, or Human review required.
- Suggestions include confidence, evidence and the ruleset version.
- A permitted staff member must confirm or correct every outcome.
- Missing or unreliable evidence can never be classified as NWF automatically.
- Staff corrections enter a local synthetic teaching queue for governed review; they never change live routing rules automatically.

## Safety boundary

- This release remains restricted to the approved synthetic document pack.
- It does not persist original PDFs, real patient data or note text.
- Production clinical-document retention requires the future privileged ingestion and encrypted document-storage gateway.

## Verification

- Five governed document profiles cover urgent and workflow-required routing.
- Additional tests cover NWF and insufficient-evidence human review.
- Production web, Windows desktop, Firebase rules and cloud-function checks must pass before release.
