# Primovex Governed Audit Operating Model

Status: engineering foundation; controller approval required before live clinical use  
Version: 0.15.38  
Primary baseline: NHS Wales  
Adopted overlay: NHS England

## Purpose

The governed audit ledger supports accountability, investigation, clinical-safety evidence and detection of inappropriate access. It must not become a duplicate clinical record or a store for raw patient content.

## Required evidence

Every governed event records a server-verified actor UID and role, practice and site, server time, action, module, target type and identifier, outcome, permission decision, source application/version, correlation ID, sequence, previous hash and integrity hash. Metadata is minimised and rejects common patient, credential, prompt, transcript and raw-document fields.

Raw microphone audio is not audited. Orb records the governed intent, modules consulted, confidence, evidence counts, disclosure decision, withheld-field count and duration. A future live clinical release must add approved pseudonymous record references and evidence identifiers without copying patient content into the ledger.

## Responsibilities

| Responsibility | Accountable role | Minimum activity |
|---|---|---|
| Audit policy and lawful use | DPO / IG Lead | Approve purpose, access, retention and disclosure rules |
| Confidentiality monitoring | Caldicott Guardian / IG Lead | Risk-based spot checks and investigation of complaints |
| Security monitoring | SIRO / Security Lead | Review failed access, privileged activity and anomalous patterns |
| Clinical workflow assurance | Clinical Safety Officer | Review high-risk ClinFlow decisions and audit-related hazards |
| Records management | Records Manager | Approve record classes, retention triggers, legal holds and disposal |
| Platform operation | Service Owner | Monitor ingestion failure, availability, backup and restoration |

## Review schedule

- Daily automated checks: ledger ingestion failures, sequence gaps, hash-chain discontinuity and unusual privileged activity.
- Weekly operational review: failed/denied actions, exports, high-risk configuration changes and unresolved exceptions.
- Monthly governance sample: sensitive record access, ClinFlow routing/triage, role changes and audit-reader activity.
- Quarterly access review: audit readers, administrators, service accounts and joiner/mover/leaver evidence.
- Incident review: immediate search and preservation following a complaint, suspected unlawful access, breach or clinical-safety event.

## Retention and holds

The ledger carries `security_and_governance_audit` as its record class. The controller and Records Manager must approve the retention trigger and period before live use. Legal, complaint, inquiry and clinical-safety holds must suspend disposal. Soft archive is not deletion. Backups and exported evidence must follow the same classification and approved disposal process.

## Current limitations

- Real ClinFlow patient data remains blocked.
- This release does not claim WIG Toolkit, DSPT, DTAC, DCB0129 or DCB0160 completion.
- Hash chaining detects accidental or client-side alteration; it is not independent external notarisation against privileged infrastructure administrators.
- Some legacy domain collections remain outside the central ledger and require phased migration.
- Failed unauthenticated logins remain in Firebase/Google Cloud authentication logs rather than the application ledger.
- Retention automation, legal holds, SIEM forwarding and anomaly alerts are not yet implemented.

## Release gate for live clinical data

Do not enable live clinical processing until the DPIA, lawful basis, controller/processor contracts, clinical safety case, retention schedule, penetration test, tenant-isolation tests, restore test, monitoring procedure and accountable approvals are complete.
