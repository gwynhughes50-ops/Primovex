# Sprint 52.1.1 - ClinFlow Permission Hotfix

Version: 0.15.26

- Adds the required `dataMode == synthetic` constraint to the Firestore listener.
- Keeps developer-only synthetic sessions local instead of attempting unauthenticated cloud writes.
- Preserves the governed, non-identifying ClinFlow workflow schema from v0.15.25.
