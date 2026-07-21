# Sprint 45.2 · Native Android Orb Voice

Version 0.13.3

- Added Android RECORD_AUDIO permission.
- Added foreground-only native Android SpeechRecognizer bridge through a tightly scoped JavaScript interface.
- Added runtime microphone permission request.
- Added native partial/final transcript events and visible voice errors.
- Stops microphone capture whenever Primovex leaves the foreground.
- Orb tap now requests permission and starts native listening on Android.
- Browser speech recognition remains as a non-Android fallback.
- Added an 8-second Orb request timeout so typed questions cannot hang silently.
- Wake-word listening is deliberately deferred until tap-to-speak is proven on real devices.
