# Sprint 46.4 — Orb Data Fabric and Permission Gateway

Version: 0.14.4  
Orb Core: 1.4.0

## Outcome

Orb now reads approved operational domains through one governed response contract. Every connected tool reports its domain, evidence sources, freshness, known/partial/unknown state, confidence, warnings, disclosure level, and withheld fields.

## Connected read-only domains

- Unified Space Registry summary
- Compliance evidence summary
- Operational tasks and escalations
- Active inventory and connected-device alerts
- Existing inventory, emergency drugs, anaphylaxis, temperature, cleaning, maintenance, facilities and operations tools

## Safety and permissions

- Existing capability checks still run before a tool can execute.
- Named staff and audit fields are removed from returned structured data unless the user has audit or administration access.
- Missing or partially unavailable evidence is never described as an all-clear.
- Orb audit records now include the accessed domain, evidence-source count, freshness and known-state classification.
- All new tools are read-only. No stock, compliance, task, alert or Space data is changed by Orb.

## Suggested acceptance questions

- “How many practice spaces are registered?”
- “Are we compliant?”
- “What operational tasks are open?”
- “Are there any active alerts?”
- Repeat a permitted question with a role that lacks the required capability and confirm access is refused.
- Ask about an unavailable source and confirm Orb reports a partial or unknown state rather than claiming everything is safe.

## Protected baseline

The confirmed v0.13.6 native Android voice lifecycle and the Sprint 46.3 clinical intent learning/feedback flows were not changed.
