# Primovex Sprint 48.0 — Android Barcode Scanner Repair

Version 0.15.4

- Native Android scanning now uses the Tauri barcode plugin's windowed camera mode.
- Primovex keeps a visible NHS Blue scan target, status, manual-entry fallback and Close/Cancel controls above the camera preview.
- Closing the overlay calls the native cancel command and restores the mobile shell.
- Successful results return to the existing stock lookup and movement workflow.
- Browser scanning remains unchanged.
- Clinical reconciliation, authentication and native Orb voice files are unchanged.
