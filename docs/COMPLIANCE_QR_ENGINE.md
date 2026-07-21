# MedTrak+ Compliance QR Engine

Sprint 25 introduces a shared QR / NFC compliance workflow for checks that are currently paper-heavy or spreadsheet-led.

## Product principle

> Walk → Scan → One action → Done. MedTrak records everything else in the background.

The user should not need to search for an asset, enter the location, record the date/time, or decide who to notify. The QR/NFC identity gives MedTrak the context.

## Supported identification methods

- QR code
- NFC tag, using Web NFC where the browser supports it
- Manual asset ID fallback
- Barcode-compatible payloads for future scanners

## Asset model

Collection: `compliance_assets`

Key fields:

- `assetCode` such as `FP-007` or `W-023`
- `assetType` such as `fire_point`, `water_hot`, `water_cold`, `fridge`, `freezer`
- `label`
- `location`
- `department`
- `checkMode`: `pass_fail` or `temperature`
- `frequency`
- `minTempC` / `maxTempC` for temperature checks
- `qrPayload`
- `identificationMethods`
- `lastCheckAt`
- `lastCheckResult`

## Check model

Collection: `compliance_checks`

Every check is immutable and records:

- asset identity
- check result
- user
- time/date
- source, e.g. `mobile_compliance`
- identification method, e.g. QR/NFC/manual
- temperature value where relevant
- configured min/max range
- optional notes

## Pulse Events

If a check fails, MedTrak automatically creates a `pulse_events` record with:

- module: `compliance`
- source: `compliance_qr`
- severity
- asset link
- check link
- status: `open`

The person doing the check does not need to investigate or manually raise an issue.

## Mobile workflow

### Fire point

1. Scan QR or NFC tag.
2. MedTrak identifies the fire point.
3. User taps `All OK` or `Not working`.
4. MedTrak records the audit trail and raises a Pulse Event if failed.

### Water outlet

1. Scan QR or NFC tag.
2. MedTrak identifies the outlet.
3. User enters the temperature.
4. MedTrak checks the configured range and records pass/fail automatically.

## Future enhancements

- NFC tag writing from MedTrak Mobile
- guided compliance rounds by route/order
- printable label templates by asset type
- offline queue for low-signal areas
- photo evidence for failed checks
- recurring schedule engine
- MedAI compliance trend analysis
