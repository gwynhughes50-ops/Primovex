# ADR-001: Stock Product Identity

## Status

Accepted

## Context

Stock items can be purchased from different suppliers and brands. Barcode, batch and expiry often change between deliveries.

## Decision

MedTrak+ identifies stock primarily by stable clinical/product identity fields such as name, strength and form.

Barcode, batch and expiry are treated as order, receipt or movement-level metadata.

## Consequences

- Reordering is safer and less brittle.
- The same clinical product can be recognised across different deliveries.
- Receipt and batch-level traceability still remains possible.
