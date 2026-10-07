// Compliance/governance paperwork bundled with the app itself, rather than
// living only as external links — so it's still here for whoever needs it
// next, not tied to whichever tool or account produced it originally.
// `requirementId` maps to an id in CLINICAL_GOVERNANCE_REQUIREMENTS
// (src/governance/clinicalDataGate.js) so Security Centre can show real
// document status against that checklist instead of a hardcoded count.
export const GOVERNANCE_DOCUMENTS = [
  {
    id: "dpia-draft",
    requirementId: "dpia",
    title: "Data Protection Impact Assessment",
    description: "Draft DPIA, version 0.2 (7 October 2026), ICO 7-step structure. Covers Concerns, SARs, Inventory and Temperature, and now staff accounts and the organisation chart, sign-in and activity records (staff monitoring), the Orb AI language assistant (Azure OpenAI), and staff messages. Includes the technical controls as at 7 October and the decisions needed from the DPO before sign-off.",
    status: "draft",
    addedAt: "2026-10-07",
    viewPath: "/governance/dpia-draft.html",
    downloadPath: "/governance/dpia-draft.docx",
  },
  {
    id: "data-sharing-map",
    requirementId: "waspi",
    title: "Data-Sharing Map (WASPI / ISP input)",
    description: "Every external body Concerns correspondence flows to (BCUHB, Llais, MDDUS, GMPI, solicitors, coroner, police, Welsh Risk Pool) and current protocol status, for review against existing WASPI Information Sharing Protocols. Also records technical third parties, such as the QR label image service (now removed).",
    status: "draft",
    addedAt: "2026-09-18",
    viewPath: "/governance/data-sharing-map.html",
    downloadPath: "/governance/data-sharing-map.docx",
  },
  {
    id: "security-review-and-penetration-test",
    // Deliberately not mapped to the "independent security testing" checklist item:
    // this is an internal, AI-assisted review, not an independent or accredited test.
    requirementId: null,
    title: "Security Review and Penetration Test Report",
    description: "Access-control audit, the 13 findings from the 18 September 2026 security review and how each was fixed, the 63-check attack test of the real database rules in a local test copy (all passing), and the residual risks. An internal, AI-assisted review, not an independent or accredited penetration test. Supports the DPIA.",
    status: "draft",
    addedAt: "2026-09-21",
    viewPath: "/governance/security-review-and-penetration-test.html",
    downloadPath: "/governance/security-review-and-penetration-test.docx",
  },
];

export function findGovernanceDocument(requirementId) {
  return GOVERNANCE_DOCUMENTS.find((doc) => doc.requirementId === requirementId) || null;
}
