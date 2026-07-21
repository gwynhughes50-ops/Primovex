# Primovex v0.15.11 — Native Android Barcode Scanner

## Fixed

- Replaced Android WebView barcode decoding with a dedicated native CameraX scanner.
- Added Google ML Kit barcode recognition for EAN, UPC, Code 128, QR and other supported formats.
- Added continuous frame analysis, rear-camera autofocus, centre focus and tap-to-refocus.
- Added a native Close button and Android Back handling so scanning never traps the user.
- Returns the decoded barcode directly to the existing Primovex stock workflow.
- Preserved browser scanning for Developer Mobile Preview.
- Preserved Orb native voice, NHS Blue styling, login, role permissions and existing inventory behaviour.

## Verification

- Vite production build passed: 2,375 modules.
- Complete signed Android universal release build passed, including Kotlin, CameraX and ML Kit compilation.
- Version: 0.15.11 / Android version code 15011.

## Phone test

Install the v0.15.11 APK, open Scan Stock, and centre the complete barcode inside the blue frame. A successful read closes the native scanner and returns the number to Primovex.