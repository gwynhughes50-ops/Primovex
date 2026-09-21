# Primovex rules attack suite

Tests the real `firestore.rules` (in the repository root) against the Firebase
emulator with synthetic users. Nothing here touches production or real data.
It is the evidence behind `docs/security-review-and-penetration-test.docx`.

Run it after **every** change to `firestore.rules`.

1. Install Java and the Firebase CLI.
2. In this folder: `npm install`
3. Start the emulators (from any folder that has a `firebase.json`, or from the repository root):
   `firebase emulators:start --only auth,firestore`
   The suite expects Firestore on `127.0.0.1:8080`.
4. Run: `npm test`

A healthy run ends with `63 passed, 0 failed`. A failure means the rules now
allow something that should be refused (or refuse something a legitimate role
needs).
