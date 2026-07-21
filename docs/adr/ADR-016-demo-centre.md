# ADR-016: Demo Centre

## Status

Accepted

## Context

MedTrak+ needs to be demonstrated safely to staff, partners and future practices. Because the product contains governance, inventory, Connect and operational intelligence workflows, demonstrations must not rely on live NHS or patient-identifiable data.

The previous demo page provided a static preview but did not support different audiences or repeatable demonstration scenarios.

## Decision

Introduce a Demo Centre at `/demo` with selectable synthetic scenarios:

- GP Practice
- Research Practice
- Large Health Centre
- Training Mode

Demo state is stored locally in the browser and can be reset before each demonstration.

The Demo Centre remains public and does not require authentication, but it must never connect to live patient data.

## Consequences

- Demonstrations can be tailored to different audiences.
- Training sessions can start from a predictable baseline.
- The product can be shown without exposing real patient data.
- Future releases can add a full demo database seeding/reset service if required.
