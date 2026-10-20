# Getting Primovex onto Google Play

Written 20 October 2026. Statements about Google's rules come from Google's help pages and third-party guides read that day; check the Play Console for the current wording before relying on them.

## Recommendation: the Internal testing track, not a public release

Primovex is a tool for one practice's staff, so it does not need to be in the public store.

| | Internal testing | Production (public) |
|---|---|---|
| Who can install | Up to 100 people you list by email | Anyone |
| Google review | Reported not to need one; a build is available within minutes | Yes |
| Extra rules for a new personal account | None found | A closed test with at least 12 people opted in for 14 days in a row first (applies to personal accounts created after 13 Nov 2023) |
| Updates | Staff get them in the Play Store like any app | Same |

Staff install from a link you send them, then updates arrive through the Play Store by themselves. Staff must have a Google account on their phone (an NHS Wales email address only works if it was used to create a Google account).

## What only you can do

1. **Create a Google Play developer account** at play.google.com/console. One-off fee (about $25), identity verification, and a payment profile. A personal account shows your legal name as the developer. An organisation account avoids the 12-tester rule but needs a registered organisation and a D-U-N-S number, so it waits until Primovex is a company.
2. **Create the app** in the console: name Primovex, default language English (UK), App, Free. The package name is `uk.co.primovex.app` and cannot change later.
3. **Play App Signing** (see the next section). This is the decision that matters most.
4. **Add testers**: Testing, Internal testing, Testers, create an email list, add staff addresses, and copy the opt-in link.
5. **Upload the bundle** (from `release/play/primovex-<version>.aab`) as a new release on the Internal testing track and roll it out.
6. Fill in the **App content** declarations the console asks for (privacy policy, data safety, ads, target audience, content rating). The facts for these are below.

## Signing: keep the key already used by the Android app

The Android app staff have now is signed with `src-tauri/gen/android/app/primovex-release-key.jks` (details in the git-ignored `keystore.properties`).

- If Play App Signing is set up with that same key (the console option to upload an existing key, which uses Google's PEPK export tool), the Play version has the same signature as the installed one and **updates over the top of it**. Staff do not lose anything.
- If instead Google generates a new signing key, the Play version has a different signature and Android will not update the installed app. Everyone would have to uninstall first, losing anything stored only on the phone, such as checks waiting to send.

So: choose the option to use the existing key when the console asks. Back up the `.jks` file and its passwords in a safe place off this computer first. If that key is lost before Play holds a copy, no update can be signed.

## What the app needs to declare (from the code, 20 Oct 2026)

Permissions in the Android manifest:

| Permission | Why |
|---|---|
| Internet | Everything runs against the practice's Firebase project |
| Camera | Scanning barcodes and QR codes (stock, compliance tags, PAT labels) |
| Microphone | Talking to the Orb |
| NFC | Tapping compliance and fridge tags |
| Bluetooth scan (not used for location) | Connecting to practice sensors |
| Location (Android 11 and older only) | Required by those versions for Bluetooth scanning; not used to find where anyone is |

Data: staff accounts and the practice's own operational records (stock, checks, temperatures, concerns, SARs, timesheets). No advertising, no selling of data, no tracking across apps. Data is processed by Google Firebase in the practice's own project and sent over encrypted connections. The patient-identifying details stay out of the app by design (EMIS numbers or initials, never names), but the Data safety form must still describe what it holds honestly: take its wording from the DPIA pack rather than from this page.

## Still to do before a public release (not needed for Internal testing)

- A **privacy policy** at a public web address (there is none on the site yet). It should be reviewed by whoever acts as the practice's data protection lead before it is published.
- Store listing: 512x512 icon, 1024x500 feature graphic, at least two phone screenshots, short and full descriptions.
- Content rating questionnaire and target audience (adults only).
- If it is ever opened to the public: the closed test with 12 testers for 14 days, then apply for production access.

## Releasing an update later

```
npm run release -- --android --play --bump --notes "What is new"
```

Each Play upload needs a version higher than the last one (the script's `--bump` does this; the Android version code is worked out from the version number). Send the Firebase email build and the Play bundle from the same release so everyone has the same version.
