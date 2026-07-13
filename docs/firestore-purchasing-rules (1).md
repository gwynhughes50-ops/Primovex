# Firestore Rules - Purchasing

Add this block inside:

```javascript
match /databases/{database}/documents {
```

```javascript
// -------------------------
// PURCHASE ORDERS
// -------------------------
match /purchase_orders/{orderId} {
  allow get, list: if signedIn();
  allow create: if signedIn();
  allow update: if signedIn();
  allow delete: if isAdmin();
}
```

Supplier rules should already exist. If not, add:

```javascript
// -------------------------
// SUPPLIERS
// -------------------------
match /suppliers/{supplierId} {
  allow get, list: if signedIn();
  allow create: if signedIn();
  allow update: if signedIn();
  allow delete: if isAdmin();
}
```

## Future tightening

Before commercial deployment, supplier and purchase order create/update rights should probably be limited to appropriate roles such as System Admin, Practice Manager, Stock Controller or Purchasing Lead.
