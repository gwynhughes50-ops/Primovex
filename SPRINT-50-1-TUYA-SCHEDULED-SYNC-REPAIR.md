# Sprint 50.1 — Tuya Scheduled Sync Repair

Version: 0.15.17

## Repair

The three Tuya values required by unattended synchronization are now securely
bound to every Tuya-aware Cloud Function:

- `TUYA_ACCESS_ID`
- `TUYA_ACCESS_SECRET`
- `TUYA_TEST_DEVICE_ID`

Previously only the access secret was available to the scheduled function.
Consequently the five-minute job completed without importing a device. Manual
frontend settings could not repair unattended synchronization.

## Preserved behaviour

- Tuya credentials remain server-side and are not included in React or Android.
- T13 external probe, ambient temperature, humidity and battery mappings are unchanged.
- Temperature readings continue to feed the shared Device Registry, Temperature,
  incident detection, audit history and Orb read tools.
- Explicit `spaceId` and `fridgeId` assignment remains required before the device
  is treated as an active clinical fridge.

## Deployment

Create the two additional Firebase secrets, retain the existing access-secret
version, and redeploy Functions. Do not commit credential values or device IDs.
