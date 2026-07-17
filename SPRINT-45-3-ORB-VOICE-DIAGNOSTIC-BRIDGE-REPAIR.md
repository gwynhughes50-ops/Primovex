# Sprint 45.3 — Orb Voice Diagnostic Bridge Repair

Version: 0.13.4

## Changes

- Permanently declares Android speech recognition provider visibility in the source manifest.
- Adds detailed `PrimovexVoice` Logcat instrumentation for permission, recognizer creation, readiness, speech, results, errors, lifecycle stops, and JavaScript event dispatch.
- Adds native diagnostic payloads to the JavaScript bridge.
- Introduces a real `Starting microphone…` state.
- Orb only displays `Listening` after Android fires `onReadyForSpeech`.
- Surfaces Android speech error codes in the user-facing message.
- Preserves foreground-only microphone behaviour.

## Android verification

Run:

```powershell
adb logcat -c
adb logcat | Select-String -Pattern "PrimovexVoice|SpeechRecognizer|RecognitionService"
```

Then tap Orb, speak a test request, and inspect the callback sequence.

## Build verification

`npm run build` completed successfully on 17 July 2026.

The Android APK must be compiled on the Windows development machine with the configured Android/Rust toolchain.
