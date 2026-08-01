# Sprint 50.2 — Tuya Firestore Ingest Hotfix

Version: 0.15.18

Tuya authentication and T13 retrieval now complete successfully. The initial
device write failed because an online T13 was mapped with an undefined `status`
value, which Firestore rejects.

Online devices now persist an explicit `online` status. Offline devices continue
to persist `offline`. No credential, device mapping, threshold or UI behaviour
was changed.
