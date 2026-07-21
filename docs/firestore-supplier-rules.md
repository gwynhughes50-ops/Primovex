# Firestore rules required

Add this inside:

```js
match /databases/{database}/documents {
  // here
}
```

```js
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
