# Governance Intelligence

Sprint 23 introduces the first version of the MedTrak+ Governance Intelligence module.

## Purpose

Governance Intelligence turns concerns management into a live case workflow rather than a spreadsheet. It is designed around the NHS Wales Listening to People approach: listen, act, investigate, respond and learn.

## Patient identifiers

MedTrak+ should remain anonymised by default.

Use:

- EMIS number as the preferred identifier.
- Patient initials and date of birth only when EMIS number is not available.
- No patient name field in the concern record.

## Workflow

The default concern pathway is:

1. Received
2. Acknowledged
3. Listening Discussion
4. Early Resolution
5. Investigation
6. Response
7. Learning
8. Closed

## Priority

Concerns use a traffic-light priority:

- LOW: suitable for early resolution or low operational risk.
- MEDIUM: requires investigation, GP input or structured response.
- HIGH: possible patient safety issue, serious harm, external agency, MDDUS/GMPI, coroner, ombudsman, claim or safeguarding concern.

Priority is not the same as deadline risk. A low-priority case can still become urgent if deadlines are missed.

## Case Health

Case Health is a management signal showing whether a case is drifting. It considers:

- owner assigned
- acknowledgement recorded
- Listening Discussion offered
- desired outcome recorded
- deadline position
- learning recorded where required
- escalation flags such as clinical review or Duty of Candour

## MedAI prompts

The first version is deterministic. It highlights:

- concerns due or overdue
- missing acknowledgement
- missing Listening Discussion offer
- high priority cases
- whether routine governance appears stable

Future versions can add natural language summaries, similar-case search and report drafting support.
