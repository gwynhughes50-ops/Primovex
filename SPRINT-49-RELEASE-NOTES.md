# Primovex Sprint 49 — v0.15.12

## Rapid Mobile Inventory Movement

- A successful mobile barcode scan now opens a compact NHS Blue stock action sheet.
- Everyday use is reduced to one explicit action: **Use 1**, **Use 2**, **Use 5**, or **Other**.
- Quick quantities that exceed available stock are disabled.
- A successful movement confirms the quantity used and remaining balance, then closes automatically.
- Active Space context is attached when available; otherwise the registered item location is retained.
- Each movement records the authenticated user, role, barcode, source, Space and Sense session in the existing audit trail.
- Roles without `inventory.write` can view a scanned item but cannot change its stock.
- Unknown barcodes never create products or alter stock silently. Users can search, add deliberately, report the item, or scan again.
- Receiving, reorder, details and Orb remain available as secondary actions without crowding the daily-use flow.

## Protected foundations

- Native Android barcode scanning remains the identification layer.
- Orb native voice and its working lifecycle are unchanged.
- Anaphylaxis and emergency readiness workflows are unchanged.
- Persistent bottom navigation, Android safe areas and internal sheet scrolling are preserved.
