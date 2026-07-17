# Android Internal Testing

## One-time workstation setup

Install:

1. Android Studio
2. Android SDK Platform 35
3. Android SDK Build Tools 35
4. Android NDK 27
5. Rust through rustup
6. Node.js 22 LTS

Set the environment variables in PowerShell, adjusting the path if Android Studio uses a different SDK location:

```powershell
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:NDK_HOME="$env:ANDROID_HOME\ndk\27.0.11902837"
```

## Initialise Android

Run once from the project root:

```powershell
npm install
npm run android:init
```

This generates `src-tauri\gen\android`. The generated platform project is deliberately excluded from ZIP handovers and should normally be regenerated from the source configuration.

## Run on the connected phone

On the Android phone:

1. Enable Developer Options.
2. Enable USB debugging.
3. Connect by USB and approve the computer.

Then run:

```powershell
npm run android:dev
```

To open Android Studio while the Tauri process stays alive:

```powershell
npm run android:dev:open
```

## Build an internal test APK

```powershell
npm run android:build:debug
```

The debug APK is generated in the Android Gradle output directory under `src-tauri\gen\android\app\build\outputs\apk`.

Install it with Android Debug Bridge:

```powershell
adb install -r "PATH_TO_PRIMOVEX_APK"
```

The `-r` option updates the existing internal test installation while preserving its app data where Android permits.

## Production signing

Do not commit the keystore.

Generate an upload key:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkey -v `
  -keystore "$env:USERPROFILE\primovex-upload-keystore.jks" `
  -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias primovex-upload
```

Production Android updates should ultimately use Google Play Internal Testing and then managed Play releases, rather than manually distributing APK files.

## NFC testing

The installed Android build is the preferred test target for Primovex Sense. Test:

- NFC tag opens the correct Space or Asset.
- User authentication is preserved or requested safely.
- Mobile Home, PIN lock, themes and centre Orb continue to work.
- Invalid or external tags are rejected.
