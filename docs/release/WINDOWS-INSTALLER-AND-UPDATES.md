# Windows Installer and Updates

## One-time Windows preparation

Install:

1. Node.js 22 LTS
2. Rust through rustup
3. Visual Studio 2022 Build Tools with **Desktop development with C++**
4. WebView2 Runtime

Then, from the Primovex project folder:

```powershell
npm install
npm run release:check
npm run desktop:build
```

The NSIS installer will normally appear under:

```text
src-tauri\target\release\bundle\nsis\
```

## First internal installer

The first test installer can be unsigned. Windows SmartScreen may warn because the publisher has not yet built reputation. Do not distribute unsigned builds outside the controlled test group.

## Secure automatic updates

Generate the updater key pair once:

```powershell
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\primovex.key"
```

Store the private key and password safely. Losing the private key prevents future updates to already-installed copies.

Add these GitHub repository secrets:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
TAURI_UPDATER_PUBLIC_KEY
```

Push a version tag such as:

```powershell
git tag app-v0.10.0
git push origin app-v0.10.0
```

The Windows release workflow creates a draft GitHub Release. Review the installer and release notes before publishing it.

## Version updates

For every release:

1. Change `version` in `package.json`.
2. Run `npm run version:sync`.
3. Commit the version change and release notes.
4. Tag the release.

Never reuse an old version number.
