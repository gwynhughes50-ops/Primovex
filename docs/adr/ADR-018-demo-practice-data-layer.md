# ADR-018: Demo Practice Data Layer

## Status

Accepted

## Context

MedTrak+ needs a demonstration and training environment that can be shown safely to other practices without exposing real operational or patient data. Previous demo functionality changed platform mode but did not consistently populate product screens with meaningful data.

## Decision

Create a dedicated synthetic demo dataset and wire safe platform modes into the existing hooks/services used by the application.

The demo dataset includes synthetic stock, governance, Connect, activity, notification and MedAI-ready data. When the platform is in Demo, Training or Staging mode, selected hooks and services return synthetic data instead of connecting to live Firestore.

## Consequences

- Demo mode feels like a working practice rather than an empty environment.
- Training mode can be used safely for staff onboarding.
- Live Firestore data is not used or modified in synthetic modes.
- Future features should add matching synthetic data so demos remain coherent.

## Safety Rules

- No real patient names or identifiers are stored in demo records.
- Demo governance records use EMIS-style synthetic identifiers, initials and dates of birth only.
- Writes in synthetic governance mode are no-ops unless a future local demo-state engine is introduced.
