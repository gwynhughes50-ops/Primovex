# Sprint 39 — Smart Home Architecture

## Scope
- Extracted Smart Home live data into `useSmartHomeData`.
- Added reusable `HomeShell`, `HomeHeader`, `HomeWidget`, and `HomeMetricCard` components.
- Extracted the Use Stock workflow into `UseStockDialog`.
- Preserved saved widget visibility/order and role-aware dashboard preferences.
- Replaced dashboard surface colours with Primovex theme variables.
- Retained Operations Brief, Timeline, Operations Centre, inventory navigation, barcode input and mobile scanner.

## Regression gates
- Desktop production build
- Mobile/authentication routes remain untouched
- Dashboard customisation persistence
- Theme switching, with NHS Blue as reference
- Inventory use by scan and manual selection
