# Primovex Sprint 47.1 — Mobile Guided Reconciliation

Version 0.15.1

## Repaired

- Orb reconciliation actions now open the correct Emergency Drugs or Anaphylaxis checklist inside Primovex Mobile instead of falling back to Home.
- Mobile bottom navigation exits the routed checklist cleanly.
- **Show Last Check** selects the asset Orb discussed and displays its latest recorded evidence.

## Improved conversation

Orb now addresses the clinician using the configured trolley or box name. It explains whether a verified check exists for the current month or whether the latest evidence needs attention, then offers:

- **Start Check**
- **Show Last Check**

The response avoids developer-facing collection counts and does not imply that opening a workflow changes readiness or stock.

## Product direction

`ORB-MANIFESTO.md` records the engineering principles behind future guided workflows and Orb Vision. Sprint 47.1 is the safe bridge: Orb guides the clinician into the existing governed checklist. A future release can progressively move each checklist step into Orb without duplicating the system-of-record logic.

## Protected baseline

The confirmed Android native voice lifecycle remains unchanged.
