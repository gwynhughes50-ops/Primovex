# Primovex v0.15.29.1 — ClinFlow Azure Gateway Hotfix

## Fixed

- Migrated Firebase Admin Firestore access to the supported modular API.
- Repaired ClinFlow permission checks and analysis audit writes on Firebase Admin 14.
- Updated shared Connect, Tuya event, device-sync, and alert services to the same supported API.
- Confirmed the Azure Document Intelligence endpoint and rotated key are accepted by Azure.
- Redeployed the two ClinFlow callable functions in `europe-west2` on Node.js 22.

## Verification

- Five ClinFlow Azure tests passed.
- Cloud Functions lint and module-load checks passed.
- Azure accepted a read-only authenticated model request.

## Security

- Azure credentials remain in Google Secret Manager and are not included in this project archive.
- Synthetic test-pack allowlisting and metadata-only audit storage remain unchanged.
