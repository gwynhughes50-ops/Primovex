# Sprint 52.1 - ClinFlow Governed Data Foundation

Version: 0.15.25

## Delivered

- Firestore-backed ClinFlow workflow state, isolated by practice and site.
- Synthetic-only client write boundary; real clinical data remains disabled.
- Patient names, NHS numbers, dates of birth, document text, note text, staff names and emails are never uploaded by this module.
- Immutable workflow events for routing, notes, claims and completion.
- Soft archive in place of destructive document deletion.
- Role-aware actions using the existing ClinFlow capabilities.
- Visible local preview, cloud-synced and sync-error states.
- Patient matching remains explicitly unverified.

## Safety boundary

This release is for synthetic demonstration workflows only. Azure Document Intelligence,
Docman, patient matching and external ingestion remain disabled until the secure server
gateway, retention policy and information-governance controls are approved.

## Verification

1. Run `npm run build`.
2. Run `npm run desktop:build`.
3. Deploy the updated Firestore rules before testing cloud persistence.
4. Confirm read-only roles cannot change workflow records.
5. Confirm workflow events cannot be edited or deleted.
