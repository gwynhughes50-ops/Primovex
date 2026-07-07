# Security Model

## Principles

- Least privilege access
- Role-based permissions
- User-assigned notifications
- Auditability for important actions
- No hidden AI automation for governance-critical workflows

## Firestore Rules

Firestore rules are part of the product and must be updated alongside any data model change.

Rules should protect:

- user records
- assigned notifications
- stock and purchasing records
- governance records
- settings and admin configuration

## Future Requirements

- Multi-tenant isolation
- Organisation-scoped roles
- Site-scoped permissions
- Audit log protection
- Admin-only configuration changes
- Export controls
- Data retention policy
