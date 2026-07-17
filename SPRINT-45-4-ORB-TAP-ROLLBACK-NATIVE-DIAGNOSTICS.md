# Sprint 45.4 — Orb Tap Rollback & Native Diagnostics

Version: 0.13.5

## Repair
- Restored the last known working v0.13.3 Orb tap handler and native bridge wrapper.
- Preserved the permanent Android speech-provider `<queries>` manifest declaration.
- Preserved native Android `SpeechRecognizer` diagnostics and callback logging from v0.13.4.
- Removed the synchronous microphone-permission probe introduced in v0.13.4, which could prevent the Orb tap path from progressing in the Android WebView.
- Retained the Compliance theme repair, mobile safe-area treatment, Smart Intelligence foundation, and typed Orb fallback.

## Expected test
Tap the Orb. It should visibly wake immediately, invoke the native Android bridge, and either enter Listening or show a concrete recognition error.
