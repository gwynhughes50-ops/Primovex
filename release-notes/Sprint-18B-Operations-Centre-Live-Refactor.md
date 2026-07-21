# Sprint 18B - Operations Centre Live Route Refactor

## Summary
The live `/alerts` route has been replaced with a wider, professional Operations Centre layout. Alerts are now presented as one operational widget rather than the whole page.

## Changes
- Renamed navigation label from Alerts to Operations.
- Widened the main application shell from `max-w-7xl` to a full-width 1800px workspace.
- Added MedAI Operations service for deterministic priority scoring and suggested actions.
- Added MedAI Daily Brief.
- Added Practice Status banner.
- Added Today's Priorities widget.
- Added What's Changed Since Yesterday widget.
- Added AI Suggested Actions widget.
- Added My Queue widget.
- Added Live Activity widget.
- Preserved existing alert settings, active/resolved tabs and resolve/unresolve behaviour.
- Removed duplicate nested `src/src` trees to prevent editing the wrong source tree again.

## Verification
- JSX syntax parsed successfully with Babel parser for `src/pages/Alerts.jsx`.
- JS syntax parsed successfully with Babel parser for `src/services/medAiOperationsService.js`.
- Full Vite build could not complete because the uploaded node_modules is missing Rollup's optional native package `@rollup/rollup-linux-x64-gnu`.

## Known Notes
The MedAI layer is deterministic for now. It is designed so an LLM-backed Daily Brief can be added later without redesigning the UI.
