# Sprint 37.2 — Product Readiness & First Experience

- NHS Blue is the default for new users and installations.
- Theme preference synchronises through `/users/{uid}.themePreference`, with local fallback.
- First System Administrator is guided through practice setup after sign-in.
- Setup can be reopened from Security Centre.
- Desktop login Experience Primovex spacing corrected.
- Android installed app no longer invokes Web NFC, which Android WebView can expose but deny. It uses the programmed-tag tap-to-open path until the native bridge sprint.
- Mobile barcode scanner uses a safe-area-aware full-height sheet, improved camera sizing, camera permission guidance and higher z-index.
