# Sprint 36A — Primovex Sense Foundation

## Purpose
Create a hardware-independent foundation for context-aware spaces and tracked assets without introducing real BLE scanning or new Firestore writes.

## Added
- First-class Spaces registry derived from the existing Facilities room identities.
- Sense provider abstraction and provider registry.
- Mock BLE provider for development and workflow validation.
- Manual space confirmation.
- Asset Passports with home and current space.
- Mobility profiles for fixed and shared equipment.
- Room readiness model combining cleaning, expected equipment and maintenance.
- Space-specific operational timeline.
- Local versioned Sense store (`primovex.sense.v1`).
- New desktop `/spaces` route and Sense navigation item.

## Safety boundary
- No background BLE scanning.
- No real beacon SDK.
- No continuous staff or patient tracking.
- No new Firestore collections or rules.
- No changes to Facilities, Inventory, Pulse, Login, Mobile navigation or Tauri business logic.

## Enables next
- Real iBeacon/Eddystone provider.
- Beacon pairing and signal-confidence calibration.
- NFC confirmation provider.
- Context-aware mobile banner and AI tools.
- Shared asset location workflows and inspection packs.
