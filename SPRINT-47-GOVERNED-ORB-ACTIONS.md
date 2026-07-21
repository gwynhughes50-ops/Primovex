# Primovex Sprint 47 — Governed Orb Actions

Version 0.15.0 · Orb Core 2.0.0

## Outcome

Orb can now prepare governed reconciliation proposals for Emergency Drugs & Equipment and Anaphylaxis Boxes. A proposal is not a clinical result and cannot change stock, readiness or compliance.

## Safety workflow

1. The user asks Orb to reconcile an emergency-drug trolley or anaphylaxis box.
2. Orb reads the current configured assets and prepares a 15-minute proposal for one specific asset.
3. Inventory opens the correct existing checklist and shows the proposal separately from clinical evidence.
4. A user with `inventory.verify` explicitly confirms the proposal.
5. The user completes the full existing checklist.
6. Only the existing **Save verification** action writes the clinical Firestore check.
7. The governed-action audit is then linked to that saved checklist ID.

## Controls

- Capability check before confirmation (`inventory.verify`).
- Exact collection and asset binding.
- Proposal registration on the originating device.
- Fifteen-minute expiry.
- Completed and cancelled proposal replay protection.
- A saved checklist ID is mandatory before an action can be recorded as completed.
- Failed Orb audit completion cannot undo or misreport a successfully saved clinical checklist.
- Management-facing audit foundation in Developer Centre for permitted audit/admin roles.
- Existing intent vocabulary supports emergency drugs, anaphylaxis boxes, resus/recess trolley variants and reconciliation language.

## Protected baseline

The confirmed v0.13.6 native Android voice lifecycle is unchanged. Sprint 47 does not modify the Android recognition bridge, native Orb voice service or Ask Orb voice lifecycle.

## Verification

Run:

```powershell
npm run test:orb-trust
npm run test:orb-actions
npm run build
```

The governed-action test covers proposal registration, confirmation, saved-evidence gating, expiry, cancellation, fabricated-link rejection and replay protection.
