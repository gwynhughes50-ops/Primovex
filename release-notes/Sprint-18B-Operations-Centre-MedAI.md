# Sprint 18B - Operations Centre + MedAI Expansion

## Objective

Make the Alerts/Operations Centre page feel like the full-width operational command centre for MedTrak+, while adding useful deterministic MedAI features that are explainable and safe.

## Changes

### Layout

- Updated `src/layout/Layout.jsx` to remove the previous `max-w-7xl` page constraint.
- Main authenticated pages now use the full available width with sensible padding.
- Operations Centre now scales better on large desktop displays.

### Operations Centre

- Expanded hero layout and Practice Pulse panel.
- Added MedAI Daily Brief summary text.
- Added wider priority list for the operational inbox.
- Added explainable MedAI reasoning per priority item.
- Added next-best-step guidance per item.
- Added Operational Risk Scan cards.
- Added improved AI Suggested Actions with estimated effort.
- Added a future build panel covering daily snapshots, escalation lane and LLM brief.

### MedAI Service Layer

- Expanded priority scoring factors:
  - Explicit priority
  - Overdue status
  - Deadline proximity
  - Module risk
  - Escalation status
  - Assigned owner
  - Statutory or patient-facing signal
- Added transparent explanation generation.
- Added next-best-step generation.
- Added operational risk scan helper.

### Mobile Parity

- Mobile home now surfaces top MedAI priority.
- Mobile includes next-best-step guidance for the highest-ranked item.
- Practice Pulse explanation remains visible on mobile.

## Notes

This remains deterministic AI logic. It is safe, explainable and auditable. LLM-generated briefings should only be connected once daily snapshots, permissions and governance controls are ready.
