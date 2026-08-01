# Primovex Technical Compliance Gap Register

Status: **Open** — these items block approval for real patient data.

| Gap | Risk | Required treatment | Release gate |
|---|---|---|---|
| Tauri Content Security Policy is unset | Injection or unapproved network/content execution | Define and test a least-privilege CSP compatible with required Firebase services | Block live clinical data |
| MFA and privileged re-authentication are not enforced | Account compromise or unauthorised admin change | Enforce MFA and recent authentication for privileged actions | Block live clinical data |
| Mobile quick-unlock PIN verifier uses browser local storage | Offline guessing or device compromise | Move credential material to Android Keystore/iOS Keychain through an approved native secure-storage design | Block clinical mobile deployment |
| Legacy Firestore collections commonly allow any signed-in user | Cross-role or cross-practice access | Introduce server-verifiable tenant claims and collection-specific capability rules; test with the emulator | Block multi-practice/live clinical data |
| Firebase App Check is not evidenced | Abuse by unofficial clients | Implement, monitor and then enforce supported App Check providers | Block live API access |
| Dependency audit reported unresolved vulnerabilities | Supply-chain or runtime exposure | Triage reachability, patch safely, create SBOM and approve exceptions with expiry | Block production assurance |
| Independent penetration test not completed | Unknown exploitable weaknesses | Commission scoped web, desktop, mobile, Firebase and cloud-function testing; remediate findings | Block live clinical data |
| Central log-redaction standard not evidenced | Personal data may enter diagnostic logs | Structured allowlisted logging, automated tests and retention controls | Block live clinical data |
| Backup, restore and deletion propagation not tested | Loss, excessive retention or failed recovery | Test recovery objectives and verified disposal across primary data, exports and backups | Block live clinical data |
| Desktop installer signing/provenance not evidenced | Users cannot reliably verify publisher/integrity | Code-sign releases, protect signing keys, publish hashes and retain build provenance | Block general production release |
| Clinical safety process not established | Software behavior could contribute to harm | Appoint CSO and complete DCB0129 plan, hazard log and safety case | Block clinical use |

## ClinFlow-specific containment already implemented

- Firestore accepts only synthetic workflow metadata from the client.
- Patient identity, document content and note text are not uploaded.
- A non-synthetic mode assertion fails closed in the ClinFlow service.
- The Security Centre visibly reports that live clinical data is locked.

The gap register must be reviewed after each material release and closed only against verifiable evidence.
