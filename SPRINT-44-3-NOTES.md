# Sprint 44.3 Developer Preview Fix

## Corrected

The mobile preview mounted the genuine `MobileLayout`, but did not mount the existing developer issue recorder. Desktop developer access therefore worked while the preview showed no developer issue button.

## Change

`DeveloperMobilePreview.jsx` now imports and renders `MobileDeveloperIssueRecorder` within the phone frame.
