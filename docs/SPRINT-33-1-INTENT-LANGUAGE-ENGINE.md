# Sprint 33.1 — Intent & Language Engine

## Purpose

Teach Primovex to understand how practice staff naturally phrase operational questions before a live AI provider is connected.

## Delivered

- Normalised common contractions, shorthand and practice abbreviations.
- Added intent-first routing rather than extracting the first remaining word as a search term.
- Added `inventory.summary` as an approved, permission-checked, read-only tool.
- Improved low-stock and expiry routing.
- Added useful next-expiry information when nothing expires in the requested window.
- Added session follow-up routing using the previous approved intent.
- Removed stale interface-only inventory fallback responses.

## Supported language examples

- “What stock have we got?”
- “Give me an inventory summary.”
- “What’s low?” / “Anything need ordering?” / “What’s below min?”
- “What’s OOD in the next 3 months?”
- “Where’s the ECG?” / “Locate the AED.”
- “Has MO been cleaned?” / “Is TR2 ready?”
- “Any maint jobs open?” / “What has the caretaker got outstanding?”
- “Fridge temp okay?” / “Latest cold-chain reading?”
- “Show me those items.” after a stock response.

## Safety

The language engine selects only registered approved tools. Permission checks still occur before execution. No write tools or unrestricted Firestore access were introduced.
