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
