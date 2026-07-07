# Firestore Rules - Governance SARs

Add these rules inside:

```js
match /databases/{database}/documents {
  ...
}
```

## Subject Access Requests

```js
// -------------------------
// GOVERNANCE - SUBJECT ACCESS REQUESTS
// -------------------------
match /governance_sars/{sarId} {
  allow get, list: if signedIn();
  allow create, update: if signedIn();
  allow delete: if isAdmin();
}

// -------------------------
// GOVERNANCE - SAR ACTIVITY
// -------------------------
match /governance_sar_activity/{activityId} {
  allow get, list: if signedIn();
  allow create: if signedIn();
  allow update, delete: if isAdmin();
}
```

## Optional Inbox Notification Creation

The Sprint 17 SAR module tries to create an assignment notification in the assigned user's personal Inbox.
Your existing rules may currently block client-created notifications:

```js
allow create: if false;
```

For testing, change the notification subcollection rule inside `match /users/{uid}` to:

```js
match /notifications/{nid} {
  allow read: if isOwner(uid);

  allow create: if signedIn()
    && request.resource.data.recipientUid == uid
    && request.resource.data.createdByUid == request.auth.uid;

  allow update: if isOwner(uid);
  allow delete: if isOwner(uid);
}
```

Long term, notification creation should move to Cloud Functions so modules can create notifications securely without relaxing client permissions.
