# Primovex Sprint 48.1 — Android Scanner Transparency Hotfix

Version 0.15.5

- Makes the authenticated mobile session wrapper transparent while CameraX is active.
- Keeps the scanner viewport explicitly transparent so the native camera preview is visible.
- Forces accessible white scanner header and guidance text over the live camera.
- Restores all theme backgrounds immediately on Close, Cancel, scan completion, lock or component cleanup.
- Preserves the v0.15.4 scanner controls, mobile reconciliation and Orb voice baseline.
