# Primovex Sprint 40 — Mobile Experience Release

Version: 0.10.5

## Mission
Deliver a calm, purpose-built mobile experience while preserving the verified desktop and Android foundation established in Sprint 40.2.

## Included
- Time-aware greeting: Good morning, Good afternoon, or Good evening.
- Context-sensitive subtitle for morning, afternoon, and end-of-day use.
- New Today's Focus card beneath Practice Readiness.
- Existing Practice Readiness and Operational Health preserved.
- Centred Primovex AI action retained as the primary mobile assistant entry point.
- Mobile AI label simplified for a cleaner bottom-navigation silhouette.
- Stock search, item action, reorder, warning, and feedback sheets moved onto shared theme surfaces.
- Severity indicators now consume Primovex theme variables rather than fixed pink, violet, slate, or amber classes.
- Version synchronised across package.json, package-lock.json, Cargo.toml, and tauri.conf.json.

## Deliberately deferred
- Quick Notes and scheduled Primovex notifications.
- Shared personal/team task engine.
- Voice capture and natural-language reminder parsing.
- Broader bundle code-splitting.

These belong to Sprint 41: Personal Productivity.

## Validation
- `npm ci` passed.
- `npm run build` passed.
- 2,323 modules transformed successfully.
- Existing large-chunk warning remains non-blocking and is recorded for a future performance sprint.

## Protected regression areas
- Desktop application and login.
- Mobile login and session protection.
- Smart Home and Practice Readiness.
- Centred Primovex AI workspace.
- Stock search, scan, use, receive, and reorder.
- Facilities and NFC entry point.
- NHS Blue and alternate theme rendering.
- Android `arm64Debug` physical-device deployment.
