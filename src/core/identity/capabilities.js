/**
 * Primovex Identity & Access Platform
 *
 * Capability format: "domain.action".
 * Examples: "inventory.read", "connect.manageDevices", "admin.manageUsers".
 *
 * This keeps role names flexible. A Practice Manager, Nurse, HCA or custom role
 * can be granted the same capability without changing code.
 */

export const CAPABILITIES = {
  dashboard: {
    read: "dashboard.read",
  },
  operations: {
    read: "operations.read",
    manage: "operations.manage",
  },
  inventory: {
    read: "inventory.read",
    write: "inventory.write",
    adjust: "inventory.adjust",
    verify: "inventory.verify",
    delete: "inventory.delete",
    purge: "inventory.purge",
  },
  purchasing: {
    read: "purchasing.read",
    write: "purchasing.write",
    approve: "purchasing.approve",
  },
  suppliers: {
    read: "suppliers.read",
    write: "suppliers.write",
  },
  governance: {
    read: "governance.read",
    write: "governance.write",
    manageSars: "governance.manageSars",
    manageComplaints: "governance.manageComplaints",
    manageConcerns: "governance.manageConcerns",
    concernsTeam: "governance.concernsTeam",
    seTeam: "governance.seTeam",
    partnerAccess: "governance.partnerAccess",
  },
  connect: {
    view: "connect.view",
    manageDevices: "connect.manageDevices",
    acknowledgeAlerts: "connect.acknowledgeAlerts",
  },
  temperature: {
    read: "temperature.read",
    write: "temperature.write",
    resolveIncident: "temperature.resolveIncident",
  },
  compliance: {
    read: "compliance.read",
    write: "compliance.write",
    recordChecks: "compliance.recordChecks",
    manageAssets: "compliance.manageAssets",
  },
  stocktake: {
    count: "stocktake.count",
    manage: "stocktake.manage",
  },
  training: {
    manage: "training.manage",
    manageClinical: "training.manageClinical",
  },
  timesheets: {
    manage: "timesheets.manage",
    payroll: "timesheets.payroll",
  },
  waste: {
    read: "waste.read",
    manage: "waste.manage",
  },
  coshh: {
    read: "coshh.read",
    manage: "coshh.manage",
  },
  practiceAdmin: {
    read: "practiceAdmin.read",
    write: "practiceAdmin.write",
  },
  reports: {
    read: "reports.read",
    inspection: "reports.inspection",
  },
  clinflow: {
    read: "clinflow.read",
    capture: "clinflow.capture",
    workflow: "clinflow.workflow",
    manage: "clinflow.manage",
  },
  theme: {
    lab: "theme.lab",
  },
  admin: {
    access: "admin.access",
    manageUsers: "admin.manageUsers",
    manageRoles: "admin.manageRoles",
    manageSettings: "admin.manageSettings",
  },
  mobile: {
    access: "mobile.access",
    biometricUnlock: "mobile.biometricUnlock",
  },
  audit: {
    read: "audit.read",
    write: "audit.write",
  },
  security: {
    read: "security.read",
    manage: "security.manage",
  },
};

// Starting points offered when an administrator adds a role (Roles &
// Permissions > Add Role). They only pre-fill the form - nothing is created
// until the role is saved, and every permission can be changed first.
export const ROLE_PRESETS = [
  {
    name: "Salaried GP",
    description: "Uses stock but not the emergency drugs or anaphylaxis boxes. Sees only their own training, timesheet and mileage, the significant events they report or are named in, and the concerns they are named in (where they can add a statement or note). Nothing else is switched on.",
    homeType: "clinical",
    permissions: [
      "governance.reportEvents",
      "dashboard.read",
      "inventory.read",
      "inventory.adjust",
      "governance.concernsInvolved",
      "mobile.access",
      "mobile.biometricUnlock",
    ],
  },
  {
    name: "Stock Controller",
    description: "Looks after stock and may permanently delete stock items. Give this role only to the logins you trust with that.",
    permissions: [
      "dashboard.read",
      "operations.read",
      "inventory.read",
      "inventory.write",
      "inventory.adjust",
      "inventory.verify",
      "inventory.delete",
      "inventory.purge",
      "purchasing.read",
      "suppliers.read",
      "mobile.access",
      "mobile.biometricUnlock",
    ],
  },
];

