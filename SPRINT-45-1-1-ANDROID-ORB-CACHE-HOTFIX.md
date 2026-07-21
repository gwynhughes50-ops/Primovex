# Sprint 45.1.1 — Android Orb Cache Hotfix

Version: 0.13.2

- Reworked Fridge/unit queries to tolerate Android Firestore cache failures.
- Removed ordered cold-chain query from the Orb path.
- Reads unit registry and logs independently with `Promise.allSettled`.
- Prevents raw Firestore timestamps/documents entering the conversation response.
- Returns a safe operational error instead of allowing the mobile WebView to fail.
- Preserves Sprint 45.1 visual, safe-area and Smart Intelligence work.
