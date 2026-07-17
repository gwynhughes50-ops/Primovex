# Sprint 44.6 - Role-Adaptive Mobile Foundation

Version: 0.12.0

## Purpose

Primovex Mobile is now designed around operational work rather than being a small copy of desktop.
The mobile start screen adapts to the authenticated user's role and prioritises the shortest path to the actions that role performs most often.

## Included

- Role-adaptive mobile start experiences for clinical staff, cleaners, caretakers/facilities teams, managers and general users.
- A prominent single primary action per persona.
- Active Space context shown at the top of the mobile workflow.
- Unified room/Space identification by NFC or QR/barcode.
- QR/barcode Space scans resolve against the same Unified Space Registry as NFC.
- Existing mobile stock scanner retained and prioritised for clinical roles.
- Cleaner and caretaker workflows prioritise scan Space, complete work and report issue.
- Manager mobile retains the existing operational overview beneath the new command layer.
- Shared mobile intent contract added as the foundation for future Orb voice commands, Clarence/Druid and other integrations.
- NHS blue theme and existing desktop navigation left unchanged.

## Product rule

Role + authenticated identity + spaceId + intent should produce the shortest safe action path.
Routine mobile tasks should normally require no more than two meaningful interactions after the item or Space is identified.

## Protected areas

- Desktop Adaptive Navigation Shell
- Unified Space Registry and Firestore sync
- Sense session and NFC deep links
- Android signing and app-link configuration
- Login and permission gates
- Existing mobile bottom navigation and safe-area handling
