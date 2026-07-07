# Architecture

## Application Stack

- React
- Vite
- Firebase / Firestore
- Tailwind-style utility classes
- Central MedTrak+ theme configuration
- Central icon library

## Architectural Direction

MedTrak+ should be modular, scalable and commercially reusable.

The platform is organised around product domains rather than isolated pages:

- Operations Centre
- Governance
- Inventory
- Purchasing
- Compliance
- Practice Administration
- Intelligence
- Settings

## Current Front-End Structure

- `src/pages` contains route-level pages.
- `src/components` contains reusable UI and domain components.
- `src/services` contains Firestore and business logic services.
- `src/hooks` contains reusable live data hooks.
- `src/config` contains navigation, theme, icons and visual standards.
- `src/mobile` contains mobile-first workflows.

## Sprint 18A Architecture Change

The legacy Alerts route now delegates to the Operations Centre:

- `src/pages/Alerts.jsx`
- `src/components/dashboard/OperationsCentre.jsx`
- `src/services/medaiService.js`

This keeps routing stable while evolving the product language from alerts to operational intelligence.

## Target Platform Model

1. Authentication
2. Organisation
3. Sites
4. Departments / teams
5. Users
6. Roles and permissions
7. Modules
8. Notifications
9. Audit trail
10. MedAI intelligence layer

## Design Rule

Business logic should not be buried inside large page components where it can be avoided. Reusable calculations, scoring and data transformations should live in services or hooks.
