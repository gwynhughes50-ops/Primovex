# MedTrak+ v0.9.17 - Governance Suite Phase 1: Subject Access Requests

## New

- Added Subject Access Request module under Governance.
- Added SAR dashboard metrics:
  - Open requests
  - Due this week
  - Overdue
  - Urgent
  - Completed this month
- Added structured SAR creation workflow using EMIS number only.
- Added request type templates based on real historical SAR request patterns.
- Added 28-day due date calculation.
- Added assigned user and manager escalation fields.
- Added SAR status workflow:
  - New
  - Assigned
  - In Progress
  - Quality Check
  - Completed
  - Archived
- Added SAR completion checklist.
- Added SAR timeline / audit activity log.
- Added Inbox notification on SAR assignment where Firestore rules allow notification creation.
- Added Governance navigation entry.

## Privacy / Data Minimisation

- SAR records deliberately do not store patient name, DOB or address.
- EMIS number is used as the operational reference.

## Updated

- Added governance and SAR icons to central icon library.
- Added `/governance/sars` route.
- Added SARs to central desktop navigation.

## Firestore

Add rules for:

- `governance_sars`
- `governance_sar_activity`
- optional client-created per-user notifications for assignment alerts

See `docs/firestore-governance-sar-rules.md`.
