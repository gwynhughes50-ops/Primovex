# Sprint 38 - Smart Home and Shared Clinical Checklist

## Phase 1: Smart Home

- Reframed Dashboard as Home.
- Added per-user widget visibility and ordering.
- Added role-based defaults.
- Added profile sync through `users/{uid}.dashboardPreferences`.
- Added reset-to-role-default behaviour.
- Kept all detailed modules available outside Home.

## Phase 2: Shared Clinical Checklist

- Added a shared responsive item-row component used by both Emergency Drugs and Anaphylaxis Boxes.
- Increased Batch / Serial and Notes working space.
- Added date input for expiry fields.
- Disabled non-applicable fields with explanations.
- Improved desktop, tablet and mobile layout.
- Preserved checklist calculations, Firestore records and PDF export logic.

## Protected areas

No changes to authentication, Firebase rules, inventory calculations, Welsh concerns workflow, Sense, Tauri, or mobile navigation.
