# Sprint 38: Deterministic Mobile Authentication Boot

Android now selects `MobileApp` at build time using Vite's `android` mode. Desktop and Android no longer share public splash or login routes.

## Android flow

1. Primovex mobile splash
2. Firebase account login when no authenticated user exists
3. Device PIN / biometric convenience lock
4. Mobile home

## Desktop flow

Desktop retains its existing splash, login and routed workspace.

## Build commands

- Desktop: `npm run build`
- Android web bundle: `npm run build:android`
- Android device: `npm run tauri android dev`
