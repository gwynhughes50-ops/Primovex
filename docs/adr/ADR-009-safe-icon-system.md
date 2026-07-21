# ADR-009: Safe Central Icon System

## Status

Accepted

## Context

A missing navigation icon caused React to crash because the nav attempted to render an undefined component.

As MedTrak+ grows across desktop, tablet, mobile, MedAI and Connect, icon usage will increase significantly.

## Decision

MedTrak+ will use a central safe icon library with:

- `Icons` for direct icon access where appropriate
- `getIcon(name)` for safe lookup
- `resolveIcon(iconOrName)` for mixed component/string support
- grouped icon metadata for Theme Lab preview

Missing icon keys fall back to a safe help icon and log a development warning.

## Consequences

- Missing icons no longer crash the app.
- Navigation becomes more resilient.
- Theme Lab can preview icon visibility across themes.
- New modules must register icons centrally.
