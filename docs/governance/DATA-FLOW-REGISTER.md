# ClinFlow Data-Flow Register — Approval Template

No real clinical flow is authorised by this document. Complete one row for every proposed flow.

| ID | Source | Destination | Data categories | Purpose | Controller / processor | Hosting country | Encryption | Retention / deletion | Lawful basis | Approved |
|---|---|---|---|---|---|---|---|---|---|---|
| DEMO-01 | Primovex local demonstration | Firestore workflow collections | Non-identifying synthetic workflow state and authenticated UID | Test workflow persistence | To confirm | To confirm contractually | TLS in transit; provider-managed at rest | Synthetic test schedule to approve | Not personal health data by design | Engineering only |
| LIVE-01 | Clinical correspondence source | Secure ingestion gateway | Proposed patient identifiers and clinical correspondence | ClinFlow processing | **To complete** | **To complete** | **To evidence** | **To approve** | **To approve** | No |
| LIVE-02 | Secure ingestion gateway | Document/OCR processor | Minimum necessary document content | Proposed extraction | **To complete** | **To complete** | **To evidence** | **To approve** | **To approve** | No |
| LIVE-03 | Governed data services | Authorised Primovex user | Role-filtered clinical and workflow information | Human review and action | **To complete** | **To complete** | **To evidence** | **To approve** | **To approve** | No |

For each live flow attach the processor agreement, sub-processor list, data-location evidence, support-access model, international-transfer analysis, security controls and tested deletion mechanism.

