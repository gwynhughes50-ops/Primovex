# Sprint 50.3 — Temperature Device Assignment

Version: Primovex 0.15.19 / Connect Cloud 0.9.30

## Included

- Shared desktop and mobile assignment workflow for connected temperature devices.
- Links each device to a permanent `spaceId`, equipment record and temperature unit.
- External probe or ambient sensor purpose.
- Configurable safe range, excursion delay and alert enablement.
- Immutable assignment audit records.
- Scheduled Tuya sync preserves authoritative registry assignments.
- Out-of-range incidents respect the configured delay and resolve automatically after recovery.
- T13 probe temperature remains primary; ambient temperature, humidity and battery state remain supporting readings.
- Mobile Temperature action now opens the real live device view rather than falling back to Mobile Home.
- Additional Tuya devices can be added as a comma-separated list in the existing protected device-ID secret; each becomes an independently assignable registry record.

## Preservation

- No provider secrets are stored in the client.
- Working Orb voice files are unchanged.
- Existing Space Registry, equipment compatibility cache and NHS theme tokens are retained.
- All connected devices continue using the shared `connected_devices` registry.
