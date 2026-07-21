# MedTrak+ Icon System

## Purpose

The central icon library prevents visual drift across desktop, tablet and MedTrak Mobile.

All navigation and shared components should use the central `src/config/medtrakIcons.js` library.

## Safety rule

Navigation should use `getIcon("iconKey")` rather than rendering raw icon references directly.

If an icon key is missing, MedTrak+ now falls back to a safe help icon and logs a development warning instead of crashing the application.

## Groups

Icons are grouped for maintainability:

- navigation
- inventory
- governance
- connect
- mobile
- actions
- people
- insight

## Theme Lab

The Theme Lab now includes an Icon Lab preview so icons can be checked across themes before release.

## Definition of Done

Any new module must:

- add required icons to `medtrakIcons.js`
- add icon keys to navigation where needed
- verify icons in Theme Lab
- avoid importing one-off icons into navigation configs
