# Sprint 29B – Practice Administration Hardening

## Changed files

- `src/pages/PracticeAdministration.jsx`
- `src/services/practiceAdminService.js`
- `src/main.jsx`

## Completed

- Added route-level `practiceAdmin.read` protection.
- Added read-only mode for users without System Admin write access.
- Prevented unauthorised full-user collection subscriptions.
- Converted role creation to canonical capability IDs.
- Updated default role templates to the current capability model.
- Made default seeding idempotent and duplicate-safe.
- Added Pulse weighting total validation (must equal 100%).
- Added activate/deactivate controls for sites, departments and roles.
- Added inline success and error feedback.
- Made Platform Mode summary react to the live AuthContext value.
- Removed visible MedTrak+/Sprint 14 wording from this module.
- Applied shared semantic theme classes across the page.

## Protected areas not changed

- Login
- Inventory
- Pulse
- Mobile navigation
- Tauri configuration
- Firebase client configuration
- Primovex logo assets

## Verification

`npm run build` passed with 2,255 modules transformed.

The existing Vite large-chunk warning remains and is outside this sprint's scope.
