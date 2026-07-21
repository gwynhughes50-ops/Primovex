# Database Model

## Current Known Collections

- `stock_items`
- `stock_movements`
- `temperature_logs`
- `users`
- `users/{uid}/notifications`
- `settings/alerts`
- `alert_resolutions`

Additional governance, purchasing, compliance and practice administration collections exist or are emerging as modules mature.

## Stock Identity Principle

Stock items should be identified by stable product identity fields such as:

- product name
- strength
- form
- category

Barcode, batch and expiry are receipt/order-level details and may change between suppliers or deliveries.

## Notifications

Notifications are user-assigned rather than broadcast by default.

Expected fields include:

- `title`
- `message`
- `module`
- `priority`
- `status`
- `dueDate`
- `createdAt`
- `read`
- `snoozedUntil`
- `actionUrl`

## Future Database Requirements

- Organisation / tenant records
- Site records
- Department records
- Role and permission templates
- Audit log collection
- Daily operational snapshots for "What changed since yesterday"
- AI scoring metadata / explanation fields