export const ALL_CAPABILITIES = Object.values(CAPABILITIES).flatMap((group) => Object.values(group));

export const CAPABILITY_CATALOG = [
  { id: "dashboard.read", label: "View dashboard", group: "Core" },
  { id: "operations.read", label: "View Operations Centre", group: "Core" },
  { id: "operations.manage", label: "Manage operational work", group: "Core" },

  { id: "inventory.read", label: "View inventory", group: "Inventory" },
  { id: "inventory.kits", label: "Emergency drugs and anaphylaxis boxes: see them and record their checks (leave unticked for stock only)", group: "Inventory" },
  { id: "inventory.write", label: "Create/edit stock", group: "Inventory" },
  { id: "inventory.adjust", label: "Adjust stock levels", group: "Inventory" },
  { id: "inventory.verify", label: "Complete stock verification", group: "Inventory" },
  { id: "inventory.delete", label: "Delete/archive stock", group: "Inventory" },
  { id: "inventory.purge", label: "Permanently delete stock items (cannot be undone)", group: "Inventory" },

  { id: "purchasing.read", label: "View purchasing", group: "Purchasing" },
  { id: "purchasing.write", label: "Create/edit purchase orders", group: "Purchasing" },
  { id: "purchasing.approve", label: "Approve purchase orders", group: "Purchasing" },
  { id: "suppliers.read", label: "View suppliers", group: "Purchasing" },
  { id: "suppliers.write", label: "Manage suppliers", group: "Purchasing" },

  { id: "governance.read", label: "View governance", group: "Governance" },
  { id: "governance.write", label: "Update governance records", group: "Governance" },
  { id: "governance.manageSars", label: "Manage SARs", group: "Governance" },
  { id: "governance.manageComplaints", label: "Manage complaints", group: "Governance" },
  { id: "governance.manageConcerns", label: "Manage Listening to People concerns", group: "Governance" },
  { id: "governance.reportEvents", label: "Significant events: report one, and see the ones they report or are named on", group: "Governance" },
  { id: "governance.concernsInvolved", label: "Concerns: see only the ones they are named in, and add a statement or note to them", group: "Governance" },
  { id: "governance.concernsTeam", label: "Concerns team — full access to every concern", group: "Governance" },
  { id: "governance.seTeam", label: "Significant events team — full access to every significant event", group: "Governance" },
  { id: "governance.partnerAccess", label: "Partner — read-only visibility across all governance records", group: "Governance" },

  { id: "connect.view", label: "View Primovex Connect", group: "Connect" },
  { id: "connect.manageDevices", label: "Add/edit connected devices", group: "Connect" },
  { id: "connect.acknowledgeAlerts", label: "Acknowledge device alerts", group: "Connect" },

  { id: "temperature.read", label: "View temperature logs", group: "Compliance" },
  { id: "temperature.write", label: "Record temperature logs", group: "Compliance" },
  { id: "temperature.resolveIncident", label: "Resolve temperature incidents", group: "Compliance" },
  { id: "compliance.read", label: "View compliance", group: "Compliance" },
  { id: "compliance.write", label: "Update compliance", group: "Compliance" },
  { id: "compliance.recordChecks", label: "Record QR/NFC compliance checks", group: "Compliance" },
  { id: "compliance.manageAssets", label: "Manage QR/NFC compliance assets", group: "Compliance" },
  { id: "stocktake.count", label: "Take part in a stock take (claim places, count, add items found)", group: "Inventory" },
  { id: "stocktake.manage", label: "Request, review and apply a stock take", group: "Inventory" },
  { id: "training.view", label: "Staff training: see everyone's record, read only", group: "Staff" },
  { id: "training.manage", label: "Staff training: see and update everyone's training record", group: "Staff" },
  { id: "training.manageClinical", label: "Staff training: see and update the clinical team's training record", group: "Staff" },
  { id: "timesheets.manage", label: "Timesheets: set up everyone's working pattern and hours, and see and update their timesheets", group: "Staff" },
  { id: "timesheets.payroll", label: "Timesheets: the payroll team. See signed-off timesheets and send them to payroll, or return one with a reason", group: "Staff" },
  { id: "waste.read", label: "Clinical waste: see the consignment notes and collection records", group: "Compliance" },
  { id: "waste.manage", label: "Clinical waste: add consignment notes (drop in the Stericycle PDF) and correct them", group: "Compliance" },
  { id: "coshh.read", label: "View the COSHH register (hazardous substances, PPE, first aid)", group: "Compliance" },
  { id: "coshh.manage", label: "Maintain the COSHH register and upload safety data sheets", group: "Compliance" },

  { id: "practiceAdmin.read", label: "View practice admin", group: "Administration" },
  { id: "practiceAdmin.write", label: "Update practice admin", group: "Administration" },
  { id: "reports.read", label: "View reports", group: "Insight" },
  { id: "reports.inspection", label: "Prepare inspection evidence reports (HEIW, Health and Safety)", group: "Insight" },
  { id: "clinflow.read", label: "View ClinFlow", group: "ClinFlow" },
  { id: "clinflow.capture", label: "Capture ClinFlow documents", group: "ClinFlow" },
  { id: "clinflow.workflow", label: "Process ClinFlow workflow", group: "ClinFlow" },
  { id: "clinflow.manage", label: "Manage ClinFlow settings and learning", group: "ClinFlow" },
  { id: "theme.lab", label: "Use Theme Lab", group: "Design System" },

  { id: "mobile.access", label: "Use Primovex Mobile", group: "Mobile" },
  { id: "mobile.biometricUnlock", label: "Use biometric quick unlock", group: "Mobile" },

  { id: "admin.access", label: "Access admin area", group: "System" },
  { id: "admin.manageUsers", label: "Manage users", group: "System" },
  { id: "admin.manageRoles", label: "Manage roles and permissions", group: "System" },
  { id: "admin.manageSettings", label: "Manage system settings", group: "System" },
  { id: "audit.read", label: "View audit logs", group: "System" },
  { id: "audit.write", label: "Write audit events", group: "System" },
  { id: "orb.learning.review", label: "Review Orb language learning", group: "System" },
  { id: "security.read", label: "View Security Centre", group: "System" },
  { id: "security.manage", label: "Manage security settings", group: "System" },
];

