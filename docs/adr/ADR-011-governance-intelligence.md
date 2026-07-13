# ADR-011: Governance Intelligence and anonymised concern records

## Status

Accepted

## Context

The NHS Wales Listening to People process changes concerns handling from a simple complaint register into a structured workflow focused on listening, proportionate action, investigation, response and learning.

MedTrak+ previously had SAR workflow foundations but no dedicated concerns/case-management system.

## Decision

MedTrak+ will implement concerns as anonymised governance cases.

Records will use EMIS number as the primary identifier. If EMIS is unavailable, initials and DOB may be used. Patient names must not be stored as the primary identifier in MedTrak+.

The module will use a traffic-light priority model and a separate case-health calculation so managers can see both seriousness and drift risk.

## Consequences

- The module is safer for demonstrations and screenshots.
- Governance work becomes operationally visible in the Operations Centre.
- Learning actions can be tracked from the start.
- Future document generation and MedAI support can be built on structured timeline data.
