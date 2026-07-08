import { getCapabilitiesForProfile, hasCapability } from "@/core/identity/capabilities";

export function getRole(user) {
  if (!user) return "System Admin";
  return user.role || "User";
}

function capsFromRole(role) {
  return getCapabilitiesForProfile({ role });
}

export const canArchive = (role) => hasCapability(capsFromRole(role), "inventory.delete");
export const canEdit = (role) => hasCapability(capsFromRole(role), "inventory.write");
export const canAdjust = (role) => hasCapability(capsFromRole(role), "inventory.adjust");
export const canMoveStock = (role) => hasCapability(capsFromRole(role), "inventory.write");
