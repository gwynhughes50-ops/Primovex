# ClinFlow Azure synthetic testing

## Deploy once

Open PowerShell in the v0.15.29 project folder and run:

```powershell
firebase login
firebase use medtrak-b1cad
firebase deploy --only "functions:clinFlowDocumentIntelligenceHealth,functions:analyzeSyntheticClinFlowDocument,firestore:rules"
```

The following Secret Manager entries must already exist:

- `AZURE_DOCUMENT_INTELLIGENCE_KEY`
- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`

Do not place either value in `.env`, source code, screenshots, support bundles or the desktop/mobile application.

## Test

1. Install and open Primovex v0.15.29.
2. Sign in with a System Admin account or a role containing `clinflow.capture`.
3. Open **ClinFlow**.
4. Select **Test Azure OCR**.
5. Confirm **Azure gateway ready**.
6. Choose one PDF from `test-data/clinflow-synthetic-hospital-pack`.
7. Confirm the synthetic-data attestation.
8. Select **Analyse synthetic PDF**.
9. Review extracted text, confidence, tables and ground-truth detections.
10. Select **Clear test document** before moving to the next file.

## Expected controls

- Any PDF outside the approved pack is rejected server-side.
- Files larger than 4 MB are rejected.
- Unauthenticated users and users without `clinflow.capture` are rejected.
- Primovex does not retain the PDF or extracted text.
- Firestore receives metadata-only analysis events through the Admin SDK.
- The Azure key and endpoint never reach the client.

## Troubleshooting

- **Azure gateway unavailable:** deploy both listed functions and confirm the two secrets are enabled.
- **Permission denied:** use System Admin or grant `clinflow.capture` to the user role.
- **Document rejected:** use the unchanged PDFs supplied with this release; resaving a PDF changes its fingerprint.
- **Provider unavailable:** check the function logs and Azure resource status. Avoid rapid retries because the F0 tier has restricted throughput.
