# Primovex v0.15.41 — ClinFlow Finished Docman Packs

## Added

- ClinFlow now preserves each approved synthetic original PDF in its protected local IndexedDB cache instead of retaining it only for the active session.
- The Document view includes an explicit **Open original PDF** control for side-by-side human comparison.
- Completed work moves into a visible **Finished** queue rather than remaining mixed with active documents.
- **Confirm & Finish** requires three explicit clinician checks: original comparison, identity verification and clinical/workflow review.
- A finished pack contains the untouched original PDF, the ClinFlow clinician-review summary PDF and a governance manifest.
- Individual Docman packs and all finished packs can be downloaded as ZIP files for manual bulk drag-and-drop into Docman.
- Pack creation and bulk download are recorded in the governed audit ledger; Primovex does not transmit documents automatically.

## Navigation

- Practice Admin, Theme and Developer now use distinct Building, Palette and Code icons.

## Governance boundary

- This build remains restricted to approved synthetic testing documents.
- Finished PDFs are kept locally on the device in IndexedDB. Before live clinical use, Primovex requires approved encrypted managed storage, retention, access-control, backup and DPIA arrangements.
- Human review remains mandatory. No clinical data, codes, priority or destination are accepted automatically.

## Deployment

This is a frontend/desktop release. No Firebase Functions or Firestore rules deployment is required.
