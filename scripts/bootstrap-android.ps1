$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "Primovex Android bootstrap" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"

$required = @("node", "npm", "cargo", "rustup", "adb")
foreach ($command in $required) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $command"
    }
}

$androidHome = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
if (-not (Test-Path $androidHome)) {
    throw "Android SDK not found at $androidHome"
}
$env:ANDROID_HOME = $androidHome

Write-Host "Using Android SDK: $androidHome"
Write-Host "Installing Rust Android targets..."
& rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
if ($LASTEXITCODE -ne 0) { throw "Unable to install Rust Android targets." }

$generatedAndroid = Join-Path $ProjectRoot "src-tauri\gen\android"
if (Test-Path $generatedAndroid) {
    Write-Host "Removing generated Android project..."
    & "$generatedAndroid\gradlew.bat" --stop 2>$null
    Remove-Item $generatedAndroid -Recurse -Force
}

Write-Host "Generating a clean Tauri Android project..."
& npm run tauri -- android init
if ($LASTEXITCODE -ne 0) { throw "Tauri Android initialisation failed." }

Write-Host "Android project generated successfully." -ForegroundColor Green
Write-Host "Next: npm run android:dev:open"
