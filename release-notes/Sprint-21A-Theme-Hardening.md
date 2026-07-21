# Sprint 21A: Theme Hardening

## Summary

Sprint 21A improves theme reliability across MedTrak+, especially where light themes could hide text or make components difficult to read.

## Added

- Theme Lab page at `/theme-lab`.
- Theme token utility classes for new UI work.
- Contrast checks for the active theme.
- Component preview states for desktop, mobile and forms.
- Theme release checklist.
- `docs/THEME_GUIDELINES.md`.

## Changed

- Strengthened global theme safety-net CSS.
- Improved support for light themes where legacy components use dark-theme Tailwind classes.
- Improved protection against dark text on dark backgrounds and white text on light backgrounds.

## Build

`npm run build` passed.
