# Sprint 28C — Inventory Permission Restoration

## Baseline
`aurora-stock(15).zip`

## Root cause
The Inventory page read `auth.currentUser` directly and attempted to derive the application role from the Firebase Auth user. Firebase Auth users do not contain the Firestore profile role or custom capability grants, so Inventory fell back to the ordinary `User` capability set and disabled archive/delete.

## Change
Only `src/pages/Inventory.jsx` was changed.

Inventory now consumes the existing `AuthContext` and checks the live Firestore-backed capabilities directly:

- `inventory.write` controls Use, Receive and Edit.
- `inventory.delete` controls the confirmation Archive/Delete action.
- Permission-sensitive controls remain disabled while the authentication profile is loading.
- Audit actor details prefer the Firestore profile, with Firebase Auth as a fallback.

## Protected areas not changed
- Primovex logo and branding
- Login
- Mobile routes and navigation
- Pulse Orb, preview and drawer
- Theme provider and Theme Lab
- Firebase configuration and Firestore rules
- Other pages and services

## Verification
`npm run build` completed successfully with 2,255 modules transformed.

## Local functional check
Sign in with a Firestore profile whose role is `System Admin` or `Practice Manager`, open Inventory, and confirm that the Edit and confirmation Archive/Delete controls are enabled.
