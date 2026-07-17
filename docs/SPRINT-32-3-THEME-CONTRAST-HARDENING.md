# Sprint 32.3 — Theme Contrast Hardening

## Scope

Focused accessibility and semantic-colour pass for the shared theme engine.

## Changes

- Replaced the desktop signed-in role pill with semantic role badge classes.
- Added readable administrator, standard role and notification badge tokens.
- Replaced Inventory quantity pills with semantic low/healthy stock badges.
- Added fixed badge dimensions and line-height to prevent distorted vertical pills.
- Added explicit NHS Blue/light-theme contrast colours.
- Preserved dark-theme and High Contrast variants.

## Protected areas

No authentication, inventory calculations, stock movement logic, Firebase rules, mobile navigation, Tauri or Practice Pulse calculations were changed.
