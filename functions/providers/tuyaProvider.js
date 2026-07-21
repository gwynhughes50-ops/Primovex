const TUYA_ENDPOINTS = {
  eu: "https://openapi.tuyaeu.com",
  us: "https://openapi.tuyaus.com",
  cn: "https://openapi.tuyacn.com",
  in: "https://openapi.tuyain.com",
};

function resolveTuyaConfig(data = {}) {
  return {
    provider: "tuya",
    region: data.region || process.env.TUYA_REGION || "eu",
    accessId: data.accessId || process.env.TUYA_ACCESS_ID || "",
    projectId: data.projectId || process.env.TUYA_PROJECT_ID || "",
    deviceId: data.deviceId || process.env.TUYA_TEST_DEVICE_ID || "",
    endpoint: TUYA_ENDPOINTS[data.region || process.env.TUYA_REGION || "eu"] || TUYA_ENDPOINTS.eu,
    hasSecret: Boolean(process.env.TUYA_ACCESS_SECRET),
  };
}

module.exports = {
  id: "tuya",
  label: "Tuya Cloud",
  async getHealth(data = {}) {
    const config = resolveTuyaConfig(data);
    const ready = Boolean(config.accessId && config.hasSecret);
    return {
      provider: "tuya",
      status: ready ? "configured" : "needs-secret",
      healthScore: ready ? 80 : 35,
      message: ready
        ? "Tuya credentials are present. Live API polling can be enabled next."
        : "Tuya Access Secret is not configured on the backend. Do not store it in React.",
      endpoint: config.endpoint,
      checkedAt: new Date(),
    };
  },
  async getDevices(data = {}) {
    const config = resolveTuyaConfig(data);
    if (!config.accessId || !config.hasSecret) {
      return [];
    }

    // Sprint 27 intentionally does not implement Tuya signing yet. The backend
    // contract is now in place so Sprint 28 can add real API polling safely.
    return [];
  },
};
