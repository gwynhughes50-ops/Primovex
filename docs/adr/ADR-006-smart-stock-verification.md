# ADR-006: Smart Stock Verification

## Status

Accepted

## Context

Annual stock takes are disruptive and quickly become outdated. In a GP practice, stock can drift because items are used during busy clinics without being recorded immediately.

## Decision

MedTrak+ will use continuous, intelligent micro-verification rather than relying on annual stock takes.

The system will select a small number of items for physical verification across the year. Selection is based on risk, age since last check, discrepancy history, clinical importance and inventory size.

## Consequences

- Staff complete small checks that usually take only a few minutes.
- Managers gain an Inventory Confidence score.
- Discrepancies are identified earlier.
- The workload scales for small and large practices.
- Future task workflow should support accept, reassign and snooze.
