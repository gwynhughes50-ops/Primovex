# ADR-005: Alerts Become Operations Centre

## Status

Accepted

## Context

The Alerts page was becoming too narrow for MedTrak+'s platform direction. The product needs a central operational control room.

## Decision

The Alerts route will evolve into the Operations Centre while preserving routing compatibility.

## Consequences

- `src/pages/Alerts.jsx` now delegates to `OperationsCentre`.
- The product language changes from reactive alerts to operational intelligence.
- Future dashboards, Inbox, Pulse and MedAI features should converge around Operations Centre.
