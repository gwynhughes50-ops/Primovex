export const SHELLY_LOCAL_PROVIDER_ID = "shelly-local";

export const ShellyLocalProvider = {
  id: SHELLY_LOCAL_PROVIDER_ID,
  label: "Local Thermometers (Shelly)",
  shortLabel: "Local Thermometers",
  status: "online",
  mode: "local",
  description: "Mains-powered WiFi thermometers read directly over the practice's own network — no cloud account, nothing to renew.",
  needsBackend: false,
  supports: ["temperature"],
  securityNote: "Readings never leave the practice network until Primovex writes them to Firestore itself.",
  async getDevices() {
    return [];
  },
  async getLatestReading() {
    return null;
  },
  async getProviderHealth() {
    return {
      providerId: SHELLY_LOCAL_PROVIDER_ID,
      status: "online",
      lastSyncLabel: "handled by the desktop app",
      message: "Polled directly from the desktop app on the practice's local network.",
    };
  },
};

export default ShellyLocalProvider;
