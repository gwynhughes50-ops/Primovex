# Primovex v0.15.37 - ClinFlow Numbered Pages and Layout Repair

## Fixed

- Azure Document Intelligence now preserves bounded page-by-page OCR evidence instead of returning only one combined text block.
- Multi-page documents render as separate numbered Page 1, Page 2, Page 3 and subsequent cards.
- The page thumbnail rail links directly to each numbered page.
- Older cached OCR results receive a visibly labelled compatibility split; reprocessing restores exact Azure page boundaries.
- Removed horizontal overflow from the ClinFlow document queue.
- Long document titles wrap to two lines instead of being clipped at the queue edge.
- Review tabs use compact, responsive widths so Docman Summary and Timeline remain reachable.
- Global Pulse and Ask Primovex overlays are suppressed inside the immersive ClinFlow workspace, preventing them from covering clinical review controls.

## Safety and governance

- The source PDF remains untouched and retained locally for the active synthetic review session.
- Page text is bounded before it leaves the governed Azure gateway.
- No OCR text or source PDF is written to Firestore.
- All extracted findings, page content, summaries and codes still require trained human verification.
- Existing synthetic-only gateway, role controls and audit metadata are preserved.

## Deployment note

Deploy the updated Firebase functions to receive exact Azure page boundaries for newly analysed documents. Existing cached multi-page results remain viewable with the clearly marked compatibility split.

## Verification

- Azure gateway tests cover numbered page preservation.
- ClinFlow governed-intelligence verification passes.
- Vite production build and Windows desktop installer are build-tested for this release.