export const ROLE_TEMPLATES = {
  "System Admin": ["*"],
  "Practice Manager": [
    "governance.reportEvents",
    "stocktake.count",
    "stocktake.manage",
    "training.manage",
    "waste.read",
    "waste.manage",
    "timesheets.manage",
    "clinflow.read",
    "clinflow.capture",
    "clinflow.workflow",
    "clinflow.manage",
    "dashboard.read",
    "operations.read",
    "operations.manage",
    "inventory.read",
    "inventory.kits",
    "inventory.write",
    "inventory.adjust",
    "inventory.verify",
    "inventory.delete",
    "purchasing.read",
    "purchasing.write",
    "purchasing.approve",
    "suppliers.read",
    "suppliers.write",
    "governance.read",
    "governance.write",
    "governance.manageSars",
    "governance.manageComplaints",
    "governance.manageConcerns",
    "governance.concernsTeam",
    "governance.seTeam",
    "connect.view",
    "connect.manageDevices",
    "connect.acknowledgeAlerts",
    "temperature.read",
    "temperature.write",
    "temperature.resolveIncident",
    "compliance.read",
    "compliance.write",
    "compliance.recordChecks",
    "compliance.manageAssets",
    "coshh.read",
    "coshh.manage",
    "reports.inspection",
    "practiceAdmin.read",
    "practiceAdmin.write",
    "reports.read",
    "theme.lab",
    "mobile.access",
    "mobile.biometricUnlock",
    "admin.access",
    "admin.manageUsers",
    "admin.manageRoles",
    "admin.manageSettings",
    "audit.read",
    "audit.write",
    "orb.learning.review",
    "security.read",
    "security.manage",
  ],
  "User": [
    "governance.reportEvents",
    "stocktake.count",
    "clinflow.read",
    "clinflow.workflow",
    "dashboard.read",
    "operations.read",
    "inventory.read",
    "inventory.kits",
    "inventory.write",
    "inventory.adjust",
    "inventory.verify",
    "purchasing.read",
    "suppliers.read",
    "connect.view",
    "temperature.read",
    "temperature.write",
    "compliance.read",
    "compliance.recordChecks",
    "mobile.access",
    "mobile.biometricUnlock",
  ],
  "Nurse": [
    "governance.reportEvents",
    "stocktake.count",
    "clinflow.read",
    "clinflow.workflow",
    "dashboard.read",
    "operations.read",
    "inventory.read",
    "inventory.kits",
    "inventory.write",
    "inventory.verify",
    "connect.view",
    "temperature.read",
    "temperature.write",
    "temperature.resolveIncident",
    "compliance.read",
    "compliance.recordChecks",
    "mobile.access",
    "mobile.biometricUnlock",
  ],
  "HCA": [
    "governance.reportEvents",
    "stocktake.count",
    "dashboard.read",
    "operations.read",
    "inventory.read",
    "inventory.kits",
    "inventory.write",
    "inventory.verify",
    "connect.view",
    "temperature.read",
    "temperature.write",
    "mobile.access",
    "mobile.biometricUnlock",
  ],
  "Reception": [
    "governance.reportEvents",
    "stocktake.count",
    "clinflow.read",
    "clinflow.capture",
    "clinflow.workflow",
    "dashboard.read",
    "operations.read",
    "inventory.read",
    "inventory.kits",
    "purchasing.read",
    "governance.read",
    "governance.write",
    "governance.manageConcerns",
    "governance.concernsTeam",
    "connect.view",
    "mobile.access",
  ],
  "Caretaker": [
    "governance.reportEvents",
    "stocktake.count",
    "dashboard.read",
    "operations.read",
    "connect.view",
    "temperature.read",
    "temperature.write",
    "compliance.read",
    "compliance.write",
    "compliance.recordChecks",
    "compliance.manageAssets",
    "coshh.read",
    "coshh.manage",
    "mobile.access",
  ],
  "Cleaner": [
    "dashboard.read",
    "operations.read",
    "coshh.read",
    "mobile.access",
  ],
  // Practice partners: read-only visibility across every governance record
  // (Concerns, SARs, complaints) regardless of whether they're personally
  // involved in a given case — but no edit rights anywhere in governance.
  // Only the Concerns team (a capability layered onto any role, not a
  // separate role) can actually change a case.
  "Partner": [
    "governance.reportEvents",
    "dashboard.read",
    "governance.read",
    "governance.partnerAccess",
    "coshh.read",
    "mobile.access",
  ],
  "ReadOnly": [
    "governance.reportEvents",
    "clinflow.read",
    "dashboard.read",
    "operations.read",
    "inventory.read",
    "inventory.kits",
    "purchasing.read",
    "suppliers.read",
    "governance.read",
    "connect.view",
    "temperature.read",
    "compliance.read",
    "reports.read",
  ],
};

