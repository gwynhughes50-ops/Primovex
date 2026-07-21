const PLATFORM_MODE_KEY = "medtrak.platform.mode";
const PLATFORM_SCENARIO_KEY = "medtrak.platform.scenario";
const PLATFORM_RESET_KEY = "medtrak.platform.resetAt";

export const PLATFORM_MODES = {
  live: {
    id: "live",
    label: "Live",
    shortLabel: "LIVE SYSTEM",
    tone: "green",
    description: "Connected to live Firebase data and real operational workflows.",
    dataPolicy: "Live data may include operational governance information. Use only for real work.",
    badgeClass: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    bannerClass: "border-emerald-400/30 bg-emerald-500/10 text-emerald-50",
    dotClass: "bg-emerald-400",
  },
  demo: {
    id: "demo",
    label: "Demo",
    shortLabel: "DEMO MODE",
    tone: "blue",
    description: "Safe synthetic GP practice data for product demonstrations and walkthroughs.",
    dataPolicy: "Synthetic data only. Do not enter live patient identifiable information.",
    badgeClass: "border-sky-400/30 bg-sky-500/10 text-sky-100",
    bannerClass: "border-sky-400/30 bg-sky-500/10 text-sky-50",
    dotClass: "bg-sky-400",
  },
  training: {
    id: "training",
    label: "Training",
    shortLabel: "TRAINING MODE",
    tone: "amber",
    description: "Staff training environment where users can practise workflows without touching live data.",
    dataPolicy: "Training data only. Actions are for learning and can be reset.",
    badgeClass: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    bannerClass: "border-amber-400/30 bg-amber-500/10 text-amber-50",
    dotClass: "bg-amber-300",
  },
  staging: {
    id: "staging",
    label: "Staging",
    shortLabel: "STAGING",
    tone: "purple",
    description: "Developer testing mode for unfinished features and integration testing.",
    dataPolicy: "Testing mode. Not for live care, governance or production records.",
    badgeClass: "border-violet-400/30 bg-violet-500/10 text-violet-100",
    bannerClass: "border-violet-400/30 bg-violet-500/10 text-violet-50",
    dotClass: "bg-violet-400",
  },
};

export const PLATFORM_MODE_LIST = Object.values(PLATFORM_MODES);

function normaliseMode(mode) {
  return PLATFORM_MODES[mode] ? mode : "live";
}

export function getStoredPlatformMode() {
  if (typeof window === "undefined") return "live";
  const envDefault = String(import.meta.env.VITE_DEMO_MODE || "").toLowerCase() === "true" ? "demo" : "live";
  return normaliseMode(window.localStorage.getItem(PLATFORM_MODE_KEY) || envDefault);
}

export function getPlatformModeConfig(mode = getStoredPlatformMode()) {
  return PLATFORM_MODES[normaliseMode(mode)] || PLATFORM_MODES.live;
}

export function setPlatformMode(mode, options = {}) {
  if (typeof window === "undefined") return getPlatformModeConfig(mode);
  const nextMode = normaliseMode(mode);
  window.localStorage.setItem(PLATFORM_MODE_KEY, nextMode);
  if (options.scenarioId) window.localStorage.setItem(PLATFORM_SCENARIO_KEY, options.scenarioId);
  window.dispatchEvent(new CustomEvent("medtrak:platform-mode-changed", { detail: { mode: nextMode } }));
  return getPlatformModeConfig(nextMode);
}

export function isLiveMode(mode = getStoredPlatformMode()) {
  return normaliseMode(mode) === "live";
}

export function isSafeSyntheticMode(mode = getStoredPlatformMode()) {
  return ["demo", "training", "staging"].includes(normaliseMode(mode));
}

export function getStoredScenarioId() {
  if (typeof window === "undefined") return "gp-practice";
  return window.localStorage.getItem(PLATFORM_SCENARIO_KEY) || "gp-practice";
}

export function setStoredScenarioId(scenarioId) {
  if (typeof window === "undefined") return scenarioId;
  window.localStorage.setItem(PLATFORM_SCENARIO_KEY, scenarioId || "gp-practice");
  return scenarioId;
}

export function resetPlatformTrainingData() {
  if (typeof window === "undefined") return null;
  const resetAt = new Date().toISOString();
  window.localStorage.setItem(PLATFORM_RESET_KEY, resetAt);
  window.sessionStorage.removeItem("medtrak.demo.session");
  window.dispatchEvent(new CustomEvent("medtrak:platform-data-reset", { detail: { resetAt } }));
  return resetAt;
}

export function getLastPlatformResetAt() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PLATFORM_RESET_KEY);
}
