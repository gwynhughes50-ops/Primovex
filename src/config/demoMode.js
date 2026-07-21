import {
  getLastPlatformResetAt,
  getStoredScenarioId,
  getStoredPlatformMode,
  isSafeSyntheticMode,
  resetPlatformTrainingData,
  setPlatformMode,
  setStoredScenarioId,
} from "@/config/platformMode";

const DEMO_STORAGE_KEY = "medtrak.demo.profile";

export const DEMO_MODE = isSafeSyntheticMode();

export const DEMO_ORGANISATION = {
  name: "MedTrak Demo Practice",
  subtitle: "Safe anonymised demonstration and training environment",
};

export const DEMO_PROFILES = [
  {
    id: "gp-practice",
    label: "GP Practice",
    description: "Standard primary care demo with inventory, governance, cold-chain and MedAI.",
    organisationName: "MedTrak Demo Practice",
    badge: "Recommended",
  },
  {
    id: "research-practice",
    label: "Research Practice",
    description: "Adds -40°C freezer monitoring, research stock and connected device emphasis.",
    organisationName: "MedTrak Research Demo",
    badge: "Connect-ready",
  },
  {
    id: "large-health-centre",
    label: "Large Health Centre",
    description: "Multi-team operational demo with higher activity, governance and purchasing volume.",
    organisationName: "MedTrak Health Centre Demo",
    badge: "Enterprise preview",
  },
  {
    id: "training-mode",
    label: "Training Mode",
    description: "Simple walkthrough environment for staff onboarding and product demonstrations.",
    organisationName: "MedTrak Training Demo",
    badge: "Low risk",
  },
];

export function isDemoMode() {
  return isSafeSyntheticMode();
}

export function demoBannerText() {
  const mode = getStoredPlatformMode();
  if (mode === "live") {
    return "Live mode is active. The Demo Centre preview remains safe because it uses local synthetic data only.";
  }
  if (mode === "training") {
    return "Training mode is active. Staff can practise workflows using synthetic data without affecting the live system.";
  }
  if (mode === "staging") {
    return "Staging mode is active. Use this for safe testing of unfinished features and provider integrations.";
  }
  return "Demo mode is active. All records are synthetic and no live NHS patient data should be entered.";
}

export function getDefaultDemoProfile() {
  return DEMO_PROFILES[0];
}

export function getDemoProfile(profileId) {
  return DEMO_PROFILES.find((profile) => profile.id === profileId) || getDefaultDemoProfile();
}

export function getActiveDemoProfile() {
  if (typeof window === "undefined") return getDefaultDemoProfile();
  return getDemoProfile(getStoredScenarioId() || window.localStorage.getItem(DEMO_STORAGE_KEY));
}

export function setActiveDemoProfile(profileId, mode = "demo") {
  if (typeof window === "undefined") return getDemoProfile(profileId);
  const profile = getDemoProfile(profileId);
  window.localStorage.setItem(DEMO_STORAGE_KEY, profile.id);
  setStoredScenarioId(profile.id);
  setPlatformMode(mode, { scenarioId: profile.id });
  return profile;
}

export function resetDemoState() {
  if (typeof window === "undefined") return null;
  window.localStorage.setItem(DEMO_STORAGE_KEY, getDefaultDemoProfile().id);
  setStoredScenarioId(getDefaultDemoProfile().id);
  return resetPlatformTrainingData();
}

export function getLastDemoResetAt() {
  return getLastPlatformResetAt();
}
