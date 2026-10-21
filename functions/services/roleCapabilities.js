// Mirrors src/core/identity/capabilities.js's ROLE_TEMPLATES and
// firestore.rules' builtInRoleCapabilities(). Kept as a plain object here
// since that file is a frontend ES module the functions codebase (CommonJS)
// can't import directly — same reason userAccountService.js's VALID_ROLES
// list is duplicated by hand. If a role or its capabilities change in
// capabilities.js, update this and firestore.rules too.
const BUILT_IN_ROLE_CAPABILITIES = {
  "System Admin": ["*"],
  "Practice Manager": [
    "governance.reportEvents",
    "clinflow.read", "clinflow.capture", "clinflow.workflow", "clinflow.manage",
    "dashboard.read", "operations.read", "operations.manage",
    "inventory.read", "inventory.kits", "inventory.write", "inventory.adjust", "inventory.verify", "inventory.delete",
    "purchasing.read", "purchasing.write", "purchasing.approve",
    "suppliers.read", "suppliers.write",
    "governance.read", "governance.write", "governance.manageSars", "governance.manageComplaints",
    "governance.manageConcerns", "governance.concernsTeam", "governance.seTeam", "training.manage", "waste.read", "waste.manage", "timesheets.manage",
    "connect.view", "connect.manageDevices", "connect.acknowledgeAlerts",
    "temperature.read", "temperature.write", "temperature.resolveIncident",
    "compliance.read", "compliance.write", "compliance.recordChecks", "compliance.manageAssets",
    "practiceAdmin.read", "practiceAdmin.write", "reports.read", "theme.lab",
    "mobile.access", "mobile.biometricUnlock",
    "admin.access", "admin.manageUsers", "admin.manageRoles", "admin.manageSettings",
    "audit.read", "audit.write", "orb.learning.review", "security.read", "security.manage",
  ],
  User: [
    "governance.reportEvents",
    "clinflow.read", "clinflow.workflow", "dashboard.read", "operations.read",
    "inventory.read", "inventory.kits", "inventory.write", "inventory.adjust", "inventory.verify",
    "purchasing.read", "suppliers.read", "connect.view",
    "temperature.read", "temperature.write",
    "compliance.read", "compliance.recordChecks",
    "mobile.access", "mobile.biometricUnlock",
  ],
  Nurse: [
    "governance.reportEvents",
    "clinflow.read", "clinflow.workflow", "dashboard.read", "operations.read",
    "inventory.read", "inventory.kits", "inventory.write", "inventory.verify", "connect.view",
    "temperature.read", "temperature.write", "temperature.resolveIncident",
    "compliance.read", "compliance.recordChecks",
    "mobile.access", "mobile.biometricUnlock",
  ],
  HCA: [
    "governance.reportEvents",
    "dashboard.read", "operations.read", "inventory.read", "inventory.kits", "inventory.write", "inventory.verify",
    "connect.view", "temperature.read", "temperature.write",
    "mobile.access", "mobile.biometricUnlock",
  ],
  Reception: [
    "governance.reportEvents",
    "clinflow.read", "clinflow.capture", "clinflow.workflow",
    "dashboard.read", "operations.read", "inventory.read", "inventory.kits", "purchasing.read",
    "governance.read", "governance.write", "governance.manageConcerns", "governance.concernsTeam",
    "connect.view", "mobile.access",
  ],
  Caretaker: [
    "governance.reportEvents",
    "dashboard.read", "operations.read", "connect.view",
    "temperature.read", "temperature.write",
    "compliance.read", "compliance.write", "compliance.recordChecks", "compliance.manageAssets",
    "mobile.access",
  ],
  Cleaner: [
    "dashboard.read", "operations.read",
    "mobile.access",
  ],
  Partner: [
    "governance.reportEvents",
    "dashboard.read", "governance.read", "governance.partnerAccess", "mobile.access",
  ],
  ReadOnly: [
    "governance.reportEvents",
    "clinflow.read", "dashboard.read", "operations.read", "inventory.read", "inventory.kits", "purchasing.read",
    "suppliers.read", "governance.read", "connect.view", "temperature.read", "compliance.read",
    "reports.read",
  ],
};

// Admin-created roles (AdminDashboard's Add/Edit Role) live at
// roles/{roleName} with a `capabilities` array — same document shape
// firestore.rules' customRoleCapabilities() reads.
const OVERRIDABLE_ROLES = ["Practice Manager", "Nurse", "HCA", "Reception", "Caretaker", "Cleaner", "Partner", "User", "ReadOnly"];
const CAPABILITIES_VERSION = 3;

// Roles saved before a permission existed keep what they could do (mirrors withLegacyCapabilities in
// src/core/identity/capabilities.js): the emergency kits for anyone who could see inventory, and reporting a significant event.
function withLegacyCapabilities(capabilities, version) {
  if (!Array.isArray(capabilities) || Number(version) >= CAPABILITIES_VERSION) return capabilities;
  const v = Number(version) || 1;
  const out = [...capabilities];
  if (v < 2 && out.includes("inventory.read") && !out.includes("inventory.kits")) out.push("inventory.kits");
  if (!out.includes("governance.reportEvents")) out.push("governance.reportEvents");
  return out;
}

async function getEffectiveCapabilities(db, role, profile = null) {
  const base = await roleCapabilitiesOf(db, role);
  return applyExceptions(base, profile);
}

// One person's exceptions to their role (mirrors permissionExceptionsOf): things switched on and things switched off.
function applyExceptions(capabilities, profile) {
  if (!Array.isArray(capabilities) || capabilities.includes("*")) return capabilities;
  const list = (value) => (Array.isArray(value) ? value.filter((x) => typeof x === "string" && x) : []);
  const allow = list(profile?.permissionExceptions?.allow);
  const deny = new Set(list(profile?.permissionExceptions?.deny));
  return [...new Set([...capabilities, ...allow])].filter((capability) => !deny.has(capability));
}

async function roleCapabilitiesOf(db, role) {
  const builtIn = BUILT_IN_ROLE_CAPABILITIES[role];
  if (builtIn && OVERRIDABLE_ROLES.includes(role)) {
    // an administrator's change to this original role's permissions (role_overrides), else the original
    const override = await db.collection("role_overrides").doc(role).get();
    const capabilities = override.exists ? override.data()?.capabilities : null;
    return Array.isArray(capabilities) ? withLegacyCapabilities(capabilities, override.data()?.capabilitiesVersion) : builtIn;
  }
  if (builtIn) return builtIn;
  if (!role) return [];
  const roleDoc = await db.collection("roles").doc(role).get();
  return roleDoc.exists ? withLegacyCapabilities(roleDoc.data()?.capabilities || [], roleDoc.data()?.capabilitiesVersion) : [];
}

function hasCapability(capabilities, required) {
  return Array.isArray(capabilities) && (capabilities.includes("*") || capabilities.includes(required));
}

module.exports = { OVERRIDABLE_ROLES, BUILT_IN_ROLE_CAPABILITIES, CAPABILITIES_VERSION, applyExceptions, withLegacyCapabilities, getEffectiveCapabilities, hasCapability };
