# Sprint 42.1.2 — Sense Spaces Builder & Mobile Parity

Version 0.10.11

## Purpose
Replace the fixed room list with a user-configurable digital model of the practice building, while keeping Primovex Desktop and Primovex Mobile aligned.

## Desktop
- New Sense Spaces Builder.
- Add and edit spaces from the Sense page.
- Configurable sites, floors and zones.
- Three-floor starter structure: Ground, First and Second Floor.
- Full space template library including consulting, treatment, admin, reception, filing, education, staff, computer, IT admin, conference, toilet, baby changing, sluice, store, plant, cleaners, minor ops, research, kitchen, stairwell, corridor and waiting area.
- Stairwells can link to multiple floors.
- Optional parent-space relationship for cupboards or sub-areas.
- Template-driven capabilities for stock, cleaning, issues, checks, equipment, maintenance, audits, documents and AI.
- Create, edit and archive without changing the permanent Sense identity.
- New spaces remain compatible with Facilities and Smart Tag assignment.

## Primovex Mobile
- New compact Practice Spaces browser under Facilities.
- Site and floor hierarchy visible on mobile.
- Search rooms, kitchens, stairwells and other spaces.
- Compact space detail sheet with capabilities.
- Smart Tag scan action retained.
- Active Sense context remains visible and shared.
- Mobile overlays respect the persistent bottom navigation and Android safe area.

## Release checks
- `npm run build` passed.
- `npm run build:android` passed.
- Desktop login, mobile login and Sense tag flows remain protected regression areas.
