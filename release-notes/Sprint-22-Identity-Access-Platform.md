# Sprint 22 - Identity & Access Platform

## Added
- Capability-based permission engine.
- Role template catalogue.
- Capability catalogue for Role Builder.
- `useAuth().can()` and `useAuth().canAny()` helpers.
- Permission-aware desktop navigation.
- Permission-aware mobile navigation.
- AccessDenied and PermissionGate components.
- Audit event service foundation.
- Firestore rules for MedTrak Connect and audit events.
- Identity & Access documentation.
- ADR-010.

## Changed
- Legacy stock permission helpers now delegate to the capability engine.
- Admin role templates now use the shared capability catalogue.
- Connect Add Device button is visible only to users with `connect.manageDevices`.

## Notes
- Existing System Admin users remain fully supported.
- The app supports both role-based defaults and granular user-level permissions.
