# Database Notes - Product Identity Model

## Core principle

A MedTrak+ stock item represents the stable product, not a specific delivery batch.

## Stable stock item fields

Collection: `stock_items`

```js
{
  name: "Paracetamol",
  strength: "500mg",
  form: "tablets",
  product_identity_key: "paracetamol|500mg|tablets",
  category: "medicinal",
  current_stock: 120,
  min_stock: 20,
  preferred_supplier_id: "...",
  preferred_supplier_name: "NHS Supply Chain",
  supplier_sku: "...",
  order_quantity: 100
}
```

## Receipt/delivery-level fields

Stored on `stock_movements.receipt_details` when receiving stock:

```js
{
  brand: "Brand may vary",
  barcode: "Barcode may vary",
  batch_number: "Batch may vary",
  expiry_date: "Expiry may vary",
  supplier_id: "...",
  supplier_name: "...",
  purchase_order_id: "...",
  po_number: "..."
}
```

## Why this matters

The same product can arrive from different suppliers or brands. Barcode, batch and expiry can change with each delivery. MedTrak+ therefore matches and manages products primarily by name, strength and form.
