# Sprint 46.5 — Orb Accuracy and Trust

Version: 0.14.9  
Orb Core: 1.5.0

## Trust policy

- Unknown evidence caps confidence at 49%.
- Partial evidence caps confidence at 74%.
- Conflicting evidence caps confidence at 49%.
- Stale evidence caps confidence at 79%.
- Temperature evidence becomes stale after 30 minutes; general operational evidence after 24 hours unless a tool supplies an explicit state.
- Answers visibly state evidence freshness and source count.
- Unknown, partial, conflicting and stale answers are explicitly qualified.
- Users are told when named operational details were withheld for their role.

## Regression suite

`npm run test:orb-trust` verifies:

- Emergency drug, anaphylaxis, resus and “recess trolley” language.
- Spaces, compliance, tasks and alerts intent routing.
- Unknown, partial and stale evidence confidence ceilings.
- Permission isolation and named operational-field redaction.

## Protected components

The native Android voice bridge, native voice JavaScript adapter and Orb conversation panel are unchanged from the confirmed v0.14.4 baseline.
