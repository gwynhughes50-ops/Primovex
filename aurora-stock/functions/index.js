const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getProvider, listProviders } = require("./providers/providerFactory");
const { syncProvider } = require("./services/deviceSyncService");
const { publishEvent } = require("./services/eventBus");

admin.initializeApp();

function assertSignedIn(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in is required to use MedTrak Connect Cloud.");
  }
}

exports.connectCloudHealth = onCall({ region: "europe-west2" }, async (request) => {
  assertSignedIn(request);
  const providerId = request.data?.providerId || "simulator";
  const provider = getProvider(providerId);
  const health = await provider.getHealth(request.data?.settings || {});
  return {
    status: "online",
    service: "MedTrak Connect Cloud",
    version: "0.9.27",
    provider: providerId,
    providerHealth: health,
    providers: listProviders(),
    checkedAt: new Date().toISOString(),
  };
});

exports.syncConnectProvider = onCall({ region: "europe-west2" }, async (request) => {
  assertSignedIn(request);
  const providerId = request.data?.providerId || "simulator";
  const result = await syncProvider(providerId, request.data?.settings || {});
  return {
    ok: true,
    ...result,
  };
});

exports.ingestConnectReading = onCall({ region: "europe-west2" }, async (request) => {
  assertSignedIn(request);
  const reading = request.data?.reading;
  if (!reading?.deviceId) {
    throw new HttpsError("invalid-argument", "reading.deviceId is required.");
  }
  await admin.firestore().collection("connect_device_readings").add({
    ...reading,
    source: reading.source || "manual-cloud-ingest",
    recordedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await publishEvent("connect.reading.ingested", {
    provider: reading.provider || "manual",
    deviceId: reading.deviceId,
    summary: `Reading received for ${reading.deviceId}.`,
    severity: "info",
  });
  return { ok: true };
});

exports.scheduledConnectSimulatorSync = onSchedule(
  {
    region: "europe-west2",
    schedule: "every 15 minutes",
    timeZone: "Europe/London",
  },
  async () => {
    await syncProvider("simulator", {});
  }
);
