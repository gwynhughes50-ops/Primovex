# Primovex v0.15.40 — ClinFlow Action Reliability

## Fixed

- All six ClinFlow routing buttons now show and retain their selected destination.
- Local synthetic/demo sessions can route, prioritise, claim, note, teach, finalise and archive without failing on a cloud-only actor requirement.
- Claim and Confirm & Send now visibly update the selected document and prevent accidental repeated submissions.
- Reprocess OCR now reuses the approved in-session source PDF or opens the governed Azure batch gateway when the source must be selected again.
- Download now creates a clearly marked synthetic ClinFlow PDF instead of displaying a placeholder message.
- Score / Teach now opens for approved legacy synthetic demonstration documents as well as Azure-imported synthetic documents.
- Add note rejects empty notes and displays its recorded audit-marker count. Note text remains excluded from cloud storage in this governed foundation.
- Archive now requires confirmation and retains the governed audit history.
- Refresh now reloads the local document cache and records the refresh request.
- Busy, selected, completed and disabled action states are now visible and keyboard-focusable.

## Verification

- Production Vite build passed.
- Browser interaction checks passed for routing, priority, notes, teaching, claim, finalise and the OCR gateway.
- Existing NHS Blue styling, Orb voice baseline, mobile shell and synthetic-only clinical safety gate are preserved.

## Deployment

This is a frontend/desktop reliability release. No Firebase Functions or Firestore rules deployment is required.
