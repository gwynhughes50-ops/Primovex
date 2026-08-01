# Primovex v0.15.29 — ClinFlow Azure Document Intelligence Foundation

Release date: 1 August 2026

## Ready for controlled testing

- Windows desktop installer build passed.
- Vite production build passed (2,391 modules).
- Firebase Functions lint passed.
- Five ClinFlow gateway tests passed.
- Both ClinFlow functions deployed successfully to `medtrak-b1cad` in `europe-west2` on Node.js 22.
- Firestore rules compiled and deployed successfully.
- Azure key and endpoint are bound through Google Secret Manager.

## Test entry point

Sign in with System Admin or `clinflow.capture`, then open:

`ClinFlow → Test Azure OCR`

Use only the unchanged PDFs in `test-data/clinflow-synthetic-hospital-pack`.

## Privacy and safety design

- Exact SHA-256 allowlist; only the five approved synthetic PDFs are accepted.
- Server-side authentication and capability enforcement.
- PDF and extracted text are not stored by Primovex.
- Metadata-only analysis audit.
- Provider credentials never enter the desktop/mobile bundle.
- Human review remains mandatory.
- Real clinical data remains technically blocked.

## Dependency review

The inherited critical/high production audit findings were removed by:

- upgrading Firebase Admin and Firebase Functions;
- upgrading PostCSS and applying non-breaking audit updates;
- removing vulnerable SheetJS and preserving report export as Excel-compatible Spreadsheet XML.

Eight moderate upstream advisories remain in React Router and Google/Firebase transitive packages. They are recorded for remediation and do not change the synthetic-only clinical-data lock. This release is for controlled synthetic testing, not approved production clinical deployment.

## Existing non-blocking build warning

The main JavaScript bundle remains larger than Vite's 500 kB advisory threshold. Future code-splitting is recommended; this did not prevent the production or desktop builds.
