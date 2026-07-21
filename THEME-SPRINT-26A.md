# Primovex Theme Sprint 26A

Baseline: aurora-stock(13).zip

## Scope
A targeted NHS Blue contrast correction. No branding, Pulse, routing, Firebase, stock workflow or governance files were replaced.

## Changed files
- `src/components/theme/MedTrakThemeProvider.jsx`
- `src/pages/Inventory.jsx`
- `src/components/dashboard/OperationsCentre.jsx`
- `src/pages/Alerts.jsx`

## Fixes
- Added semantic theme tokens for pills, muted pills, tabs, active tabs, AI badges and AI surfaces.
- Corrected the active Inventory tab foreground/background contrast in NHS Blue.
- Corrected the signed-in user pill in Operations Centre.
- Corrected the MedAI confidence badge and Daily Brief panel text/background contrast.
- Retained High Contrast borders and accessibility focus states.

## Preserved
- Approved Primovex logo, size and placement.
- Primovex product name and login branding.
- Theme-aware Pulse Orb, hover card and expanded panel.
- Pulse panel height cap and internal scrolling.
- Existing QA fixes and Vite alias.

## Build note
The uploaded `node_modules` contains Windows Rollup binaries. A Linux build could not run in the packaging environment because `@rollup/rollup-linux-x64-gnu` is not present. The source changes are isolated and should build normally on the original Windows environment.
