# Sprint 44.4: Mobile Layout Engine

## Included

- Shared mobile sizing and spacing tokens.
- Smaller mobile page headings, cards, gaps and readiness metric.
- More compact Stock, Home, Concerns and Practice Spaces screens.
- Search Stock is now a bounded, internally scrolling bottom sheet.
- Sense space details use the same bounded sheet pattern.
- Bottom navigation now paints through the safe-area/exclusion zone.
- Mobile content reserves the complete navigation and safe-area height.
- Preview safe-area simulation is consistent across supported device frames.

## Protected areas

No changes were made to:

- Unified Space Registry data or migration behaviour
- Firestore paths or rules
- Sense identity/session logic
- Android signing or Tauri configuration
- Authentication and login
- NHS theme tokens

## Retest

Use Developer Centre > Launch mobile preview and verify:

1. Home proportions
2. Stock proportions
3. Practice Spaces proportions
4. Search Stock sheet height and scrolling
5. Concerns review height and scrolling
6. Bottom navigation safe-area fill
7. Login and desktop regression
