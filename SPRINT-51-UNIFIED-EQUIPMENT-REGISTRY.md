# Sprint 51 — Unified Equipment Registry

Version: 0.15.16

## Outcome

Primovex now has one equipment identity shared by Facilities, Sense, Connected
Practice, Temperature, PAT and Orb. Existing Facilities and Sense assets are
migrated into the protected local registry on first use; legacy stores are kept
as migration sources and are not deleted.

## Included

- Four-step equipment registration wizard in Facilities.
- Permanent `equipmentId`, Space assignment and equipment passport.
- QR route, barcode, NFC and optional BLE identity fields.
- Optional PAT and service scheduling.
- Optional connected-device assignment, including Tuya/Smart Life.
- External-probe and temperature threshold configuration.
- Connected Practice devices are enriched from their equipment passport.
- PAT assets created in Compliance receive an `equipmentId`.
- PAT-required equipment registered elsewhere appears in the PAT register.
- Sense and Facilities consume the same equipment collection.
- Supplier navigation now uses a delivery-truck icon, distinct from Facilities.

## Safety

- No credentials or provider secrets are stored in equipment records.
- Tuya Access Secret remains in Firebase Secret Manager.
- Registry migration is additive and preserves legacy source data.
- No automatic stock, PAT result or readiness changes occur during registration.

## Regression focus

- Desktop login and navigation.
- Facilities Equipment registration and movement.
- Sense Space equipment lists.
- Compliance PAT register.
- Connected Practice and Temperature device lists.
- Mobile login, Orb voice and scanning.
- NHS Blue theme and safe-area layouts.
