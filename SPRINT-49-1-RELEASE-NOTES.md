# Primovex Sprint 49.1 — v0.15.13

## Everyday Inventory Safety and Completion

- Successful mobile stock use now closes into a compact receipt above the persistent navigation.
- The receipt confirms product, quantity, remaining balance, location, synchronisation and audit status.
- Users have ten seconds to undo an accidental use.
- Undo creates a compensating transaction, retains and marks the original movement, records the reversal, and prevents replay.
- A low-stock result offers an immediate reorder action without interrupting normal stock use.
- Mobile consumption records its movement kind, barcode, authenticated user, role, active Space and Sense session.
- Offline stock use and offline undo are blocked before mutation with a clear message; Primovex never presents an uncommitted movement as successful.
- The existing stock transaction engine remains the single source of truth.

## Orb safety boundary

Orb’s current approved data tools remain read-only. Stock writes were not bypassed or added as hidden voice commands. A future Orb stock action will require a governed proposal, explicit confirmation, permission check and the same audited transaction service.

## Protected foundations

- Native Android barcode scanning is unchanged.
- Orb native voice recognition is unchanged.
- Anaphylaxis and Emergency Box readiness workflows are unchanged.
- NHS Blue styling, Android safe areas and bottom navigation clearance are preserved.
