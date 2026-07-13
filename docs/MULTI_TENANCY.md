# Multi-Tenancy Strategy

## Current State

MedTrak+ is currently being developed around a single-practice deployment model.

## Target State

The platform should be capable of supporting:

- single GP practices
- branch sites
- multi-site partnerships
- clusters
- federations
- larger NHS organisations

## Future Tenant Model

Potential hierarchy:

```text
organisation
  └── sites
      └── departments / teams
          └── users
```

## Design Implications

- Avoid hard-coded practice-specific names.
- Prefer configurable settings.
- Scope records by organisation when multi-tenancy is introduced.
- Keep permissions organisation-aware.
- Keep AI and Pulse calculations tenant-scoped.
