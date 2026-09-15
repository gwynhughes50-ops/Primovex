# Sprint 53 — Governed Audit Ledger Foundation

Version: 0.15.38

## Delivered

- Server-authoritative callable audit gateway in `europe-west2`.
- Actor UID and role derived from Firebase Authentication and the user profile.
- Practice/site attribution, server timestamps and idempotent client receipts.
- Per-practice sequence and SHA-256 integrity chain.
- Direct client writes, updates and deletion blocked for the central ledger and ledger head.
- Sensitive/free-text metadata filtering.
- Retry outbox for temporary connectivity failures.
- Searchable Audit Centre in Security Centre with JSON and CSV evidence export.
- Central evidence forwarding for successful login, ClinFlow access/actions/exports, Orb interactions, inventory movements, equipment changes, device assignment and Practice Administration changes.
- Existing stock movement, concern timeline, SAR activity and device-reading evidence hardened against update/deletion.
- Unit and static governance verification tests.

## Deliberately not claimed

This is an engineering control foundation, not legal compliance, NHS certification or approval for real patient information. The existing synthetic-only ClinFlow gate remains in force.

## Deployment

The new callable function and Firestore rules must both be deployed:

```powershell
firebase deploy --only "functions:recordGovernedAuditEvent,firestore:rules"
```

Existing Tuya, Azure and scheduled functions are not changed by this targeted deployment.
