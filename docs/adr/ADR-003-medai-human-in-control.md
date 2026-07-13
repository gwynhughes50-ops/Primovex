# ADR-003: MedAI Assists, Humans Decide

## Status

Accepted

## Context

MedTrak+ will increasingly use AI to prioritise and summarise operational work. Healthcare governance workflows need clear accountability.

## Decision

MedAI may score, suggest, summarise, explain and draft. It should not silently complete governance-critical actions without human review.

## Consequences

- AI outputs should be explainable.
- Suggested actions should be presented as reviewable cards.
- Future automation should keep audit trails and human confirmation for sensitive workflows.
