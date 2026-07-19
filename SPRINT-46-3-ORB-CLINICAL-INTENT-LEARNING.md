# Sprint 46.3: Orb Clinical Intent Learning

Version: 0.14.3  
Orb Core: 1.3.0

## Delivered

- Clinical intent catalogue with confidence thresholds and fuzzy phrase matching.
- Emergency drugs, anaphylaxis box, crash trolley, resus trolley and common speech-recognition variants.
- Read-only emergency-drug and anaphylaxis readiness tools using the existing governed checklist data.
- Permission-filtered clarification choices when no intent is safe to execute.
- Immediate retry of the original request using the user-selected approved intent.
- Pending learning suggestions that require management approval before affecting future matching.
- Management review foundation in Developer Centre with approve/reject controls.
- Structured feedback: Perfect, Almost, Needed correction and Wrong, with correction reasons.
- Persistent local audit records for Orb interactions and language-learning suggestions.

## Safety

- Orb never silently changes its language model or operational data.
- Pending and rejected phrases do not affect future behaviour.
- Clarification choices are limited to tools allowed by the current user's capabilities.
- Emergency reconciliation remains read-only and opens the existing governed workflow for action.
- The confirmed v0.13.6 native Android voice lifecycle is unchanged.

## Acceptance phrases

- Tell me about the emergency drugs.
- How is the anaphylaxis box?
- Reconcile the resus trolley.
- Reconcile the recess trolley.

## Install and test

1. Keep the current Primovex folder as a backup and extract this full project into a new folder.
2. Run `npm install`, `npm run build`, and `npm run dev`.
3. Confirm desktop login and Developer Centre open normally.
4. In Orb, test the four acceptance phrases above by typing and Android voice.
5. Ask an intentionally unclear question, choose the expected safe action, and confirm Orb retries it.
6. Open Developer Centre → Orb learning review and approve or reject the pending suggestion.
7. Record Perfect, Almost, Needed correction, and Wrong feedback on test responses.
8. For Android, run `npm run tauri -- android build` on the configured Primovex development machine and install the generated APK.
