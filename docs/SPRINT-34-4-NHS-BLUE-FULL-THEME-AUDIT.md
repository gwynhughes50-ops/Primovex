# Sprint 34.4 — NHS Blue Full Theme Audit

## Purpose

Perform a route-wide contrast hardening pass for the NHS Blue/light theme rather than continuing with isolated page patches.

## Coverage

The shared theme layer was audited against all registered application routes and nested administration routes, including:

- Authentication and loading screens
- Dashboard / Operations Brief
- Inventory, Reorder Centre, Purchasing and Suppliers
- Emergency Drugs & Equipment and Anaphylaxis Boxes
- Practice Administration and Administration sub-routes
- Governance Concerns and SARs
- Operations / Alerts
- Connect
- Facilities
- Temperature
- Compliance
- Reports
- Help
- Notifications
- Theme Lab and Security Centre
- Mobile shell and shared dialogs

## Changes

- Added comprehensive light-theme mappings for legacy teal, cyan, sky and blue text utilities.
- Added readable light-theme mappings for green/emerald, amber/yellow/orange and red/rose/pink semantic text.
- Added pale semantic surface mappings with visible borders.
- Preserved white foreground text on solid accent, success and destructive actions.
- Preserved white foreground text on theme gradients.
- Corrected opacity-based text variants that became too faint in NHS Blue.
- Increased disabled-control visibility while retaining a clear disabled state.
- Kept semantic colours reserved for meaning rather than recolouring whole pages.

## Safety

No business logic, permissions, Firestore rules, authentication, inventory calculations, Pulse calculations, mobile navigation, Tauri configuration or branding assets were changed.

## Validation

- Production build passed with Vite.
- Existing large bundle warning remains unchanged.
