# ADR-015: Demo and Security Hardening

## Status

Accepted

## Context

MedTrak+ now contains governance, inventory, Connect and MedAI capabilities. This means it may hold sensitive operational and patient-adjacent information. The platform also needs to be demonstrable to other practices without exposing real patient or governance data.

## Decision

MedTrak+ will include a safe demonstration mode and a dedicated Security Centre.

The demo layer must use synthetic data only and should display anonymised identifiers such as EMIS-style references, initials and dates of birth rather than patient names.

The Security Centre will provide a release-readiness view for authentication, audit, governance security, demo safety, backend-only secrets and DPIA preparation.

Password reset messaging should not confirm whether a user exists.

## Consequences

- The product can be demonstrated more safely.
- Future external release planning can include visible security and privacy checks.
- The platform has a clearer path towards DPIA, IG review and penetration testing.
- Real MFA and admin re-authentication remain future implementation tasks.
