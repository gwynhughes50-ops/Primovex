// Whether ClinFlow is switched on for this person (practice_config/main.moduleToggles.clinflow). Same rule as the app
// (src/core/identity/moduleAccess.js) and the Firestore rules: ClinFlow is OFF unless the practice has deliberately
// set it, and when it is switched off only the people on its allow-list (the administrator who switched it off) can
// use it. It sends documents to an outside processor, so it must not depend on the screens hiding it.
function clinFlowEnabledFor(practiceConfig, uid) {
  const toggle = practiceConfig?.moduleToggles?.clinflow;
  if (toggle && toggle.disabled === false) return true;
  return Boolean(uid) && Array.isArray(toggle?.allowUids) && toggle.allowUids.includes(uid);
}

module.exports = { clinFlowEnabledFor };
