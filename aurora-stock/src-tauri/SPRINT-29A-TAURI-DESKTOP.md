# Sprint 29A — Tauri Desktop Packaging

## Scope
Desktop packaging only. No React application, Firebase, theme, Pulse, login, mobile, or business-logic files were changed.

## Configuration
- Product: Primovex
- Version: 0.9.18
- Identifier: uk.co.primovex.app
- Vite development URL: http://localhost:5173
- Frontend distribution: ../dist
- Windows installer target: NSIS
- Initial window: 1440 × 900
- Minimum window: 1100 × 700

## Commands
```powershell
npm run tauri dev
npm run tauri build
```

## Test gate
Check login, Firebase connectivity, branding, themes, Pulse, Inventory permissions, Operations Centre, resizing, sign-out, and barcode/camera behaviour before merging.
