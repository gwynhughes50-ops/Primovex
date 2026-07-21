# Sprint 42.1 — Sense Identity & Room Context

Version: 0.10.9

## Scope
- One authenticated user per installed device.
- A successful new login replaces the previous device session and closes its active room context.
- Twelve-hour absolute session lifetime with a fifteen-minute warning.
- Fifteen-minute inactivity lock using user-scoped local PIN/unlock keys.
- Firestore-backed device sessions, room/Sense sessions and immutable Sense events.
- Room tags activate a visible working context for the signed-in user.
- Scanning another room closes the previous room session and records the move.
- Active-room banner is visible on mobile and can be cleared.

## New Firestore collections
- `device_sessions`
- `device_session_events`
- `sense_sessions`
- `sense_events`

## Deferred to Sprint 42.2
- Stock movement source/destination fields and active-room suggestions.
- Practice Manager occupancy dashboard.
- AI tools for room occupancy and room movement history.
