# Sprint 40.2 — Foundation Recovery

## Purpose
Restore a clean, reproducible Tauri desktop and Android foundation using Sprint 39 as the last known-good application baseline.

## Repairs
- Removed the accidental duplicate frontend project from `src-tauri`.
- Restored the required Tauri `build.rs`.
- Synchronised application versions to `0.10.4`.
- Kept generated Android/Gradle output out of the release.
- Restored the standard local `@tauri-apps/cli` workflow.
- Added `npm run android:bootstrap` to recreate Android safely.

## Android workflow
```powershell
cd C:\Development\Primovex-Git
npm install
npm run android:bootstrap
npm run android:dev:open
```

Do not copy or commit `src-tauri/gen/android` between machines. It is generated locally.
Do not add `npm.bat`, `cargo.bat`, or manual linker files to the repository.

## Protected regression areas
- Login
- Desktop shell and left navigation
- Mobile shell
- Smart Home
- Theme switching
- Inventory, barcode and NFC workflows
