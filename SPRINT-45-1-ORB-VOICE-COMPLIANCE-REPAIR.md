# Sprint 45.1 · Orb Voice Presence and Compliance Repair

Release: v0.13.1

## Delivered

- Repaired the mobile Compliance page so it uses the current Primovex theme tokens rather than the legacy dark MedTrak palette.
- Replaced the violet NFC action styling with the approved Primovex accent treatment.
- Kept the existing compliance workflow and mobile proportions intact.
- Moved the mobile Orb panel and composer fully above the persistent bottom navigation and Android safe-area exclusion zone.
- Added an independently scrolling conversation region.
- Introduced the first Orb Voice Presence state model: sleeping, waking, listening, thinking and follow-up.
- Added a large animated mobile Orb with reduced-motion support.
- Added in-app Web Speech API support where available. Staff can tap the Orb or say “Orb” while the panel is open.
- Speech is submitted only when the recognition pause/end event occurs.
- Added a 12-second follow-up conversation window before Orb returns to sleep.
- Added entity-aware routing for questions such as “Tell me about Fridge 2”.
- Added a read-only cold-chain unit status tool that checks the unit registry and recent temperature readings.
- Renamed parser confidence in the UI to Evidence confidence and removed it for unmatched requests.

## Validation

- Production Vite build completed successfully.
- Desktop routes and existing Smart Intelligence foundation were preserved.

## Platform note

Wake-word behaviour in this sprint operates while the Orb panel is open and the browser/WebView exposes speech recognition. Always-on background hotword detection will require a later native Android/Tauri implementation and explicit microphone/privacy controls.
