$ErrorActionPreference = "Stop"

Write-Host "Primovex Windows build" -ForegroundColor Cyan
npm install
npm run release:check
npm run desktop:build

Write-Host ""
Write-Host "Build complete. Check src-tauri\target\release\bundle\nsis" -ForegroundColor Green
