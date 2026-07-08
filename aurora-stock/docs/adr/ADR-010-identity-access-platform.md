# ADR-010: Capability-Based Identity & Access Platform

## Status
Accepted

## Context
MedTrak+ originally used simple roles such as System Admin, User, ReadOnly and Caretaker. That was acceptable while the product was mainly inventory-focused. The platform now includes Operations Centre, MedAI, Inventory Intelligence, MedTrak Connect, MedTrak Mobile, governance and administration workflows.

Adding one hard-coded Firestore block and one hard-coded UI check per module would make the product brittle and difficult to scale commercially.

## Decision
MedTrak+ will move to capability-based permissions.

Capabilities use dot notation, for example:

- `inventory.read`
- `inventory.verify`
- `connect.view`
- `connect.manageDevices`
- `governance.manageSars`
- `admin.manageUsers`

Roles are templates made up of capabilities. User-specific permissions can extend a role where needed.

## Consequences
- Navigation can be filtered by capability.
- Future roles can be configured without code changes.
- Firestore rules can gradually move from role checks to capability checks.
- Commercial deployments can adapt permissions to each practice.
- System Admin remains supported as a compatibility shortcut during migration.

## Migration
Existing users with `role: "System Admin"` continue to have full access. Existing `User`, `ReadOnly` and `Caretaker` profiles are mapped to default capability templates.
