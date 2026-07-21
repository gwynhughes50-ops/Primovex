# Sprint 48.3 – Native Camera Surface Repair

Version 0.15.7

- Corrects the final opaque WebView document surface that covered the working Android CameraX preview.
- Applies and removes scanner transparency on both the HTML root and document body for the full native scanner lifecycle.
- Preserves the NHS Blue scanner overlay, safe-area clearance, Close/Cancel controls, manual barcode fallback and all-format ML Kit detection.
- Retains the masked numeric mobile PIN repair from v0.15.6.
- Does not change Orb native voice, inventory data, reconciliation, permissions or readiness state.

Diagnostic evidence

The supplied Android log confirmed that the rear camera opened, CameraX bound Preview and ImageAnalysis, PreviewView received its surface, and the capture session reached OPEN with no camera error. The remaining white/grey screen was therefore the opaque HTML document surface above the native preview.
