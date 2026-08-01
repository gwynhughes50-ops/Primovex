# Primovex ClinFlow Data Protection Impact Assessment — Draft

This document must be completed and signed by the relevant controller and Data Protection Officer before real patient data is enabled.

## 1. Ownership

- Data controller: **To be confirmed**
- Data processor(s): **To be confirmed**
- Data Protection Officer: **To be confirmed**
- Clinical Safety Officer: **To be confirmed**
- Product/service owner: **To be confirmed**
- Assessment date and review date: **To be confirmed**
- Deployment jurisdiction: **NHS Wales primary; NHS England compatibility overlay adopted**
- Welsh IG Toolkit assessment reference: **To be confirmed**
- WASPI agreement reference and type: **To be confirmed**
- DHCW / commissioning Health Board assurance route: **To be confirmed**

## 2. Proposed processing

ClinFlow is intended to receive clinical correspondence, extract proposed structured information, assist authorised staff with routing and reconciliation, and retain an auditable workflow history. Orb may provide permission-filtered assistance. No solely automated clinical decision or autonomous patient-record update is permitted by the present design.

Current production gate: **synthetic workflow metadata only; real patient data disabled**.

## 3. Data categories and subjects

Proposed categories may include identifiers, contact details, NHS number, demographic information, correspondence, diagnoses, medication, test results and operational audit records. These include special-category health data. Data subjects may include patients and staff users.

The final inventory, source systems, volumes, frequency and geographical scope must be recorded before approval.

## 4. Purpose, necessity and proportionality

The controller must document:

- each specific purpose;
- why the processing is necessary;
- less intrusive alternatives considered;
- the Article 6 lawful basis;
- the Article 9 condition and any DPA 2018 Schedule 1 requirement;
- how purpose limitation and data minimisation are enforced;
- how individuals receive privacy information and exercise their rights.

Consent must not be assumed to be the appropriate basis for routine direct-care processing.

## 5. Data flows and recipients

Complete the accompanying data-flow register with every system, organisation, processor, sub-processor, storage location, support-access route, international transfer and deletion path. Attach Article 28 terms and transfer safeguards where applicable.

For a Welsh deployment, record the applicable WASPI agreement type and attach its approved schedules. England-oriented DSPT, DTAC and DCB0129 evidence is maintained as an additional assurance overlay and must not be represented as Welsh certification.

## 6. Automated processing and AI

- AI output must be presented as a proposal with source evidence and confidence.
- Patient matching, coding, routing and clinical actions require meaningful human review.
- Low-confidence or conflicting results must fail safely.
- No solely automated decision with legal or similarly significant effect is authorised.
- Model/provider training on customer data is prohibited unless separately assessed and expressly contracted.

## 7. Risk register

| Risk to people | Initial severity | Required mitigation | Residual risk / owner |
|---|---|---|---|
| Incorrect patient match causes disclosure or unsafe filing | High | Manual identity verification; multiple identifiers; block auto-file | To assess / CSO |
| Incorrect extraction, summary or coding influences care | High | Source view; confidence; human confirmation; audit; safe refusal | To assess / CSO |
| Urgent correspondence is delayed or missed | High | SLA monitoring; visible exceptions; downtime process; escalation | To assess / CSO |
| Unauthorised access or cross-practice disclosure | High | Least privilege; tenant isolation; MFA; access reviews; audit alerts | To assess / Security |
| Excessive retention or inability to locate records | High | Approved retention schedule; legal holds; export and review process | To assess / Records Manager |
| Processor, cloud or support compromise | High | Due diligence; contracts; encryption; logging; incident notification | To assess / DPO |
| Staff over-rely on Orb or AI suggestions | High | Human accountability; training; clear limitations; feedback review | To assess / CSO |
| Service outage disrupts operational or clinical work | High | Tested downtime and recovery procedures; no unsafe silent failure | To assess / Service Owner |

## 8. Consultation and approval

Record consultation with the DPO, CSO, clinical users, records manager, security lead, accessibility users and patient/public representatives. If high residual risk cannot be mitigated, consult the ICO before processing.

Signatures: **Not yet obtained**.
