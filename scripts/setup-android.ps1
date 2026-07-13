$ErrorActionPreference = "Stop"

$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\27.0.11902837"

Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
Write-Host "NDK_HOME=$env:NDK_HOME"

npm install
npm run android:init

Write-Host "Android target initialised. Run npm run android:dev with your phone connected." -ForegroundColor Green
