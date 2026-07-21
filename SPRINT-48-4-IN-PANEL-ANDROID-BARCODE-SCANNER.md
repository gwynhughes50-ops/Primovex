# Sprint 48.4 – In-Panel Android Barcode Scanner

Version 0.15.8

- Replaces the unreliable native-behind-WebView preview composition with an in-panel camera preview rendered directly inside Primovex.
- Uses the existing ZXing multi-format decoder for live EAN, UPC, Code 128, QR and other supported barcode formats.
- Keeps the rear camera, visible framing guide, automatic recognition, vibration confirmation, Close/Cancel actions and manual fallback in one safe-area-aware mobile screen.
- Stops all camera tracks when scanning completes, the panel closes, the session locks or the component unmounts.
- Preserves the masked numeric PIN repair and the confirmed working Orb native voice baseline.
- Makes no changes to stock, reconciliation, readiness, permissions or audit data.