// ---- ready-made sets from the practice's "who sees what" table (October 2026) -------------------------------------------------
// Each is a starting point in Roles & Permissions (Add Role, or Edit on an original role): nothing changes until the role is saved.
// `appliesTo` names the original roles a set is the recommended one for, so Edit can offer it.
const dropFrom = (list, drop) => list.filter((id) => !drop.includes(id));
const GP_SET = ["governance.reportEvents", "dashboard.read", "inventory.read", "inventory.adjust", "governance.concernsInvolved", "mobile.access", "mobile.biometricUnlock"];

ROLE_PRESETS.push(
  {
    name: "Advanced Practitioner",
    description: "The same as a Salaried GP: uses stock only (no emergency drugs or anaphylaxis boxes), sees their own training, timesheet and mileage, the significant events they report or are named in, and the concerns they are named in. Give an individual the fridge checks or anything else as an exception.",
    homeType: "clinical",
    permissions: GP_SET,
  },
  {
    name: "Partner (stock and oversight)",
    description: "Uses stock only. Can look at (not change) every concern, SAR and significant event, compliance, COSHH, everyone's training and the inspection pack and reports.",
    homeType: "partner",
    appliesTo: ["Partner"],
    permissions: [
      "governance.reportEvents", "dashboard.read", "inventory.read", "inventory.adjust",
      "governance.read", "governance.partnerAccess",
      "compliance.read", "coshh.read", "training.view", "reports.read", "reports.inspection",
      "mobile.access", "mobile.biometricUnlock",
    ],
  },
  {
    name: "Nurse and HCA",
    description: "Uses, checks and counts stock, checks the emergency drugs and anaphylaxis boxes, records fridge temperatures, can look at COSHH, and sees the concerns they are named in. No compliance, ClinFlow or management screens. A clinical lead is given the clinical team's training as an exception.",
    homeType: "clinical",
    appliesTo: ["Nurse", "HCA"],
    permissions: [
      "governance.reportEvents", "dashboard.read", "operations.read",
      "inventory.read", "inventory.write", "inventory.adjust", "inventory.verify", "inventory.kits", "stocktake.count",
      "temperature.read", "temperature.write", "temperature.resolveIncident", "connect.view", "coshh.read",
      "governance.concernsInvolved", "mobile.access", "mobile.biometricUnlock",
    ],
  },
  {
    name: "Reception and front desk",
    description: "Looks at stock and orders it, and sees only the concerns they are named in (not the whole register).",
    homeType: "reception",
    appliesTo: ["Reception"],
    permissions: [
      "governance.reportEvents", "dashboard.read", "operations.read", "inventory.read", "purchasing.read", "purchasing.write",
      "governance.concernsInvolved", "mobile.access",
    ],
  },
  {
    name: "Medical Secretary",
    description: "Runs the concerns and the SARs (full access to both). Nothing else beyond their own timesheet, mileage and training.",
    homeType: "reception",
    permissions: [
      "governance.reportEvents", "dashboard.read", "governance.read", "governance.write", "governance.manageSars", "governance.manageConcerns", "governance.concernsTeam",
      "mobile.access", "mobile.biometricUnlock",
    ],
  },
  {
    name: "Caretaker (premises)",
    description: "Does the fire, water, PAT and certificate checks and manages the compliance register, clinical waste and COSHH, maintenance and cleaning. Looks at fridge temperatures but does not record them. Sees the concerns they are named in.",
    homeType: "caretaker",
    appliesTo: ["Caretaker"],
    permissions: [
      "governance.reportEvents", "dashboard.read", "operations.read", "operations.manage", "connect.view", "temperature.read",
      "compliance.read", "compliance.write", "compliance.recordChecks", "compliance.manageAssets",
      "coshh.read", "waste.read", "waste.manage", "governance.concernsInvolved", "mobile.access",
    ],
  },
  {
    name: "Cleaner (cleaning)",
    description: "Records the cleaning and reports issues. Nothing else.",
    homeType: "general",
    appliesTo: ["Cleaner"],
    permissions: ["dashboard.read", "operations.read", "mobile.access"],
  },
  {
    name: "Sub Manager",
    description: "Everything the Practice Manager has except setting up and seeing everyone's timesheets. They sign off timesheets and mileage for the people who name them as their line manager.",
    homeType: "manager",
    permissions: dropFrom(ROLE_TEMPLATES["Practice Manager"], ["timesheets.manage"]),
  },
  {
    name: "IT Team",
    description: "Every permission, for the people who run Primovex. (A System Admin has everything as well, and nothing can narrow that.)",
    homeType: "manager",
    permissions: CAPABILITY_CATALOG.map((c) => c.id),
  },
);

