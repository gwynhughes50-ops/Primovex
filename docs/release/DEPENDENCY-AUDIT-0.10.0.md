# Dependency Audit — 0.10.0

`npm audit --omit=dev` reports 12 advisories in the inherited dependency tree:

- Legacy `firebase-admin` dependencies used by maintenance scripts and server tooling require a breaking upgrade before external release.
- `xlsx` has published advisories with no npm registry fix available; report export should be migrated to a maintained spreadsheet library or isolated before commercial release.

These findings were not introduced by the Tauri release plugins and were not force-upgraded during Sprint 37 because doing so could change Firebase and reporting behaviour. They are release blockers for broad external distribution, but not blockers for the controlled internal Windows/Android beta.
