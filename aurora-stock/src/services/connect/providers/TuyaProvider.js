export const TUYA_PROVIDER_ID = "tuya";

export const TuyaProvider = {
  id: TUYA_PROVIDER_ID,
  label: "Tuya Cloud",
  shortLabel: "Tuya",
  status: "backend-required",
  mode: "cloud",
  description: "Backend-ready provider shell for Tuya-compatible Wi-Fi, Zigbee and smart-home sensors.",
  needsBackend: true,
  supports: ["temperature", "humidity", "battery", "signal", "door", "leak", "power"],
  requiredFrontendFields: ["region", "accessId", "projectId", "deviceId"],
  secretHandling: "Access Secret must be stored in Firebase Functions environment variables or Secret Manager, never in React.",
  securityNote: "React stores only non-secret provider metadata. Tuya Access Secret lives server-side.",
  async getDevices() {
    return [];
  },
  async getLatestReading() {
    return null;
  },
  async getProviderHealth() {
    return {
      providerId: TUYA_PROVIDER_ID,
      status: "needs-backend",
      lastSyncLabel: "not connected",
      message: "Tuya provider shell is configured. Add Firebase Function sync before enabling live data.",
    };
  },
};

export function buildTuyaBackendContract({ region = "eu", accessId = "", projectId = "", deviceId = "" } = {}) {
  return {
    provider: TUYA_PROVIDER_ID,
    region,
    accessId,
    projectId,
    deviceId,
    secretStorage: "functions:config or Secret Manager",
    cloudFunction: "syncTuyaConnectDevices",
    firestoreCollections: ["connected_devices", "connect_device_readings", "connect_device_alerts", "connect_provider_settings"],
  };
}

export default TuyaProvider;
