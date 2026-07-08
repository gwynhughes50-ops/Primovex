# ADR-013: MedAI Core

## Status

Accepted

## Context

MedAI features were beginning to appear across several modules: Operations Centre, Governance Intelligence, MedTrak Connect, Inventory Intelligence and MedTrak Mobile. If each screen generated its own AI-style text, the product would become inconsistent and difficult to scale.

## Decision

Create a central MedAI Core service under `src/services/medai`.

The initial MedAI Core contains:

- Daily Brief Engine
- Recommendation Engine
- Insight Engine
- Priority Engine
- MedAI Orchestrator

MedAI recommendations must include:

- title
- domain
- summary
- suggested action
- score
- priority
- estimated completion time
- reasons explaining why it was surfaced

## Security and governance

MedAI must use the same access boundaries as the signed-in user. It should not expose data that the user could not otherwise access.

MedAI suggests actions. Users decide whether to act.

## Consequences

- Operations Centre and MedTrak Mobile can now share the same intelligence layer.
- Future modules can contribute signals to MedAI without changing the UI architecture.
- Explainability is built into MedAI recommendations from the start.
- A future LLM can be added behind the MedAI Core without rewriting the interface.
