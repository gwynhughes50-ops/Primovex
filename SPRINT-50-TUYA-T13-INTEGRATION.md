# Sprint 50 — Tuya T13 Temperature Integration

Version: 0.15.15

## Device contract

- Daytech T13 / TH01WH-TY, direct 2.4 GHz Wi-Fi
- `temp_current_external` (scale 1): external probe temperature
- `temp_current` (scale 1): ambient temperature
- `humidity_value` (scale 0): ambient humidity
- `battery_state`: low, middle or high

## Architecture

Tuya Cloud is accessed only by Firebase Functions. The React and Android bundles
contain no Tuya secret. The provider signs Tuya OpenAPI requests, obtains a
short-lived token, reads device details/status and maps the T13 into the shared
Device Registry.

Probe readings are written to `connect_device_readings` and `temperature_logs`.
Out-of-range probe readings create or update a deterministic temperature
incident. Existing Temperature dashboards and permission-aware Orb cold-chain
tools consume those collections.

## Required backend environment

- `TUYA_REGION=central_eu`
- `TUYA_ACCESS_ID`
- `TUYA_ACCESS_SECRET`
- `TUYA_TEST_DEVICE_ID`
- `TUYA_DEVICE_CONFIG_JSON` (non-secret assignment map)

Example assignment shape:

```json
{
  "device-id": {
    "name": "Vaccine Fridge 1",
    "type": "fridge",
    "spaceId": "space-id",
    "fridgeId": "fridge-id",
    "site": "Main Practice",
    "room": "Treatment Room",
    "min": 2,
    "max": 8
  }
}
```

Do not commit real credentials or device identifiers. Configure them through
Firebase Functions environment/secrets. Until assignment is explicit, the
device remains `needs-assignment`.
