# Firestore Rules - Practice Administration

Add these rules inside:

```js
match /databases/{database}/documents {
  // add blocks here
}
```

```js
// -------------------------
// PRACTICE CONFIG
// -------------------------
match /practice_config/{docId} {
  allow get, list: if signedIn();
  allow create, update: if isAdmin();
  allow delete: if isAdmin();
}

// -------------------------
// PRACTICE SITES
// -------------------------
match /practice_sites/{siteId} {
  allow get, list: if signedIn();
  allow create, update: if isAdmin();
  allow delete: if isAdmin();
}

// -------------------------
// PRACTICE DEPARTMENTS
// -------------------------
match /practice_departments/{departmentId} {
  allow get, list: if signedIn();
  allow create, update: if isAdmin();
  allow delete: if isAdmin();
}

// -------------------------
// PRACTICE ROLES
// -------------------------
match /practice_roles/{roleId} {
  allow get, list: if signedIn();
  allow create, update: if isAdmin();
  allow delete: if isAdmin();
}
```

## Why admin-only writes?
Practice structure controls how MedTrak+ will eventually decide dashboards, permissions and Pulse weighting. Normal users can read this information, but only administrators should change it.
