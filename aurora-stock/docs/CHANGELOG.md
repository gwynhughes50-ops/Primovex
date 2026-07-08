
## v0.9.24 - MedTrak Mobile 3.0

- Redesigned MedTrak Mobile home into a task-first operational workspace.
- Added MedAI mobile brief with estimated admin time.
- Added quick actions for scan, stock, Connect and manual search.
- Added dedicated Stock and Me mobile modes.
- Improved mobile summary cards for stock, governance and cold-chain status.
- Build passed.

## Sprint 21A - Theme Hardening

- Added `/theme-lab` for checking theme readability across components.
- Added shared theme token classes for future UI work.
- Strengthened light/dark theme compatibility for legacy Tailwind colour classes.
- Added `docs/THEME_GUIDELINES.md`.

# Changelog

## Sprint 19 - Inventory Intelligence

- Added Smart Stock Verification to the Operations Centre.
- Added Inventory Confidence scoring.
- Added MedAI-style stock verification scheduling.
- Added physical expected-vs-actual stock verification workflow.
- Added stock_verifications Firestore model documentation.
- Added ADR-006 for continuous stock verification.


## Sprint 18B - Operations Centre Live Route Refactor

- Replaced the live Alerts page with the Operations Centre experience.
- Added MedAI Daily Brief, AI Suggested Actions, risk scan and priority scoring.
- Widened the desktop app shell for a true command-centre layout.
- Renamed navigation from Alerts to Operations.
- Removed duplicate nested source trees that caused previous patches to miss the live route.
## Sprint 20: MedTrak Connect + Mobile

- Added MedTrak Connect as the connected-device layer.
- Added desktop `/connect` dashboard.
- Added simulated smart fridge and room sensor readings.
- Added cold-chain status, device health, battery and signal monitoring.
- Added MedAI Cold Chain Brief and device recommendations.
- Added Operations Centre Connect widget.
- Added mobile Connect screen with phone/tablet-first design.
- Added Connect documentation and ADR-007.

## Sprint 20A - MedTrak Mobile polish

- Renamed the mobile experience to **MedTrak Mobile**.
- Added mobile session header showing how long the user has been logged in.
- Added idle timeout warning and automatic mobile session lock after inactivity.
- Added biometric-ready quick unlock using the platform authenticator where supported.
- Added a mobile battery-saver lock event so camera scanning is closed when the session locks.
- Improved the mobile home header so it feels like a first-class product experience rather than a compressed desktop view.


## Sprint 21B - Design System Icon Hardening

- Added safe icon lookup with `getIcon` and `resolveIcon`.
- Fixed missing `settings` icon key used by Theme Lab navigation.
- Converted navigation to use icon keys instead of direct icon component references.
- Added Icon Lab preview inside Theme Lab.
- Added icon system documentation and ADR-009.

## Sprint 22 - Identity & Access Platform

- Added capability-based permission engine.
- Added role templates and capability catalogue.
- Added `can()` and `canAny()` helpers to AuthContext.
- Added permission-aware desktop and mobile navigation.
- Added AccessDenied and PermissionGate components.
- Added MedTrak Connect Firestore rules using capability checks.
- Added audit event foundation.
- Added Identity & Access documentation and ADR-010.

## Sprint 23 - Governance Intelligence

- Added Listening to People concern workflow.
- Added anonymised concern identifiers: EMIS first, initials + DOB fallback.
- Added traffic-light concern priorities and Case Health.
- Added governance MedAI prompts and Operations Centre widget.
- Added concern timeline and learning action foundation.
