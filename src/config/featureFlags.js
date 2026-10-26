// Features that can be switched off everywhere, for everyone including the System Admin: no menu entry, no page, no Orb
// shortcut, nothing in the permission lists. The code and the data stay in the background, so switching one back on is one word here.
// ClinFlow is on again (26 Oct 2026) so a partner can see it; it still shows only to whoever Practice Admin > Modules allows
// (see core/identity/moduleAccess.js), and uses synthetic documents only until the data protection paperwork is done.
export const FEATURES = {
  clinflow: true,
};

export const featureOn = (name) => FEATURES[name] !== false;

// a permission group (as the role builder names it) that belongs to a switched-off feature
const GROUP_FEATURE = { ClinFlow: "clinflow" };
export const groupVisible = (group) => !GROUP_FEATURE[group] || featureOn(GROUP_FEATURE[group]);
