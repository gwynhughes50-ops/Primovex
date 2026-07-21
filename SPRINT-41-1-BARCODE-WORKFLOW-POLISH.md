# Sprint 41.1 — Barcode Workflow Polish

Version: 0.10.7

## Included
- Native Android camera scanning with permission recovery.
- Desktop/browser scanner retained.
- Success confirmation and optional haptic feedback.
- Unknown barcode recovery: search, add item, scan again or cancel.
- Mobile quick action sheet for use, receive, reorder, details and Primovex AI.
- Desktop and mobile Tauri capabilities separated so mobile-only scanner permissions do not break Windows builds.

## Mandatory regression
- Login on desktop and mobile.
- Desktop production and installer builds.
- Android arm64Debug build and physical device install.
- NHS Blue theme and alternate theme switching.
- Scan known and unknown EAN/UPC/Code 128 barcodes.
- Deny camera permission and verify settings/manual recovery.
- Use Stock, Receive Stock and Reorder from the scan result.
