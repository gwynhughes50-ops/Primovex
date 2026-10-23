// Features that are built but switched off everywhere, for everyone including the System Admin: no menu entry, no page, no Orb
// shortcut, nothing in the permission lists. The code and the data stay in the background, so switching one back on is one word here.
export const FEATURES = {
  clinflow: false,
};

export const featureOn = (name) => FEATURES[name] !== false;

// a permission group (as the role builder names it) that belongs to a switched-off feature
const GROUP_FEATURE = { ClinFlow: "clinflow" };
export const groupVisible = (group) => !GROUP_FEATURE[group] || featureOn(GROUP_FEATURE[group]);
