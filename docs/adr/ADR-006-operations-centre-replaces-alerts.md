# ADR-006: Operations Centre replaces Alerts

## Status
Accepted

## Context
The previous Alerts page only showed stock and temperature warnings. MedTrak+ is evolving into a wider operational intelligence platform, so the page needs to answer: what needs attention today?

## Decision
The `/alerts` route remains for compatibility, but the visible product experience is now the Operations Centre. Alerts are retained as a widget inside the broader operational dashboard.

## Consequences
- Users get a richer daily operational overview.
- Alerts become one signal within MedAI rather than the only page purpose.
- The dashboard can later ingest SARs, complaints, purchasing, tasks and compliance data.
