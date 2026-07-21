# Apply Primovex v0.11.2 Patch

This is a targeted patch. Do not delete or replace the whole Primovex repository.

1. Close Primovex, VS Code and Android Studio.
2. Back up `C:\Development\Primovex-Git` or commit the current baseline to Git.
3. Copy the contents of this patch folder into `C:\Development\Primovex-Git` and allow Windows to replace matching files.
4. Do not remove `src-tauri\gen\android` and do not replace your Android signing key.
5. Run:

```powershell
cd C:\Development\Primovex-Git
npm install
npm run build
npm run build:android
firebase deploy --only firestore:rules
```

6. Launch desktop first while signed in. Desktop will upload the current hierarchy to Firestore if the shared registry does not yet exist.
7. Confirm Firestore contains `practice_space_registry/main`.
8. Rebuild and install the signed Android release APK, or run the Android debug build for local testing.
9. Confirm `Practice Manager RM-D90` appears in mobile Facilities and Practice Spaces.

## Important
The first authenticated launch should be desktop because desktop currently holds the correct hierarchy.
