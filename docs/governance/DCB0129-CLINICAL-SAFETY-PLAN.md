# Primovex DCB0129 Clinical Safety Plan — Initial Draft

Status: **Open — not clinically safety assured**

## Required governance

- Appoint a suitably qualified Clinical Safety Officer.
- Define the product scope, intended use, users, environments and safety boundaries.
- Establish a Clinical Risk Management Plan and controlled Hazard Log.
- Produce a Clinical Safety Case Report for the released configuration.
- Review safety impact for every material modification.
- Maintain post-deployment safety-incident monitoring.
- Give deploying organisations the information needed for their DCB0160 obligations.

## Initial hazards for formal review

| Hazard | Potential consequence | Existing design control | Required evidence / work |
|---|---|---|---|
| Wrong patient selected | Information disclosed or action filed against another patient | Patient match marked unverified; live data locked | Human verification design, usability test, CSO review |
| AI extraction or summary error | Incorrect clinical or administrative action | Proposal-only design; source document remains visible | Evaluation dataset, acceptance thresholds, failure testing |
| Urgent document not prioritised | Delay to care | Priority queue concept | SLA rules, escalation path, monitoring and downtime testing |
| Incorrect routing | Work reaches wrong team or is missed | Human route action and immutable event | Undo/escalation design and end-to-end testing |
| Duplicate or lost ingestion | Duplicate work or missing correspondence | Gateway not yet enabled | Idempotency, reconciliation and dead-letter queue |
| Unauthorised access | Confidentiality breach | Authentication, capabilities, practice scope, synthetic-only rules | MFA, tenant penetration test, access-review evidence |
| Orb gives over-confident answer | User relies on incomplete or incorrect information | Permission tools and confidence language | Domain validation, evidence links, safe-refusal tests |
| System unavailable | Workflow interruption | No live dependency yet | Documented downtime and recovery process |

Hazard acceptance and residual-risk decisions must be made by the appointed CSO, not by the software alone.

