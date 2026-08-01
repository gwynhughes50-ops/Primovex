# Primovex Dual NHS Assurance Readiness Register

Status: **Not approved for real patient data**  
Product version: 0.15.28  
Primary deployment baseline: **NHS Wales**  
Adopted compatibility overlay: **NHS England**  
Review trigger: before any live clinical pilot and after any material processing change

This is an engineering evidence index. It is not a declaration of legal compliance, certification, accreditation, DSPT status or approval for live NHS data.

## Shared UK controls

| Area | Current position | Evidence needed before live use | Accountable approval |
|---|---|---|---|
| Controller relationships | Not recorded | Controller, processor and any joint-controller decision | Controller / DPO |
| UK GDPR lawful basis | Not approved | Article 6 basis, Article 9 condition and any DPA 2018 Schedule 1 requirement | Controller / DPO |
| DPIA | Draft supplied | Completed assessment, mitigations, consultation and signatures | DPO / Controller |
| Transparency | Not approved | Layered privacy notice and AI transparency information | Controller / DPO |
| Contracts | Not approved | Article 28 terms, sub-processors, hosting locations and transfer assessment | Controller / Legal |
| Clinical safety | Not started | Named CSO, risk plan, hazard log, safety case and deployment responsibilities | CSO / Deploying organisation |
| Security | Partial | MFA, threat model, tenant-isolation tests, independent penetration test and remediation | Security Lead |
| Incident response | Not exercised | Data-breach and clinical-safety playbooks plus tabletop exercise | DPO / CSO |
| Continuity | Not evidenced | Backup, restore, downtime, recovery and decommissioning tests | Service Owner |
| Accessibility | Not assessed | WCAG and assisted-technology assessment | Product Owner |

## NHS Wales deployment profile

| Framework | Primovex position | Required evidence |
|---|---|---|
| Welsh Information Governance Toolkit | Not assessed | Applicable organisation assessment and supporting evidence |
| WASPI | Draft mapping supplied | Select and approve the appropriate ISP, DDA, JCA or DPA arrangement |
| Welsh Records Management Code 2022 | Draft mapping supplied | Record-class schedule approved by the controller and Records Manager |
| DHCW / Health Board assurance | Route not confirmed | Confirm the technical, IG and clinical-safety route with the commissioner |
| Caldicott and confidentiality | Design constraint | Caldicott review where applicable, access controls and purpose-based disclosure evidence |

## NHS England assurance overlay

| Framework | Primovex position | Required evidence |
|---|---|---|
| DSPT | Not evidenced | Applicable in-year status and supporting evidence; do not claim completion without formal submission |
| DTAC | Not assessed | Evidence across clinical safety, data protection, technical security, interoperability, usability and accessibility |
| DCB0129 | Not started | Named CSO, clinical risk plan, hazard log and signed Clinical Safety Case |
| DCB0160 | Deployment responsibility | Local deployment safety case and workflow assessment |
| NHS England Records Management Code | Adopted overlay | Map record classes alongside the Welsh schedule and apply the stricter compatible control |

## Conflict rule

Primovex records the jurisdiction that formally requires each control. Where Wales and England controls differ but are compatible, the stricter control is adopted. A control is never presented as formally certified merely because Primovex follows its structure.

## Technical controls already present

- Real ClinFlow patient data is locked; only synthetic workflow metadata is accepted.
- Firestore rules reject non-synthetic client records.
- Demonstration identity and document content remain local and are not uploaded.
- Workflow events are append-only and documents use soft archive.
- Capability controls restrict ClinFlow navigation and actions.
- Provider secrets remain in server-side secret storage.

## Official baselines

- [ICO special category data guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/)
- [ICO DPIA guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments/)
- [Welsh Information Governance Toolkit](https://dhcw.nhs.wales/ig/information-governance/welsh-information-governance-toolkit/)
- [WASPI templates and guidance](https://www.waspi.gov.wales/framework-documentation/templates-and-guidance/)
- [Welsh Records Management Code of Practice 2022](https://www.gov.wales/new-records-management-code-practice-health-and-care-2022-whc2022008)
- [NHS Data Security and Protection Toolkit](https://www.dsptoolkit.nhs.uk/)
- [NHS DCB0129 clinical safety standard](https://digital.nhs.uk/data-and-information/information-standards/governance/latest-activity/standards-and-collections/dcb0129-clinical-risk-management-its-application-in-the-manufacture-of-health-it-systems/)

