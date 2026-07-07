# Sprint 18A - Product Foundation

## Summary

This release begins the MedTrak+ product foundation sprint.

It introduces the documentation framework, Architecture Decision Records, the MedAI deterministic service layer and the first Operations Centre redesign foundation.

## Code Changes

- Replaced the legacy Alerts route with the Operations Centre component.
- Added `src/services/medaiService.js`.
- Updated `src/components/dashboard/OperationsCentre.jsx` with:
  - MedAI Daily Brief
  - AI priority scoring
  - AI suggested actions
  - Practice Pulse explanation
  - What changed since yesterday placeholder metrics
  - Inbox integration using existing notifications hook
- Updated `src/mobile/MobileHome.jsx` with:
  - MedAI Daily Brief
  - Practice Pulse score
  - Pulse explanation
  - Priority counts including overdue

## Documentation Changes

- Added product vision and principles.
- Added roadmap, sprint history and feature matrix.
- Added AI roadmap and architecture notes.
- Added security, deployment, design system and multi-tenancy notes.
- Added ADRs for major product decisions.
- Moved version-specific changelogs into `docs/releases/`.

## Validation

A full Vite build could not be completed in the container because the uploaded archive's existing `node_modules` is missing Rollup's optional native package. The changed JavaScript/JSX files were syntax-checked successfully using Babel parser.

## Next Sprint

Sprint 18B should continue the Operations Centre work with richer widgets, daily snapshots, live feed improvements and deeper Inbox integration.
