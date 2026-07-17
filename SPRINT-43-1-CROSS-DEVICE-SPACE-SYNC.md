# Sprint 43.1 — Cross-Device Space Sync

Version: 0.11.2

## Purpose

Move the shared Space Registry from device-only local storage to a live Firestore-backed registry used by desktop and Primovex Mobile.

## Behaviour

- Desktop retains the existing local hierarchy and publishes it to Firestore on first authenticated launch.
- Android subscribes to the same Firestore document and replaces its legacy local room display with the shared hierarchy.
- Admin, Sense and Facilities continue to update local state immediately, then sync the same permanent IDs to Firestore.
- Firestore changes trigger the existing Sense and Facilities refresh events on every client.
- Local storage remains an offline cache.
- Mobile never seeds Firestore from its old Facilities cache when no shared registry exists.

## Firestore

Collection: `space_registries`
Document: `primary`

Deploy rules before testing:

```powershell
firebase deploy --only firestore:rules
```

## Acceptance test

1. Open desktop while signed in and allow the hierarchy to publish.
2. Open Primovex Mobile with the same Firebase project and sign in.
3. Add `Sync Test Kitchen` on desktop.
4. Confirm it appears on mobile without rebuilding or reinstalling.
5. Delete/archive it and confirm mobile updates.
