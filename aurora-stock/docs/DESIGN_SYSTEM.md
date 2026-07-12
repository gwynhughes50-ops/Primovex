# Primovex Design System

## Foundation

Primovex uses a central theme and icon system:

- `src/components/theme/MedTrakThemeProvider.jsx`
- `src/config/medtrakTheme.js`
- `src/config/medtrakIcons.js`

The legacy internal names are retained for stability. User-facing design and product language is Primovex.

## Semantic Theme Classes

New and refactored components should prefer semantic classes rather than fixed slate, teal or white colours:

- `mt-theme-page`
- `mt-card`
- `mt-card-strong`
- `mt-text-primary`
- `mt-text-secondary`
- `mt-text-muted`
- `mt-accent`
- `mt-input`
- `mt-button-primary`
- `mt-button-secondary`
- `mt-tab`
- `mt-tab-active`
- `mt-pill`
- `mt-pill-muted`
- `mt-ai-surface`
- `mt-ai-badge`

Clinical warning, critical and success colours may remain semantic red, amber and green.

## Shared Components

Prefer reusable components from `src/components/common` and `src/components/ui`.

### Page structure

- `PageHeader` for page title, description, icon, metadata and actions
- `SectionCard` for grouped page content
- `ActionBar` for filters and page actions

### Information surfaces

- `StatCard` for KPI and summary values
- `StatusBadge` for operational state
- `EmptyState` for clear no-data experiences

### Forms

- `FormField` for labels, supporting text and validation
- `Input`, shared buttons and shared tabs for consistent controls

## Layout Standards

- Page spacing: `space-y-5`
- Standard card radius: `rounded-2xl`
- Hero/header radius: `rounded-3xl`
- Standard card padding: `p-4`
- Page header padding: `p-5`
- Desktop summary grids should use available width and collapse cleanly on mobile
- Actions should wrap rather than overflow

## Accessibility

- All controls must keep visible focus states
- Disabled controls must remain legible
- Text and icons must follow the active theme
- High Contrast must preserve strong borders and readable foregrounds
- Status meaning must not rely on colour alone

## Rule

Do not create one-off styling patterns where an existing shared component or semantic theme class can be used.
