export function getRole(user) {
    // dev default: admin when no auth wired
    if (!user) return "admin";
    return user.role || "staff";
  }
  
  export const canArchive = (role) => role === "admin" || role === "manager";
  export const canEdit = (role) => role === "admin" || role === "manager";
  export const canAdjust = (role) => role === "admin" || role === "manager";
  export const canMoveStock = (role) => role === "admin" || role === "manager" || role === "staff";
  