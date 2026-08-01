const crypto = require("crypto");

const TUYA_ENDPOINTS = {
  eu: "https://openapi.tuyaeu.com",
  central_eu: "https://openapi.tuyaeu.com",
  western_eu: "https://openapi-weaz.tuyaeu.com",
  us: "https://openapi.tuyaus.com",
  cn: "https://openapi.tuyacn.com",
  in: "https://openapi.tuyain.com",
};

const T13_CODES = Object.freeze({
  ambientTemperature: "temp_current",
  probeTemperature: "temp_current_external",
  humidity: "humidity_value",
  battery: "battery_state",
});

function parseDeviceConfig() {
  try {
    return JSON.parse(process.env.TUYA_DEVICE_CONFIG_JSON || "{}");
  } catch {
    return {};
  }
}

function resolveTuyaConfig(data = {}) {
  const region = process.env.TUYA_REGION || data.region || "central_eu";
  const rawDeviceIds = process.env.TUYA_TEST_DEVICE_ID || data.deviceId || "";
  return {
    region,
    accessId: process.env.TUYA_ACCESS_ID || data.accessId || "",
    accessSecret: process.env.TUYA_ACCESS_SECRET || "",
    deviceId: rawDeviceIds.split(",").map((value) => value.trim()).filter(Boolean)[0] || "",
    deviceIds: rawDeviceIds.split(",").map((value) => value.trim()).filter(Boolean),
    endpoint: TUYA_ENDPOINTS[region] || TUYA_ENDPOINTS.central_eu,
    deviceConfig: parseDeviceConfig(),
  };
}

function sha256(value = "") {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signature({ accessId, accessSecret, accessToken = "", method = "GET", path, body = "", timestamp, nonce = "" }) {
  const stringToSign = `${method}\n${sha256(body)}\n\n${path}`;
  const payload = `${accessId}${accessToken}${timestamp}${nonce}${stringToSign}`;
  return crypto.createHmac("sha256", accessSecret).update(payload).digest("hex").toUpperCase();
}

async function tuyaRequest(config, path, { accessToken = "", method = "GET", body = "" } = {}) {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const sign = signature({ ...config, accessToken, method, path, body, timestamp, nonce });
  const response = await fetch(`${config.endpoint}${path}`, {
    method,
    headers: {
      client_id: config.accessId,
      sign,
      t: timestamp,
      sign_method: "HMAC-SHA256",
      nonce,
      ...(accessToken ? { access_token: accessToken } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.msg || `Tuya request failed (${response.status}).`);
    error.code = payload.code || response.status;
    throw error;
  }
  return payload.result;
}

async function getAccessToken(config) {
  const result = await tuyaRequest(config, "/v1.0/token?grant_type=1");
  if (!result?.access_token) throw new Error("Tuya did not return an access token.");
  return result.access_token;
}

function scaledValue(status, code, scale = 0) {
  const raw = status.find((item) => item.code === code)?.value;
  const value = Number(raw);
  return Number.isFinite(value) ? value / (10 ** scale) : null;
}

function mapT13({ detail = {}, status = [], config }) {
  const id = detail.id || config.deviceId;
  const assignment = config.deviceConfig[id] || {};
  const probeTemperature = scaledValue(status, T13_CODES.probeTemperature, 1);
  const ambientTemperature = scaledValue(status, T13_CODES.ambientTemperature, 1);
  const humidity = scaledValue(status, T13_CODES.humidity);
  const batteryState = status.find((item) => item.code === T13_CODES.battery)?.value || null;

  return {
    id,
    provider: "tuya",
    providerDeviceId: id,
    productId: detail.product_id || null,
    name: assignment.name || detail.name || "Tuya T13 Temperature Sensor",
    model: "Daytech T13 / TH01WH-TY",
    type: assignment.type || (assignment.fridgeId ? "fridge" : "environment"),
    site: assignment.site || "Unassigned",
    room: assignment.room || "Unassigned",
    spaceId: assignment.spaceId || null,
    fridgeId: assignment.fridgeId || null,
    equipment: assignment.equipment || "External temperature probe",
    currentValue: probeTemperature,
    probeTemperature,
    ambientTemperature,
    humidity,
    unit: "°C",
    min: Number(assignment.min ?? 2),
    max: Number(assignment.max ?? 8),
    batteryState,
    battery: null,
    signal: null,
    online: detail.online !== false,
    status: detail.online === false ? "offline" : "online",
    lastSeen: new Date(),
    firmware: detail.version || null,
    rawStatusCodes: status.map(({ code }) => code),
    integrationStatus: assignment.spaceId && assignment.fridgeId ? "active" : "needs-assignment",
  };
}

module.exports = {
  id: "tuya",
  label: "Tuya Cloud",
  T13_CODES,
  mapT13,
  async getHealth(data = {}) {
    const config = resolveTuyaConfig(data);
    const ready = Boolean(config.accessId && config.accessSecret && config.deviceId);
    return {
      provider: "tuya",
      status: ready ? "configured" : "needs-configuration",
      healthScore: ready ? 90 : 35,
      message: ready
        ? "Tuya Central Europe credentials and device ID are configured on the backend."
        : "Configure TUYA_ACCESS_ID, TUYA_ACCESS_SECRET and TUYA_TEST_DEVICE_ID on the backend.",
      endpoint: config.endpoint,
      checkedAt: new Date(),
    };
  },
  async getDevices(data = {}) {
    const config = resolveTuyaConfig(data);
    if (!config.accessId || !config.accessSecret || !config.deviceIds.length) return [];
    const token = await getAccessToken(config);
    const results = await Promise.allSettled(config.deviceIds.map(async (deviceId) => {
      const encodedId = encodeURIComponent(deviceId);
      const deviceConfig = { ...config, deviceId };
      const [detail, status] = await Promise.all([
        tuyaRequest(config, `/v1.0/devices/${encodedId}`, { accessToken: token }),
        tuyaRequest(config, `/v1.0/devices/${encodedId}/status`, { accessToken: token }),
      ]);
      return mapT13({ detail, status: Array.isArray(status) ? status : [], config: deviceConfig });
    }));
    const devices = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (!devices.length && results[0]?.status === "rejected") throw results[0].reason;
    return devices;
  },
};
