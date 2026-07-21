# ADR-017: Platform Modes

## Status
Accepted

## Context
MedTrak+ is now used for live operational work, product demonstrations, training and development testing. Relying only on `.env` flags makes switching between these contexts too technical and too easy to misunderstand during demonstrations.

## Decision
Introduce Platform Modes as a first-class product concept:

- Live
- Demo
- Training
- Staging

Modes are selectable through Practice Administration and visible through a persistent banner. Demo and training scenarios use synthetic data and should not contain live patient-identifiable information.

## Consequences
- Product demonstrations are easier and safer.
- Staff training can happen without affecting live records.
- Users can clearly see which mode they are in.
- Future data services should respect the selected platform mode when deciding whether to read live Firebase data or synthetic scenario data.

## Future work
- Add backend-enforced environment separation.
- Add training progress tracking.
- Add guided sales/demo walkthroughs.
- Add audit events for platform mode switching.
- Add resettable seeded demo/training datasets in Firestore or local IndexedDB.
