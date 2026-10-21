// Setting one person's permissions: start from what their role gives them, then switch single things on or off for that person
// only (an exception). Pure (no Firestore, no screens), so the admin screen and the tests use the same rules.
//
// An exception is { allow: [capability...], deny: [capability...] } kept on the person's own record. allow adds something their
// role does not give; deny takes away something it does. A capability is never in both.

import { CAPABILITY_CATALOG, permissionExceptionsOf } from "./capabilities.js";

const KNOWN = new Set(CAPABILITY_CATALOG.map((c) => c.id));

// the exceptions as they should be saved: only real permissions, no duplicates, nothing in both lists, and nothing that just
// repeats the role (an allow the role already gives, a deny of something the role does not give)
export function cleanExceptions(exceptions, roleCapabilities = []) {
  const { allow, deny } = permissionExceptionsOf({ permissionExceptions: exceptions });
  const role = new Set(roleCapabilities);
  const keepAllow = allow.filter((c) => KNOWN.has(c) && !role.has(c) && !deny.includes(c));
  const keepDeny = deny.filter((c) => KNOWN.has(c) && role.has(c));
  return { allow: keepAllow, deny: keepDeny };
}

export const hasExceptions = (exceptions) => {
  const { allow, deny } = permissionExceptionsOf({ permissionExceptions: exceptions });
  return allow.length + deny.length > 0;
};

// what the person can do: their role's permissions with the exceptions applied (never narrowing a System Admin)
export function effectiveCapabilities(roleCapabilities = [], exceptions = {}) {
  if (roleCapabilities.includes("*")) return [...roleCapabilities];
  const { allow, deny } = permissionExceptionsOf({ permissionExceptions: exceptions });
  return [...new Set([...roleCapabilities, ...allow])].filter((c) => !deny.includes(c));
}

// Tick or untick one permission for this person; returns the new exceptions.
export function setCapability(capability, wanted, roleCapabilities = [], exceptions = {}) {
  if (!KNOWN.has(capability) || roleCapabilities.includes("*")) return cleanExceptions(exceptions, roleCapabilities);
  const { allow, deny } = permissionExceptionsOf({ permissionExceptions: exceptions });
  const fromRole = roleCapabilities.includes(capability);
  const without = (list) => list.filter((c) => c !== capability);
  let nextAllow = without(allow);
  let nextDeny = without(deny);
  if (wanted && !fromRole) nextAllow = [...nextAllow, capability];
  if (!wanted && fromRole) nextDeny = [...nextDeny, capability];
  return cleanExceptions({ allow: nextAllow, deny: nextDeny }, roleCapabilities);
}

// where a permission comes from, for the label next to its tick box
export function sourceOf(capability, roleCapabilities = [], exceptions = {}) {
  if (roleCapabilities.includes("*")) return "role";
  const { allow, deny } = permissionExceptionsOf({ permissionExceptions: exceptions });
  if (allow.includes(capability)) return "allowed";
  if (deny.includes(capability)) return "removed";
  return roleCapabilities.includes(capability) ? "role" : "none";
}

// the permissions grouped as the role builder groups them, with each one's state for this person
export function permissionRows(roleCapabilities = [], exceptions = {}) {
  const groups = new Map();
  for (const item of CAPABILITY_CATALOG) {
    const source = sourceOf(item.id, roleCapabilities, exceptions);
    const row = { id: item.id, label: item.label, source, on: source === "role" || source === "allowed" };
    groups.set(item.group, [...(groups.get(item.group) || []), row]);
  }
  return [...groups.entries()].map(([group, rows]) => ({ group, rows }));
}

// one line for the person's row: how many exceptions they have
export function describeExceptions(exceptions) {
  const { allow, deny } = permissionExceptionsOf({ permissionExceptions: exceptions });
  const parts = [];
  if (allow.length) parts.push(`${allow.length} added`);
  if (deny.length) parts.push(`${deny.length} removed`);
  return parts.join(", ");
}
