# Sprint 31B.1 — Digital Rooms

## Scope

This sprint expands the local Facilities foundation into a digital-room operating model without changing Firebase rules or protected clinical/stock logic.

## Delivered

- Stable room IDs for future NFC/QR linking.
- Readiness states derived from cleaning deadlines and open maintenance.
- One-tap room-cleaned confirmation with signed-in user and timestamp.
- Cleaning audit history with room and cleaner filters.
- Room-specific equipment lists.
- Equipment movement history and last-known room updates.
- Service and PAT due fields.
- Maintenance priorities, caretaker assignment and completion audit.
- Read-only Primovex AI mock answers for room cleaning, facilities summaries and equipment location.
- Full theme inheritance and responsive desktop/mobile layout.

## Data boundary

Facilities data remains in versioned local storage (`primovex.facilities.v2`) pending a separately approved Firestore tool and rules sprint.

## Protected areas

No changes were made to login, inventory calculations, Practice Pulse calculations, Firebase rules, Tauri, branding, or mobile bottom navigation.
