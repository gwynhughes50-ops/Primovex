# Sprint 44 — Unified Space Registry Preservation Foundation

Version: 0.11.3

## Included
- Mobile Practice Spaces reads the shared Space Registry.
- NFC space routes resolve `spaceId` from the shared registry.
- Registry schema v3 with revision tracking and guarded Firestore authority.
- Automatic local backup snapshots before migrations, remote applies, edits and resets.
- Legacy Sense cache receives a compatibility projection while modules migrate.
- Developer-only mobile issue recorder for System Admin accounts.
- JSON development bundle export containing issues, viewport diagnostics and registry backups.

## Protected areas
Login, desktop, mobile, NHS blue theme, Sense, Facilities, room IDs, Android safe areas and bottom navigation.

## Important
The developer issue recorder intentionally captures technical context only. Do not enter patient-identifiable information in issue descriptions.
