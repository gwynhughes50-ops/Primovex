# Sprint 31B Facilities Foundation

## Added
- Facilities route and desktop navigation entry
- Responsive facilities overview
- Room registry with cleaning status
- One-tap room cleaned confirmation
- Signed-in user and timestamp audit trail
- Equipment registry with last-known room
- Maintenance issue reporting and completion
- NFC-ready room identity fields
- Theme-token styling

## Data boundary
This foundation uses session-safe browser localStorage demo data. It does not access Firestore and does not require Firebase rule changes. The approved Facilities Firestore tool layer will be introduced in a later sprint.

## Protected areas
No changes were made to login, inventory calculations, Pulse calculations, Firebase rules, mobile bottom navigation, Tauri configuration, or branding.

## Validation
`npm run build` passed.
