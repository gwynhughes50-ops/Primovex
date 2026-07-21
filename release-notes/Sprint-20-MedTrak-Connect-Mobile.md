# Sprint 20: MedTrak Connect + Mobile

## Summary

Sprint 20 introduces MedTrak Connect, the first connected-device layer for MedTrak+.

The first use case is smart fridge and cold-chain monitoring using simulated Wi-Fi sensor readings. The architecture is intentionally generic so future devices can be added without redesigning the platform.

## Added

- New desktop `/connect` page.
- MedTrak Connect navigation item.
- Connected device service layer.
- Simulated connected device dataset.
- Device health scoring.
- Cold-chain dashboard cards.
- Temperature trend visualisation.
- MedAI Cold Chain Brief.
- MedAI device recommendations.
- Operations Centre MedTrak Connect widget.
- New mobile Connect experience.
- Mobile bottom navigation now supports tab switching.
- Tablet-friendly responsive Connect layout.
- Connect documentation and ADR.

## Build

Production build completed successfully with Vite after refreshing npm optional dependencies.

## Notes

The sprint uses simulated readings. Real Wi-Fi thermometer integration should be selected later after hardware/API review.
