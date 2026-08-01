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

export function getAssuranceProfile(profileId) {
  const profile = ASSURANCE_PROFILES[profileId] || ASSURANCE_PROFILES.wales;
  const requirements = CLINICAL_GOVERNANCE_REQUIREMENTS.filter((item) => item.jurisdictions.includes(profile.id));
  return { ...profile, approved: 0, total: requirements.length, requirements };
}

export function getClinicalGovernanceReadiness() {
  return {
    mode: CLINICAL_DATA_MODE,
    liveClinicalDataAllowed: false,
    approved: 0,
    total: CLINICAL_GOVERNANCE_REQUIREMENTS.length,
    blockers: CLINICAL_GOVERNANCE_REQUIREMENTS,
    profiles: Object.keys(ASSURANCE_PROFILES).map(getAssuranceProfile),
    statement: "Real patient data is technically locked until the applicable NHS Wales deployment gates and the adopted NHS England assurance overlay have recorded approval.",
  };
}

export function assertSyntheticClinFlowMode(dataMode) {
  if (dataMode !== "synthetic") {
    throw new Error("Live clinical data is locked pending NHS information-governance and clinical-safety approval.");
  }
}
