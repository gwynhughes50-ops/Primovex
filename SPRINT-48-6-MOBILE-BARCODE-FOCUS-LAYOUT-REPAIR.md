# Sprint 48.6 – Mobile Barcode Focus and Scanner Layout Repair

Version 0.15.10

- Confirms the photographed test barcode is valid EAN-13 `5019144107587` with the correct checksum.
- Retains the working in-panel camera and expanded barcode-format decoder.
- Applies continuous camera focus after the stream starts when Android exposes it.
- Lets the user tap the preview to request a single-shot refocus, then returns to continuous focus.
- Adds clear distance guidance because the supplied barcode frame was too blurred for reliable stripe measurement.
- Repairs NHS Blue contrast in the scanner header and control panel.
- Changes the bottom controls to a two-column layout so nothing is pushed off-screen.
- Preserves manual entry, Close, safe areas, masked PIN, Orb voice and reconciliation behaviour.
