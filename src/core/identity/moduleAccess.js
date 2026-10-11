// Which modules are switched off for the signed-in person (Practice Admin > Module Access, stored in
// practice_config/main.moduleToggles). A module that is switched off disappears from the menus and its screens for
// everyone except the people on its allow-list (the administrator who switched it off).
//
// ClinFlow is OFF BY DEFAULT: until someone has deliberately set it, it is treated as switched off for everyone, so a
// practice that has never touched the setting does not show it to staff. It is real-document software that uses an
// outside processor (Azure), so it only ever appears when the practice has chosen to turn it on. Demo and training
// mode use synthetic data only, so they are exempt.
//
// This is the same rule the Firestore rules and the Cloud Functions apply (functions/services/moduleAccess.js), so
// hiding it on screen is never the only thing keeping it away from staff.

export const OFF_BY_DEFAULT = ["clinflow"];

// A module is on only when explicitly set { disabled: false }; a module that is off by default and has never been
// set is off. Anything else is on unless { disabled: true }.
function isSwitchedOff(domain, toggle) {
  if (OFF_BY_DEFAULT.includes(domain)) return !toggle || toggle.disabled !== false;
  return Boolean(toggle?.disabled);
}

// The domains (the part of a capability before the dot) that this person must not see.
//   viewingAs: a System Admin looking at the app as another role: the allow-list is about the real person, so it
//   does not apply to the role being viewed, who would not be on it.
export function blockedModuleDomains({ toggles, uid, viewingAs = false, synthetic = false } = {}) {
  const domains = new Set([...Object.keys(toggles || {}), ...(synthetic ? [] : OFF_BY_DEFAULT)]);
  return [...domains].filter((domain) => {
    if (synthetic && OFF_BY_DEFAULT.includes(domain)) return false;
    const toggle = toggles?.[domain];
    if (!isSwitchedOff(domain, toggle)) return false;
    const allowed = !viewingAs && Boolean(uid) && Array.isArray(toggle?.allowUids) && toggle.allowUids.includes(uid);
    return !allowed;
  });
}
