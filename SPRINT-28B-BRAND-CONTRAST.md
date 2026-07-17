# Sprint 28B — Primovex Brand Contrast

## Scope

A deliberately small branding patch applied to Sprint 28A.

## Changed

- Added `public/branding/primovex-logo-dark.png`.
- Updated `src/components/brand/PrimovexLogo.jsx` to select the correct logo automatically:
  - light-background artwork for NHS Blue and Clinical Green;
  - white-wordmark dark-background artwork for Primovex Midnight, Midnight Purple and High Contrast.
- Added an optional `variant` prop (`auto`, `light`, or `dark`) for future controlled placements.

## Protected and unchanged

- Approved Primovex icon geometry.
- Header and login sizing.
- Pulse Orb, drawer and theme behaviour.
- Theme provider values and Theme Lab.
- Authentication, mobile routes and application workflows.
