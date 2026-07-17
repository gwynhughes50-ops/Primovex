# Sprint 43.1 · Digital Space Cross-Device Sync

## Outcome
Primovex desktop and Primovex Mobile now share one Firestore-backed Digital Space Registry.

## Changes
- Added `SpaceRegistrySyncProvider` with live Firestore subscription.
- First authenticated device creates the remote registry from the current local hierarchy.
- Subsequent edits to sites, floors, zones and spaces are written back to Firestore.
- Remote changes hydrate local state and notify Admin, Sense, Facilities and Mobile views.
- Mobile Facilities no longer reads the retired `primovex.facilities.v2` local room list.
- Existing local storage remains an offline cache and migration source.

## Firestore
Collection: `practice_space_registry`
Document: `main`

## Protected acceptance checks
1. Sign in on desktop and mobile using the same Firebase project.
2. Confirm `Practice Manager RM-D90` appears on both.
3. Create a test Digital Space on desktop.
4. Confirm it appears on mobile without reinstalling.
5. Edit or archive it and confirm mobile updates.
6. Confirm login, desktop navigation, mobile navigation and Smart Tag scanning still work.
