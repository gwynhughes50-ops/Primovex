# Sprint 43 / Primovex v0.11.0
## Shared Space Registry Foundation

This milestone replaces parallel Admin, Sense and Facilities room lists with one shared Space Registry.

### Architectural rule
No module owns a copy of a space. Every workflow references the same permanent `spaceId`.

### Wiring
- Practice Administration creates sites, floors, zones and spaces.
- Sense attaches Smart Tags, occupancy, active context and timelines.
- Facilities attaches cleaning, equipment, issues and maintenance.
- Primovex Mobile reads the same hierarchy and active Sense context.
- Archived spaces retain their identity and operational history.

### Migration
Existing Sense spaces and legacy Facilities rooms are merged into `primovex.spaceRegistry.v1` on first load. Facilities operational data is retained separately under `primovex.facilities.v3` and joined by `spaceId`.

### Acceptance path
1. Add a space in Practice Administration, Sense or Facilities.
2. Confirm it appears immediately in all three desktop modules.
3. Confirm it appears in Primovex Mobile.
4. Assign/test its Smart Tag in Sense.
5. Record cleaning or an issue in Facilities.
6. Confirm the same permanent `spaceId` is preserved throughout.
