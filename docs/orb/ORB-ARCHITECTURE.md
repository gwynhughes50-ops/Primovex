# Orb Core v1 Architecture

## Components
- `OrbEngine`: single orchestration entry point.
- `IntentEngine`: maps language to approved operational intent.
- `ContextEngine`: normalises user, role, capabilities, site, space, module and workflow.
- `PermissionGateway`: applies disclosure controls before a response leaves Orb.
- `KnowledgeRegistry`: records connected and planned operational domains.
- `ConfidenceEngine`: normalises confidence and assigns a safety band.
- `AuditEngine`: records metadata about access and response generation, never raw audio.
- `MemoryEngine`: stores non-clinical operational interaction outcomes.
- `FeedbackEngine`: captures structured correction outcomes for future improvement.

## Response contract
Every response can include:
- answer
- intent
- confidence and confidence band
- evidence and sources
- modules used
- warnings
- suggested actions
- withheld fields
- audit ID

## Boundaries for Sprint 46.0
- Read-only operational access remains enforced.
- Existing native Android voice lifecycle is unchanged.
- Existing approved tools remain the source of operational facts.
- No autonomous stock changes or clinical actions are permitted.
