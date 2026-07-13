# Sprint 37 — Release & Distribution Foundation

## Goal

Turn Primovex from a development web app into a versioned Windows desktop product and an installable Android beta, with repeatable release pipelines and a secure update path.

## Version

Primovex `0.10.0` establishes the first distribution baseline. `npm run version:sync` keeps `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` aligned.

## Windows desktop

- Tauri NSIS installer configured for current-user installation.
- Primovex product identity, publisher, description, icons, and WebView2 bootstrap behaviour configured.
- Signed updater plugin scaffolded for desktop.
- Update check and installation card available in Security Centre and Mobile → Me when running inside Tauri.
- GitHub Actions release workflow builds draft beta releases from `app-v*` tags.

The updater is intentionally disabled in ordinary development builds. It activates only in a signed release build generated with:

- `TAURI_UPDATER_PUBLIC_KEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `VITE_PRIMOVEX_UPDATES_ENABLED=true`

The private signing key must never be committed or shared.

## Android beta

- Android scripts added for init, development and debug/release builds.
- GitHub Actions internal beta workflow added.
- Android builds use the same React application and dedicated Primovex Mobile interface.
- Google Play will become the supported update mechanism for production Android installs.
- Direct APK installation is reserved for internal testing.

## Deep links

The `primovex://` scheme is registered as a foundation for NFC Space and Asset links inside installed desktop/mobile applications. Incoming links must still be validated by Primovex before navigation.

## Commands

```powershell
npm install
npm run release:check
npm run desktop:build
```

Android setup and build commands are documented in `docs/release/ANDROID-INTERNAL-TESTING.md`.

## Validation completed

- Production Vite build passed.
- Version synchronisation passed.
- Tauri project configuration was inspected with `tauri info`.
- Final Windows installer and Android APK cannot be compiled in the Linux handover environment because Rust, Windows installer tooling, and the Android SDK/NDK are not installed there.
