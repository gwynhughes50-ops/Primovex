# Primovex Sprint 48.2 — Native Scanner Portal and PIN Repair

Version 0.15.6

- Renders native scanner controls through a portal outside the React application root.
- Hides the opaque React root while CameraX is active, providing a clear camera preview path.
- Uses the barcode plugin's all-formats mode to avoid Android format-filter configuration failures.
- Retains visible Close, Cancel, Retry and manual-entry controls.
- Converts mobile PIN and confirmation inputs to numeric password fields with correct dot masking.
- Restores the application root and theme immediately after scanner completion or cancellation.
