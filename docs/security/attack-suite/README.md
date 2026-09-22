# Primovex rules attack suite

Tests the real `firestore.rules` and `storage.rules` (both in the repository
root) against the Firebase emulator with synthetic users. Nothing here
touches production or real data. It is the evidence behind
`docs/security-review-and-penetration-test.docx`.

Run it after **every** change to `firestore.rules` or `storage.rules`.

1. Install Java and the Firebase CLI.
2. In this folder: `npm install`
3. Start the emulators **from the repository root** (so the CLI picks up the
   `medtrak-b1cad` default project from `.firebaserc` - the suite's storage
   checks specifically depend on that; see the comment on `PROJECT_ID` in
   `attack.mjs` if they ever start failing with a "Null value error"):
   `firebase emulators:start --only auth,firestore,storage`
   The suite expects Firestore on `127.0.0.1:8080` and Storage on `127.0.0.1:9199`.
4. Run: `npm test`

A healthy run ends with `0 failed` (94 checks passed when the storage.rules
coverage for stock item photos was added). A failure means the rules now
allow something that should be refused (or refuse something a legitimate role
needs).
