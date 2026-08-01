# ClinFlow Retention and Deletion Framework — Draft

Retention must be assigned by the controller and Records Manager according to the record's function, applicable law, local policy, litigation/inquiry holds and clinical-safety needs. NHS Wales deployments use the Welsh Records Management Code of Practice for Health and Social Care 2022 as their primary baseline. The NHS England Records Management Code is retained as a compatibility overlay. Primovex must not invent a single blanket period for every record.

## Required record classes

| Record class | Authoritative copy? | Trigger | Period | Disposal action | Approval |
|---|---|---|---|---|---|
| Original clinical correspondence | To determine | To determine | Derive from approved NHS/local schedule | Review, transfer or secure destruction | Pending |
| Extracted clinical data / coding proposal | To determine | To determine | To determine | Secure deletion or transfer | Pending |
| Workflow and routing history | To determine | To determine | To determine | Secure deletion or preservation | Pending |
| Security and access audit | No/To determine | Event date | To determine from security/legal need | Secure deletion | Pending |
| Synthetic demonstration data | No | Creation date | Short test period to approve | Automated deletion | Pending |
| Backups | Mirrors source | Backup date | Defined rolling period | Cryptographic/verified deletion | Pending |

## Engineering requirements before live use

- Every live record carries a record class, retention trigger and calculated review date.
- Legal and clinical-safety holds prevent automated disposal.
- Disposal is authorised, logged and verifiable across primary stores, exports and backups.
- Soft archive is not treated as legal deletion.
- Data-subject requests are assessed against applicable exemptions and record-retention duties.
- Contract termination includes export, migration, verified deletion and evidence provision.
- Every schedule records its jurisdiction, source code/version and approval date.
- Where the Welsh and English schedules differ, the controller documents the selected period and legal rationale rather than silently choosing a value.