// the set this practice recommends for a role, matched by the role's name or the original role it applies to
export function recommendedPresetFor(roleName) {
  const wanted = String(roleName || "").trim().toLowerCase();
  if (!wanted) return null;
  return ROLE_PRESETS.find((preset) => preset.name.toLowerCase() === wanted || (preset.appliesTo || []).some((name) => name.toLowerCase() === wanted)) || null;
}

const LEGACY_PERMISSION_MAP = {
  "stock:read": "inventory.read",
  "stock:write": "inventory.write",
  dashboard: "dashboard.read",
  inventory: "inventory.read",
  purchasing: "purchasing.read",
  suppliers: "suppliers.read",
  governance: "governance.read",
  reports: "reports.read",
  practice_admin: "practiceAdmin.read",
  temperature: "temperature.read",
  compliance: "compliance.read",
  reorder: "purchasing.read",
  deliveries: "purchasing.write",
  settings: "admin.manageSettings",
};

function normaliseCapability(capability) {
  return LEGACY_PERMISSION_MAP[capability] || capability;
}

function flattenProfilePermissions(profile) {
  const permissions = profile?.permissions;

  if (Array.isArray(permissions)) {
    return permissions.map(normaliseCapability);
  }

  if (!permissions || typeof permissions !== "object") return [];

  const flattened = [];
  Object.entries(permissions).forEach(([domain, actions]) => {
    if (actions === true) {
      flattened.push(domain);
      return;
    }
    if (Array.isArray(actions)) {
      actions.forEach((action) => flattened.push(normaliseCapability(`${domain}.${action}`)));
      return;
    }
    if (actions && typeof actions === "object") {
      Object.entries(actions).forEach(([action, allowed]) => {
        if (allowed) flattened.push(normaliseCapability(`${domain}.${action}`));
      });
    }
  });

  return flattened;
}

