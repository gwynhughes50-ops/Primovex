# MedTrak+ Theme Guidelines

## Purpose

Themes must never reduce readability. Every MedTrak+ theme must work across desktop, tablet and MedTrak Mobile.

## Sprint 21A rule

New components should use MedTrak theme tokens rather than hard-coded Tailwind colour classes.

Preferred tokens:

- `mt-theme-page`
- `mt-card`
- `mt-card-strong`
- `mt-text-primary`
- `mt-text-secondary`
- `mt-text-muted`
- `mt-accent`
- `mt-button-primary`
- `mt-button-secondary`
- `mt-input`

Avoid using raw colour classes for text unless the colour is a deliberate clinical status colour.

Examples to avoid:

- `text-white`
- `text-black`
- `text-slate-900`
- `text-gray-400`
- `bg-white`

These can break when switching between dark and light themes.

## Theme Lab

A new internal quality-control page is available at:

`/theme-lab`

Use it before releases to check:

- headings
- body text
- muted text
- buttons
- badges
- inputs
- placeholders
- mobile cards
- warning/danger states
- high contrast mode

## Accessibility targets

MedTrak+ should aim for WCAG AA contrast:

- normal text: 4.5:1
- large text and icons: 3:1

## Definition of Done

A feature is not complete until it remains readable in:

- Aurora Teal
- NHS Blue
- Clinical Green
- Midnight Purple
- High Contrast

Desktop, tablet and mobile must all be checked.
