# Primovex v0.15.32 — ClinFlow Azure Throttle Repair

- Handles temporary Azure HTTP 429 responses using `Retry-After` where provided.
- Applies bounded exponential backoff to document submission and result polling.
- Adds a three-second provider-capacity pause between batch documents.
- Adds **Retry this document** so one throttled file can be retried without repeating successful files.
- Preserves the v0.15.31 ClinFlow companion-summary, SNOMED candidate review and original-document download workflow.
