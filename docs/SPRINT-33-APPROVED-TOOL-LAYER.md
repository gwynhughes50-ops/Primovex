# Sprint 33 — Approved Read-Only Tool Layer

## Purpose
Primovex AI may only access operational data through named, permission-aware tools. It never receives unrestricted Firestore access.

## Flow
User → Primovex AI → Intent Router → Permission Gate → Approved Tool → Structured result → Source-aware response.

## First tools
- operations.summary
- operations.timeline
- inventory.search
- inventory.lowStock
- inventory.expiring
- facilities.roomStatus
- facilities.cleaningStatus
- facilities.equipmentLocation
- facilities.maintenanceOpen
- coldChain.latestStatus

## Safety
- All Sprint 33 tools are read-only.
- Each tool declares a required capability.
- Permission checks happen before execution.
- Results include sources, freshness context, confidence and navigation actions.
- Missing or restricted data is stated explicitly.
- No API keys or external AI providers are introduced.
