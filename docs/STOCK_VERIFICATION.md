# Smart Stock Verification

Smart Stock Verification is MedTrak+'s continuous stock-take model.

Instead of asking staff to complete a large annual stock take, MedTrak+ quietly schedules small, intelligent physical checks across the year. The aim is to keep inventory accurate without disrupting clinics.

## Product principle

Every stocked item should be physically verified at an appropriate interval based on the amount and type of stock held by the organisation.

A small surgery should receive fewer checks. A large practice or health centre with more products should receive more checks. The work scales with inventory size rather than a fixed daily rule.

## How MedAI selects items

The Smart Verification Engine scores stock items using:

- days since last physical verification
- category and clinical importance
- low-stock status
- previous discrepancy history
- whether the item has never been verified
- location spread, so checks are not concentrated in one room

## Staff workflow

A user is asked to verify a very small number of items, usually taking a few minutes.

They see:

- item name
- site and room
- expected quantity
- actual quantity field
- verify action

Future workflow additions will include Accept, Reassign and Snooze. These are already represented in the UI as planned controls.

## Discrepancy handling

If actual stock differs from expected stock, MedTrak+ records:

- expected quantity
- actual quantity
- discrepancy
- reason
- verifying user
- timestamp

The item's current stock is updated to the physically verified count. A stock movement entry is also recorded when the physical count changes the expected level.

## Inventory Confidence

Inventory Confidence estimates how reliable the recorded stock position is.

It is affected by:

- verification coverage
- overdue checks
- items never checked
- unresolved discrepancies
- discrepancy history

This can feed the Practice Pulse score and the Operations Centre Daily Brief.

## Firestore collections

### stock_items

New fields used by this feature:

```text
last_verified_at
last_verified_by
verification_interval_days
verification_confidence
verification_last_expected_qty
verification_last_actual_qty
verification_last_discrepancy
verification_discrepancy_count
verification_unresolved_discrepancy
```

### stock_verifications

New collection for physical stock checks:

```text
item_id
item_name
item_strength
item_form
product_identity_key
site
location
expected_qty
actual_qty
discrepancy
reason
notes
actor
created_at
generated_by
```

### stock_movements

When a verification changes the stock level, a normal adjustment movement is written for auditability.
