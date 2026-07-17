# Sprint 38.1 - Theme Engine Repair

## Fixed
- Prevented stale Firestore profile values from snapping a newly selected Theme Lab theme back to the previous theme.
- Manual theme selection now applies immediately and remains authoritative until the matching profile update is observed.
- Preserved cross-device theme synchronisation once the saved profile changes.
- Converted the first-run setup wizard from hard-coded NHS/violet/slate colours to shared Primovex theme tokens.
- Kept NHS Blue as the new-user fallback without locking existing users to it.

## Protected
- Authentication and permissions
- Setup data and practice configuration
- Mobile navigation
- Inventory and governance logic
