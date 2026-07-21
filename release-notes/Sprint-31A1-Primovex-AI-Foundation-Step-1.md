# Sprint 31A1 — Primovex AI Foundation (Step 1)

## Added
- Primovex AI provider boundary with mock provider factory.
- Structured response contract for answers, confidence, sources and actions.
- Session-only conversation context.
- Ask Primovex panel for desktop and mobile.
- Suggested questions, loading/reasoning/error states and source cards.
- Reduced-motion aware searching breath animation.
- Ask Primovex entry point from the existing Practice Pulse drawer.

## Safety boundaries
- No external AI provider.
- No API keys.
- No Firestore reads or writes from Primovex AI.
- No changes to login, inventory logic, Pulse calculations, Firebase rules, mobile navigation, Tauri or branding.

## Validation
- `npm run build` passed.
- Desktop and mobile routes compile with the AI provider and panel.
- Login remains outside the AI UI and its source is unchanged.
