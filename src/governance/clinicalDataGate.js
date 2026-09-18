import { findGovernanceDocument } from "@/config/governanceDocuments";

// This mode name and the "locked" language below describe ClinFlow
// specifically (see assertSyntheticClinFlowMode) — it is the one module
// actually enforced, client-side and in firestore.rules, to synthetic data
// only. Concerns, SARs, Inventory and Temperature have no such gate and are
// live today; see getClinicalGovernanceReadiness()'s statement.
export const CLINICAL_DATA_MODE = "synthetic_locked";

export const ASSURANCE_PROFILES = {
  wales: {
    id: "wales",
    label: "NHS Wales",
    deploymentStatus: "primary",
    frameworks: [
      "Welsh Information Governance Toolkit",
      "WASPI",
      "Welsh Records Management Code of Practice 2022",
      "DHCW / Health Board assurance",
    ],
  },
  england: {
    id: "england",
    label: "NHS England",
    deploymentStatus: "compatibility",
    frameworks: ["DSPT", "DTAC", "DCB0129", "DCB0160", "NHS England Records Management Code"],
  },
};

export const CLINICAL_GOVERNANCE_REQUIREMENTS = [
  { id: "controller", label: "Controller, processor and joint-controller roles recorded", owner: "Information Governance Lead", jurisdictions: ["wales", "england"] },
  { id: "lawful_basis", label: "Article 6 lawful basis and Article 9 condition approved", owner: "DPO / Controller", jurisdictions: ["wales", "england"] },
  { id: "dpia", label: "DPIA completed, risks mitigated and signed", owner: "DPO / Controller", jurisdictions: ["wales", "england"] },
  { id: "privacy_notice", label: "Layered privacy and AI transparency information approved", owner: "Information Governance Lead", jurisdictions: ["wales", "england"] },
  { id: "retention", label: "Record classes and jurisdiction-appropriate retention schedule approved", owner: "Records Manager", jurisdictions: ["wales", "england"] },
  { id: "contracts", label: "Article 28 terms, sub-processors and transfer safeguards approved", owner: "Controller / Legal", jurisdictions: ["wales", "england"] },
  { id: "welsh_ig_toolkit", label: "Welsh Information Governance Toolkit evidence completed", owner: "Information Governance Lead", jurisdictions: ["wales"] },
  { id: "waspi", label: "Applicable WASPI agreement and data-flow schedule approved", owner: "Controller / DPO", jurisdictions: ["wales"] },
  { id: "dhcw_assurance", label: "DHCW or commissioning Health Board assurance route confirmed", owner: "Service Owner", jurisdictions: ["wales"] },
  { id: "dspt", label: "Applicable DSPT assessment has acceptable in-year status", owner: "Security Lead", jurisdictions: ["england"] },
  { id: "dtac", label: "DTAC evidence reviewed across all five assessment areas", owner: "Product Owner", jurisdictions: ["england"] },
  { id: "dcb0129", label: "DCB0129 Clinical Safety Case and Hazard Log signed by a CSO", owner: "Clinical Safety Officer", jurisdictions: ["wales", "england"] },
  { id: "dcb0160", label: "Deploying organisation clinical-safety responsibilities recorded", owner: "Deploying Organisation / CSO", jurisdictions: ["wales", "england"] },
  { id: "security_test", label: "Independent security testing and remediation completed", owner: "Security Lead", jurisdictions: ["wales", "england"] },
  { id: "incident", label: "Breach and clinical-safety incident procedures exercised", owner: "DPO / CSO", jurisdictions: ["wales", "england"] },
  { id: "access_review", label: "Least-privilege roles, MFA and periodic access review evidenced", owner: "System Administrator", jurisdictions: ["wales", "england"] },
  { id: "tenant_isolation", label: "Server-enforced tenant isolation verified across every collection", owner: "Security Lead", jurisdictions: ["wales", "england"] },
  { id: "client_hardening", label: "Desktop CSP, App Check and secure mobile credential storage implemented", owner: "Security Lead", jurisdictions: ["wales", "england"] },
  { id: "dependency", label: "Dependency vulnerabilities triaged and release SBOM approved", owner: "Engineering Lead", jurisdictions: ["wales", "england"] },
  { id: "continuity", label: "Backup, restore, downtime and decommissioning plans tested", owner: "Service Owner", jurisdictions: ["wales", "england"] },
  { id: "accessibility", label: "Accessibility and usability assessment completed", owner: "Product Owner", jurisdictions: ["wales", "england"] },
];

// A requirement counts as "documented" once a matching draft/approved
// document exists (see src/config/governanceDocuments.js) — distinct from
// "approved", which needs an actual sign-off, not just paperwork existing.
function withDocumentStatus(item) {
  const doc = findGovernanceDocument(item.id);
  return { ...item, documentStatus: doc ? doc.status : "not_started", document: doc };
}

export function getAssuranceProfile(profileId) {
  const profile = ASSURANCE_PROFILES[profileId] || ASSURANCE_PROFILES.wales;
  const requirements = CLINICAL_GOVERNANCE_REQUIREMENTS.filter((item) => item.jurisdictions.includes(profile.id)).map(withDocumentStatus);
  const approved = requirements.filter((r) => r.documentStatus === "approved").length;
  const documented = requirements.filter((r) => r.documentStatus === "draft" || r.documentStatus === "approved").length;
  return { ...profile, approved, documented, total: requirements.length, requirements };
}

export function getClinicalGovernanceReadiness() {
  const requirements = CLINICAL_GOVERNANCE_REQUIREMENTS.map(withDocumentStatus);
  const approved = requirements.filter((r) => r.documentStatus === "approved").length;
  const documented = requirements.filter((r) => r.documentStatus === "draft" || r.documentStatus === "approved").length;
  return {
    mode: CLINICAL_DATA_MODE,
    liveClinicalDataAllowed: false,
    approved,
    documented,
    total: CLINICAL_GOVERNANCE_REQUIREMENTS.length,
    blockers: requirements,
    profiles: Object.keys(ASSURANCE_PROFILES).map(getAssuranceProfile),
    statement: "ClinFlow's clinical-coding workflow is technically locked to synthetic data pending full NHS assurance sign-off across the checklist below. Concerns, SARs, Inventory and Temperature carry no such lock and are in live, active use under the practice's existing governance ahead of that full sign-off — see the governance documents below for what's drafted so far.",
  };
}

export function assertSyntheticClinFlowMode(dataMode) {
  if (dataMode !== "synthetic") {
    throw new Error("Live clinical data is locked pending NHS information-governance and clinical-safety approval.");
  }
}
