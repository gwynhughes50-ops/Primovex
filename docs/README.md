# MedTrak+ Build v0.9.10 – MedTrak Pulse Foundation

## Summary

This build introduces the first foundation version of **MedTrak Pulse**, the floating circular Surgery Status indicator.

Pulse is designed to sit quietly on screen and only draw attention when the overall operational health score drops.

## Updated / New Files

```text
src/services/pulseService.js
src/hooks/usePulse.js
src/components/pulse/PulseWidget.jsx
src/layout/Layout.jsx
src/mobile/MobileLayout.jsx
docs/CHANGELOG-v0.9.10.md
```

## What Pulse does in this build

- Shows a circular health score.
- Sits globally on desktop pages.
- Shows a compact mobile version.
- Can be clicked to expand.
- Shows module scores for Inventory, Purchasing, Compliance, Assets, Estates, Workforce and Governance.
- Uses real signals from:
  - stock_items
  - reorder_requests
  - purchase_orders
  - temperature_incidents
- Remembers desktop position using localStorage.
- Drag to move on desktop.

## Current scoring model

This is a foundation model only.

- Inventory score is affected by low/out-of-stock items.
- Purchasing score is affected by pending/approved requests and open orders.
- Compliance score is affected by open temperature incidents.
- Assets, Estates, Workforce and Governance are currently placeholder 100% scores ready for future modules.

## Firestore Rules

No new Firestore collections are required for this build.

Pulse reads existing collections only. Make sure the user can read:

```text
stock_items
reorder_requests
purchase_orders
temperature_incidents
```

## Testing Checklist

- Dashboard loads.
- Pulse appears on desktop.
- Pulse opens when clicked.
- Pulse module rows navigate to relevant areas.
- Pulse can be dragged on desktop.
- Pulse appears in mobile view.
- Inventory still works.
- Purchasing still works.
- Reorder Centre still works.
- Mobile scanner still works.

## Suggested Commit

```bash
git add .
git commit -m "release(v0.9.10): add MedTrak Pulse foundation"
git push
git tag v0.9.10
git push origin v0.9.10
```
