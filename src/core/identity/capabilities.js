/**
 * MedTrak+ Identity & Access Platform
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
  practiceAdmin: {
    read: "practiceAdmin.read",
    write: "practiceAdmin.write",
  },
  reports: {
    read: "reports.read",
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

export const ALL_CAPABILITIES = Object.values(CAPABILITIES).flatMap((group) => Object.values(group));

export const CAPABILITY_CATALOG = [
  { id: "dashboard.read", label: "View dashboard", group: "Core" },
  { id: "operations.read", label: "View Operations Centre", group: "Core" },
  { id: "operations.manage", label: "Manage operational work", group: "Core" },

  { id: "inventory.read", label: "View inventory", group: "Inventory" },
  { id: "inventory.write", label: "Create/edit stock", group: "Inventory" },
  { id: "inventory.adjust", label: "Adjust stock levels", group: "Inventory" },
  { id: "inventory.verify", label: "Complete stock verification", group: "Inventory" },
  { id: "inventory.delete", label: "Delete/archive stock", group: "Inventory" },

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

  { id: "connect.view", label: "View MedTrak Connect", group: "Connect" },
  { id: "connect.manageDevices", label: "Add/edit connected devices", group: "Connect" },
  { id: "connect.acknowledgeAlerts", label: "Acknowledge device alerts", group: "Connect" },

  { id: "temperature.read", label: "View temperature logs", group: "Compliance" },
  { id: "temperature.write", label: "Record temperature logs", group: "Compliance" },
  { id: "temperature.resolveIncident", label: "Resolve temperature incidents", group: "Compliance" },
  { id: "compliance.read", label: "View compliance", group: "Compliance" },
  { id: "compliance.write", label: "Update compliance", group: "Compliance" },
  { id: "compliance.recordChecks", label: "Record QR/NFC compliance checks", group: "Compliance" },
  { id: "compliance.manageAssets", label: "Manage QR/NFC compliance assets", group: "Compliance" },

  { id: "practiceAdmin.read", label: "View practice admin", group: "Administration" },
  { id: "practiceAdmin.write", label: "Update practice admin", group: "Administration" },
  { id: "reports.read", label: "View reports", group: "Insight" },
  { id: "theme.lab", label: "Use Theme Lab", group: "Design System" },

  { id: "mobile.access", label: "Use MedTrak Mobile", group: "Mobile" },
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
    "dashboard.read",
    "operations.read",
    "operations.manage",
    "inventory.read",
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
    "dashboard.read",
    "operations.read",
    "inventory.read",
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
    "dashboard.read",
    "operations.read",
    "inventory.read",
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
    "dashboard.read",
    "operations.read",
    "inventory.read",
    "inventory.write",
    "inventory.verify",
    "connect.view",
    "temperature.read",
    "temperature.write",
    "mobile.access",
    "mobile.biometricUnlock",
  ],
  "Reception": [
    "dashboard.read",
    "operations.read",
    "inventory.read",
    "purchasing.read",
    "governance.read",
    "governance.write",
    "governance.manageConcerns",
    "connect.view",
    "mobile.access",
  ],
  "Caretaker": [
    "dashboard.read",
    "operations.read",
    "connect.view",
    "temperature.read",
    "temperature.write",
    "compliance.read",
    "compliance.write",
    "compliance.recordChecks",
    "compliance.manageAssets",
    "mobile.access",
  ],
  "Cleaner": [
    "dashboard.read",
    "operations.read",
    "compliance.read",
    "compliance.write",
    "compliance.recordChecks",
    "mobile.access",
  ],
  "ReadOnly": [
    "dashboard.read",
    "operations.read",
    "inventory.read",
    "purchasing.read",
    "suppliers.read",
    "governance.read",
    "connect.view",
    "temperature.read",
    "compliance.read",
    "reports.read",
  ],
};

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

export function getCapabilitiesForProfile(profile) {
  const role = profile?.role || "ReadOnly";
  const roleCapabilities = ROLE_TEMPLATES[role] || ROLE_TEMPLATES.User || [];
  const profileCapabilities = flattenProfilePermissions(profile);
  const merged = new Set([...roleCapabilities, ...profileCapabilities]);
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
