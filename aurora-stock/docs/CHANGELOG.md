## v0.9.32 - MedTrak Assets: Clinical Readiness

- Redesigned Emergency Drugs & Equipment as a clinical readiness asset dashboard.
- Redesigned Anaphylaxis Boxes with kit-level QR identity and verification workflow.
- Added MedTrak Asset IDs for emergency kits and anaphylaxis boxes.
- Added printable QR label generation for physical kit labels.
- Added readiness scoring and MedAI-style readiness notes.
- Preserved existing Firestore collections and monthly check workflow.
- Improved theme-aware fonts, cards, inputs and responsive layout across both tabs.
- Build passed.


## v0.9.30 - Platform Modes & Demo Centre 2.0

- Added Live, Demo, Training and Staging platform modes.
- Added global mode banner across the authenticated app.
- Added Practice Administration controls to switch modes safely.
- Added scenario-aware demo/training selector and reset controls.
- Updated Login and Demo Centre to support simple product demonstrations and staff training.


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

## v0.9.25 - MedTrak Connect Provider Layer

- Added provider-based MedTrak Connect architecture.
- Added Simulator provider for development and demonstrations.
- Added Tuya provider shell with backend-ready configuration fields.
- Added provider manager UI to the Connect page.
- Added device registry concepts for provider, firmware, equipment and integration status.
- Added -40°C freezer simulation so ultra-low temperature workflows can be tested.
- Added secure provider guidance: API secrets must not be stored in the React frontend.
- Added Firestore rule for `connect_provider_settings` metadata.

## v0.9.26 - MedAI Core

- Added a dedicated MedAI service layer under `src/services/medai`.
- Added Daily Brief, Recommendation, Insight and Priority engines.
- Updated Operations Centre so MedAI generates its brief and next-best actions from notifications, inventory, governance and Connect data.
- Added explainable recommendations with priority scores, estimated completion time and reasons.
- Updated MedTrak Mobile to consume the same MedAI core rather than using a separate static mobile brief.
- Established the principle that MedAI inherits user-permitted data and explains every recommendation.

## v0.9.28 - Demo & Security Hardening

- Added an anonymised public demo page for safe product demonstrations without live patient data.
- Polished login and password reset screens with safer messaging and clearer security guidance.
- Added Security Centre with release-readiness, audit, demo safety and DPIA preparation checks.
- Added demo-mode configuration via `VITE_DEMO_MODE=true`.
- Added synthetic demo governance cases and Connect devices.
- Added `security.read` and `security.manage` capabilities and Security navigation.
- Added ADR-015 for demo safety and governance security hardening.

## v0.9.29 - Demo Centre

- Reworked `/demo` into a Demo Centre rather than a single static preview page.
- Added selectable demo scenarios: GP Practice, Research Practice, Large Health Centre and Training Mode.
- Added a local demo reset action so each demonstration can start from a clean synthetic baseline.
- Added scenario-specific MedAI briefs, platform statistics and product positioning.
- Added the public `/demo` route so the login page Demo Centre link works without authentication.
- Updated demo configuration helpers for active scenario selection and reset tracking.

## v0.9.30b - Platform Modes Login and Demo Fix

- Rebuilt the login page into a full-width, professional access screen.
- Fixed Demo Centre launch flow so synthetic demo/training data is visible immediately.
- Added synthetic-mode authentication so Demo, Training and Staging can open without live Firebase login.
- Improved Platform Mode controls with clearer launch button and active mode behaviour.
- Updated sign-out to respect synthetic modes and safely return to Live.


## v0.9.31 - Project Renaissance Demo Experience

- Rebuilt the login screen into a wider, premium product landing experience inspired by the MedTrak+ concept direction.
- Added one-click "Experience MedTrak+" entry from the login screen into a safe synthetic workspace.
- Expanded the Demo Centre into a richer fictional practice environment with stock, governance, Connect, activity and security data.
- Added a substantial synthetic dataset for Oakfield Medical Centre, including stock records, connected devices, governance cases, activity events and MedAI-ready metrics.
- Connected demo/training/staging modes into stock, notifications, governance and Connect data flows so screens are populated without live Firebase data.
- Added no-op safety handling for governance writes in synthetic modes so demo users do not touch live Firestore records.
