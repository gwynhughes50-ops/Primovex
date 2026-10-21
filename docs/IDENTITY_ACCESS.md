# Identity & Access Platform

Sprint 22 introduces capability-based access control for MedTrak+.

## Why this exists

MedTrak+ has moved beyond a stock app. It now includes Operations Centre, MedAI, Inventory Intelligence, MedTrak Connect, MedTrak Mobile, governance and administration workflows. Fixed roles such as `System Admin`, `User` and `ReadOnly` are no longer enough.

The new model is:

```text
User -> Role -> Capabilities -> UI + Firestore access
```

A role is only a template. What matters is the capability assigned to the user.

## Capability format

Capabilities use dot notation:

```text
inventory.read
inventory.write
inventory.verify
connect.view
connect.manageDevices
governance.manageSars
admin.manageUsers
```

This keeps permissions readable, portable and commercially scalable.

## Current role templates

- System Admin: all capabilities.
- Practice Manager: operational management across all core modules.
- User: standard stock, temperature, mobile and Connect viewing workflows.
- Nurse: stock verification, temperature logging and compliance workflows.
- HCA: mobile-first stock and temperature workflows.
- Reception: governance update and operational view access.
- Caretaker: estates/compliance-style access.
- ReadOnly: view-only access.

## User profile format

MedTrak+ continues to support the existing `role` field:

```json
{
  "displayName": "Gwyn Hughes",
  "role": "System Admin"
}
```

It also supports granular permissions:

```json
{
  "displayName": "Example User",
  "role": "Nurse",
  "permissions": {
    "connect": {
      "view": true,
      "acknowledgeAlerts": true
    },
    "inventory": {
      "verify": true
    }
  }
}
```

Role capabilities and user-specific permissions are merged.

## UI behaviour

Navigation now filters by capability. If a user lacks a capability, the relevant item is hidden. Sensitive pages should also use `PermissionGate` or `AccessDenied` so a direct URL cannot present the full workflow.

## Firestore behaviour

Firestore rules now include a capability-aware helper for new platform collections. Existing rules remain compatible while the application migrates to the new model.

## Principle

Permissions should describe what a person can do, not what their job title is. Different practices organise work differently, so MedTrak+ must allow local configuration without code changes.

## Per-person exceptions and the emergency kits (October 2026)

A person's permissions are their role's, with exceptions for that one person on top:

```json
{ "role": "Salaried GP", "permissionExceptions": { "allow": ["training.manage"], "deny": ["inventory.adjust"] } }
```

- `allow` adds something the role does not give; `deny` takes away something it does. An exception never narrows a System Admin.
- Only a System Admin can write `permissionExceptions` (the person cannot change their own: `firestore.rules`, users update). The security rules, the Cloud Functions and the app all honour it: `permitted()` in `firestore.rules` and `storage.rules`, `applyExceptions()` in `functions/services/roleCapabilities.js`, `getCapabilitiesForProfile()` in `src/core/identity/capabilities.js`. The screen is Advanced Administration, Users, Permissions; the pure logic is `src/core/identity/permissionExceptions.js`.
- Rules that name a role directly (for example the Caretaker checks and ClinFlow) are not affected by exceptions; those that check a permission are.

Every original role except System Admin can be changed by an administrator (role_overrides), including User and ReadOnly.

New permissions:

- `inventory.kits`: the emergency drugs and anaphylaxis boxes (see them, and record their checks with `inventory.verify`). Every original role that could see inventory keeps it. Roles and role changes saved before it existed (no `capabilitiesVersion`, or below 2) keep seeing the kits while they have `inventory.read`, until they are next saved from Roles & Permissions, which writes `capabilitiesVersion: 2`. Leave it unticked for "stock only".
- `governance.concernsInvolved`: Concerns appears for the person, showing only the cases they are named on (the security rules already limit what they can read), and they can add a statement or note to those.

The Salaried GP preset (Roles & Permissions, Add Role, Start from) is stock use only, with their own training, timesheet and mileage, the significant events they report or are named in, and the concerns they are named in.
