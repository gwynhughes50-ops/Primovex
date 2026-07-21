# MedAI Roadmap

## MedAI Principle

MedAI assists, explains and prioritises. Humans remain responsible for governance-critical decisions.

## Phase 1 - Operational Intelligence

- Daily Brief
- AI Priority Score
- Suggested Actions
- Practice Pulse explanations
- Inbox prioritisation
- Transparent deterministic scoring before LLM connection

## Phase 2 - Predictive Intelligence

- Predict stock shortages
- Predict SAR deadline risk
- Predict complaint escalation risk
- Predict compliance drift
- Predict purchasing bottlenecks

## Phase 3 - Workflow Intelligence

- Natural language operational search
- Meeting minute drafting
- Governance summaries
- Policy and report drafting support
- Automatic creation of draft actions for review

## Phase 4 - Practice Copilot

- Ask: "What needs attention today?"
- Ask: "Why has Pulse dropped?"
- Ask: "Show overdue governance actions"
- Ask: "What changed this week?"
- Voice-ready operational assistant

## Phase 5 - Cross-Practice Intelligence

- Benchmarking
- Shared trend analysis
- Multi-practice operational risk detection
- Enterprise reporting

## Current Sprint 18A Implementation

The current implementation introduces deterministic MedAI helpers in `src/services/medaiService.js`:

- `calculateAiPriorityScore`
- `enrichWithMedAi`
- `buildDailyBrief`
- `buildSuggestedActions`
- `buildPulseExplanation`
- `buildChangedSinceYesterday`

This allows the UI to behave intelligently now while keeping future LLM integration clean and modular.

## Sprint 18B Additions

### Deterministic MedAI Features Added

- Priority score explanations.
- Next-best-step recommendations.
- Operational risk scan.
- Mobile top-priority brief.

### Next AI Step

Add a daily operational snapshot collection so MedAI can compare today against yesterday using real historical data rather than live-count placeholders.

Recommended future collection:

```text
operation_snapshots/{snapshotId}
  date
  organisationId
  siteId
  pulseScore
  activeCount
  criticalCount
  highCount
  overdueCount
  completedCount
  moduleCounts
  createdAt
```

This will unlock true "What's Changed Since Yesterday" reporting.
