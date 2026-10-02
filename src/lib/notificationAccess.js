// "Why isn't this person getting notifications?" - worked out from their role
// alone, for the Notification check on the Admin Users page. Pure, so it can be
// tested. It answers from the same rules the app and the live Firestore rules
// use (a role's permissions come from the built-in role list, or from a custom
// role with that exact name), so what it says is what will happen.
import { ROLE_TEMPLATES } from "@/core/identity/capabilities";

// The permissions a role gives, or null when the role name matches nothing.
// The live rules give an unknown role NO permissions at all.
export function roleCapabilities(role, customRoleCapabilities = {}) {
  if (ROLE_TEMPLATES[role]) return { source: "built-in", capabilities: ROLE_TEMPLATES[role] };
  if (customRoleCapabilities[role]) return { source: "custom", capabilities: customRoleCapabilities[role] };
  return null;
}

const has = (capabilities, id) => capabilities.includes("*") || capabilities.includes(id);

// Rows for the check: { id, label, ok, detail }. `profile` is the users/{uid}
// record (role, active); `customRoleCapabilities` maps custom role name -> list.
export function describeNotificationAccess(profile = {}, customRoleCapabilities = {}) {
  const role = String(profile.role || "").trim();
  const rows = [];

  if (profile.active === false) {
    rows.push({
      id: "account",
      label: "Account",
      ok: false,
      detail: "This account is deactivated, so they can't sign in and won't receive anything. Reactivate it on the Users page.",
    });
  }

  const resolved = role ? roleCapabilities(role, customRoleCapabilities) : null;
  if (!resolved) {
    rows.push({
      id: "role",
      label: "Role",
      ok: false,
      detail: role
        ? `There is no role called "${role}" (built-in or custom), so the live permission rules give this login no access at all. Change their role on the Users page, or create a custom role with exactly that name.`
        : "This login has no role set, so the live permission rules give it no access at all. Set their role on the Users page.",
    });
    return { role, source: null, rows, popups: [] };
  }

  const { capabilities, source } = resolved;
  rows.push({
    id: "role",
    label: "Role",
    ok: true,
    detail: source === "custom" ? `${role} (a custom role with ${capabilities.length} permission${capabilities.length === 1 ? "" : "s"})` : `${role} (built-in role)`,
  });

  const sar = has(capabilities, "governance.manageSars");
  const concerns = has(capabilities, "governance.concernsTeam");
  const stock = has(capabilities, "inventory.read");
  rows.push({
    id: "popup-sars",
    label: "Desktop pop-up: SARs overdue or due soon",
    ok: sar,
    detail: sar ? "Yes." : 'No - needs the "Manage SARs" permission (governance.manageSars).',
  });
  rows.push({
    id: "popup-concerns",
    label: "Desktop pop-up: concerns overdue or due soon",
    ok: concerns,
    detail: concerns ? "Yes." : 'No - needs the "Concerns team" permission (governance.concernsTeam).',
  });
  rows.push({
    id: "popup-stock",
    label: "Desktop pop-up: stock expired, expiring, out or low",
    ok: stock,
    detail: stock ? "Yes." : 'No - needs the "View inventory" permission (inventory.read).',
  });

  rows.push({
    id: "bell-sar",
    label: "Notification bell: a SAR is assigned to them",
    ok: true,
    detail: "Yes, whenever someone on the SAR team assigns them one.",
  });
  const caretaker = role === "Caretaker";
  const manager = role === "Practice Manager";
  rows.push({
    id: "bell-cleaning",
    label: "Notification bell: a cleaning issue is reported",
    ok: caretaker || manager,
    detail: caretaker
      ? "Yes - Caretakers are told."
      : manager
        ? "Only when no Caretaker account exists - otherwise the Caretaker is told instead."
        : "No - these go to the Caretaker (or the Practice Manager if there isn't one).",
  });

  return {
    role,
    source,
    rows,
    popups: [sar && "SARs", concerns && "concerns", stock && "stock"].filter(Boolean),
  };
}

// What can't be seen from here, because it is set on their own computer.
export const ON_THEIR_COMPUTER = [
  "Pop-ups appear only in the installed desktop app, not in a web browser or on the phone.",
  "They're on weekdays between 8am and 6pm, then repeat hourly until snoozed or dismissed.",
  "Pop-ups can be switched off per computer (Notifications page, Desktop alerts) - check it's on.",
  "A pop-up only appears when there is something overdue, due soon, expired, expiring, out of stock or low.",
];
