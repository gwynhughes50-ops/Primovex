# Firestore Notes - Notification Centre

The current build continues to use the existing per-user notification path:

```text
users/{uid}/notifications/{notificationId}
```

The existing rules should already allow the user to read, update and delete their own notifications.

## Recommended Notification Fields

```js
{
  title: "SAR due soon",
  message: "Subject access request SAR-2026-0012 is due in 5 days.",
  module: "governance",
  priority: "routine", // info | routine | high | critical
  status: "open", // open | completed | archived
  dueDate: Timestamp,
  actionUrl: "/governance/sars",
  assignedToUid: "...",
  assignedToName: "Liz Howard",
  managerUid: "...",
  escalationLevel: 0,
  snoozedUntil: null,
  read: false,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## Escalation Principle

Assigned person is notified first. Manager is notified only when an item becomes overdue.

Critical future work: add a scheduled Cloud Function to scan overdue notifications/tasks and create escalation notifications for managers.
