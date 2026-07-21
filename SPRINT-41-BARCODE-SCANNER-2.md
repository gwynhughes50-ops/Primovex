# Sprint 41: Barcode Scanner 2.0

Version: 0.10.6

## Goal

Replace the browser-only mobile scanner with Tauri's native barcode scanner so Android requests camera permission correctly and barcode capture works reliably on a physical device.

## Included

- Native Android and iOS barcode scanner plugin.
- Camera permission check and native permission request.
- Direct route to Android application settings when permission is blocked.
- Rear-camera scanning for EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, ITF, Codabar, Data Matrix and QR codes.
- Existing manual barcode fallback retained.
- Existing browser and desktop ZXing scanner retained.
- Theme-safe fallback sheet and clear recovery messages.

## Android installation note

This release adds a native Tauri plugin. Close Android Studio, remove the generated `src-tauri/gen/android` folder, and run `npm run android:init` before reopening Android Studio. Select `arm64Debug` for a modern Samsung phone.

## Protected regression areas

- Login flow.
- Desktop dashboard.
- Mobile Smart Home and centred Primovex AI action.
- Inventory barcode matching.
- Use Stock workflow.
- Manual barcode entry.
- NFC workflow.

## Device test

1. Tap Scan.
2. Approve the Android camera prompt.
3. Scan an EAN-13 and Code 128 barcode.
4. Confirm the matching stock item opens.
5. Deny permission and confirm Open Android settings appears.
6. Confirm manual entry still works.
