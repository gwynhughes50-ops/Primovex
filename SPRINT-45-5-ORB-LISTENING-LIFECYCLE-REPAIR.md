# Sprint 45.5 — Orb Listening Lifecycle Repair

Version: 0.13.6

## Repair

Android diagnostics proved that native speech recognition successfully reached `onReadyForSpeech`, but the React effect cleanup immediately called both `stopListening()` and `cancelListening()` when the voice state changed from waking to listening.

The browser fallback callback previously captured `voiceState`, which made `beginListening` change identity on every voice-state transition. Because the panel lifecycle effect depended on `beginListening`, React ran the cleanup and terminated the native recogniser as soon as it became ready.

## Change

- Added a stable `voiceStateRef` for browser fallback callbacks.
- Removed `voiceState` from the `beginListening` callback dependency list.
- Preserved native recognition across `WAKING → LISTENING` state changes.
- Native listening now stops only on explicit sleep/cancel, panel close, final result, Android error, foreground loss, or genuine timeout.
- Existing Android diagnostics and speech-provider manifest query are preserved.
