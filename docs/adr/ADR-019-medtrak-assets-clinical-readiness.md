# ADR-019 - MedTrak Assets and Clinical Readiness

## Status

Accepted

## Context

Emergency drug kits, anaphylaxis boxes and clinical equipment are not ordinary stock lists. Once boxed medicines are split into individual vials, the manufacturer's barcode may no longer be present or practical to scan. Many practices also have non-barcoded equipment that needs PAT testing, calibration, servicing, location tracking and verification.

## Decision

MedTrak+ will introduce a physical asset identity model. Emergency drug kits and anaphylaxis boxes are the first implementation of this pattern.

Each physical asset should have:

- A stable MedTrak Asset ID.
- A QR label that identifies the physical kit or asset.
- A location.
- Expected contents or required checks.
- Readiness status.
- Verification history.
- Future links to PAT, calibration, servicing, Connect telemetry and MedAI.

## Consequences

- The app no longer depends on manufacturer barcodes for kit-level verification.
- Practices can retrofit existing kits and equipment using printed MedTrak QR labels.
- Mobile scan-to-open workflows become possible for caretakers, nurses and administrators.
- Emergency drugs, anaphylaxis boxes, PAT assets, clinical equipment and connected devices can eventually share one asset model.
- MedAI can reason about clinical readiness rather than only stock quantity.

## Follow-up

Future sprints should add:

- Full MedTrak Assets registry.
- QR scanner routing hub.
- Asset templates and template versioning.
- PAT/calibration linkage.
- NFC tag support.
- Local/offline QR rendering.
