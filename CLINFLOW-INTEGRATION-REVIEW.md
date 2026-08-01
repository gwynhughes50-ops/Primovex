# ClinFlow Integration Review — Primovex v0.15.16

## Confirmed reusable Primovex foundations

- React 18 + Vite routing shell
- Firebase authentication and profile capabilities
- Desktop sidebar and route manifest
- Immutable platform audit service
- Orb engine, permission gateway, confidence engine and governed actions
- Tauri desktop and Android packaging
- Shared theme, icons, notifications and practice/site context

## Integration decision

ClinFlow is implemented as a first-class module at `/clinflow`, rather than a separate application or iframe.

The module uses an immersive desktop workspace while preserving:

- Primovex authentication
- Primovex sidebar navigation
- Primovex Orb and Pulse surfaces
- Primovex audit logging
- Primovex role/capability management

## New ClinFlow capabilities

- `clinflow.read`
- `clinflow.capture`
- `clinflow.workflow`
- `clinflow.manage`

## First foundation build

The initial module includes synthetic demonstration data and working UI interactions for:

- Workflow queue and search
- High-priority and GP-review filters
- Patient verification banner
- Document viewer and page thumbnails
- AI summary
- Extracted data
- Processing timeline
- Clinical insights
- QAIF opportunities
- SNOMED coding suggestions
- Destination recommendation
- Routing, notes, claim, teaching and completion actions
- Audit events for key workflow actions

## Deliberately deferred

- Azure Document Intelligence connector
- Secure backend/API gateway
- Firestore document persistence
- Real patient matching
- Docman import/export
- ClinFlow learning datasets
- Mobile ClinFlow experience

## Safety boundary

This build contains synthetic data only. It includes no Azure credentials, secrets or patient information.