// customRoleCapabilities: { [roleName]: capabilityId[] }, admin-defined roles
// loaded live from Firestore (see AuthContext's "roles" subscription) — kept
// as a plain argument rather than importing Firestore here so this stays a
// framework-agnostic pure function.
// The original roles an administrator may change the permissions of (every original role except System Admin, whose access is never narrowed). A change is kept
// in role_overrides/{role}; the same list is mirrored by hand in firestore.rules, storage.rules and functions/services/roleCapabilities.js.
export const OVERRIDABLE_ROLES = ["Practice Manager", "Nurse", "HCA", "Reception", "Caretaker", "Cleaner", "Partner", "User", "ReadOnly"];

// Roles and role changes saved before a permission existed keep what they could do until the role is next saved (which writes the
// current capabilitiesVersion): the emergency drugs and anaphylaxis boxes for anyone who could see inventory (before version 2), and
// reporting a significant event (before version 3). Mirrored by hand in firestore.rules, storage.rules and
// functions/services/roleCapabilities.js.
export const CAPABILITIES_VERSION = 3;
export function withLegacyCapabilities(capabilities, version) {
  if (!Array.isArray(capabilities) || Number(version) >= CAPABILITIES_VERSION) return capabilities;
  const v = Number(version) || 1;
  const out = [...capabilities];
  // before version 2 anyone who could see inventory could see the emergency drugs and anaphylaxis boxes
  if (v < 2 && out.includes("inventory.read") && !out.includes("inventory.kits")) out.push("inventory.kits");
  // before version 3 anyone could report a significant event
  if (!out.includes("governance.reportEvents")) out.push("governance.reportEvents");
  return out;
}

// One person's exceptions to their role, set by an administrator and kept on their own record: things switched on that the role
// does not give them (allow), and things switched off that it does (deny). Written only by an administrator (firestore.rules).
export function permissionExceptionsOf(profile) {
  const list = (value) => (Array.isArray(value) ? [...new Set(value.filter((x) => typeof x === "string" && x))] : []);
  const exceptions = profile?.permissionExceptions;
  return { allow: list(exceptions?.allow), deny: list(exceptions?.deny) };
}

export function getCapabilitiesForProfile(profile, customRoleCapabilities = {}, roleOverrides = {}) {
  const role = profile?.role || "ReadOnly";
  const override = OVERRIDABLE_ROLES.includes(role) && Array.isArray(roleOverrides?.[role]?.capabilities) ? roleOverrides[role] : null;
  const overridden = override ? withLegacyCapabilities(override.capabilities, override.capabilitiesVersion) : null;
  const roleCapabilities = overridden || ROLE_TEMPLATES[role] || customRoleCapabilities[role] || ROLE_TEMPLATES.User || [];
  const profileCapabilities = flattenProfilePermissions(profile);
  const merged = new Set([...roleCapabilities, ...profileCapabilities]);
  if (merged.has("*")) return Array.from(merged); // an administrator's access is never narrowed
  const { allow, deny } = permissionExceptionsOf(profile);
  allow.forEach((capability) => merged.add(capability));
  deny.forEach((capability) => merged.delete(capability));
  return Array.from(merged);
}

export function hasCapability(capabilities = [], required) {
  if (!required) return true;
  if (capabilities.includes("*")) return true;
  const requirements = Array.isArray(required) ? required : [required];
  return requirements.every((capability) => capabilities.includes(capability));
}

export function hasAnyCapability(capabilities = [], required = []) {
  if (!required?.length) return true;
  if (capabilities.includes("*")) return true;
  return required.some((capability) => capabilities.includes(capability));
}

export function groupCapabilities(capabilities = []) {
  if (capabilities.includes("*")) return { System: ["All capabilities (*)"] };
  return capabilities.reduce((groups, capability) => {
    const meta = CAPABILITY_CATALOG.find((item) => item.id === capability);
    const group = meta?.group || "Other";
    groups[group] = groups[group] || [];
    groups[group].push(meta?.label || capability);
    return groups;
  }, {});
}
