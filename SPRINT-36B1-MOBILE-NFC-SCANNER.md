# Sprint 36B.1 — Mobile NFC Scanner

## Purpose
Add a mobile-first NFC entry point to Primovex Sense without changing the existing secure deep-link model.

## Delivered
- Mobile Home quick action: Scan NFC tag
- Facilities quick action: Scan room or asset tag
- Android Web NFC scan sheet
- iPhone / unsupported-browser tap-to-open guidance
- Validation that scanned URLs belong to the current Primovex origin
- Support for registered Space and Asset Passport deep links
- Calm loading, success, error, and cancellation states

## Security boundary
The scanner accepts only same-origin Primovex Sense URLs using `/sense/open/space/:id` or `/sense/open/asset/:id`. Operational data is not stored on the tag.

## Protected areas
No changes to authentication, Firebase rules, inventory calculations, Pulse calculations, mobile navigation, Tauri, or desktop layout.
