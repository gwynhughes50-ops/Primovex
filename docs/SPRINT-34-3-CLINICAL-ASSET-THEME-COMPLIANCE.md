# Sprint 34.3 — Clinical Asset Theme Compliance

## Scope

Correct the shared Emergency Drugs and Anaphylaxis Boxes checklist so the selected Primovex theme defines the page surface and hero treatment, while red, amber and green remain reserved for genuine clinical readiness states.

## Changes

- Removed readiness-driven full-page hero gradients.
- Added a theme-derived hero surface using the active Primovex accent and panel tokens.
- Restricted semantic danger, warning and success colours to the readiness status card and item-level states.
- Migrated the shared checklist surfaces, borders, controls and typography to Primovex theme variables.
- Applied the fix once in `ClinicalAssetChecklist.jsx`, covering both Emergency Drugs & Equipment and Anaphylaxis Boxes.

## Protected areas

No inventory calculations, checklist readiness calculations, authentication, Firebase rules, mobile navigation, Tauri or branding logic were changed.

## Validation

- `npm run build` passed.
- Existing Vite large-chunk warning remains unchanged.
