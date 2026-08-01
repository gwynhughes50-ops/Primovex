const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { getProvider, listProviders } = require("./providers/providerFactory");
const { syncProvider } = require("./services/deviceSyncService");
const { publishEvent } = require("./services/eventBus");
const { getSyntheticPackDocument } = require("./config/clinflowSyntheticPack");
const { API_VERSION, MODEL_ID, analyzeDocument, summariseAnalyzeResult } = require("./services/azureDocumentIntelligenceService");

initializeApp();
const db = getFirestore();

const TUYA_SECRETS = [
  "TUYA_ACCESS_ID",
  "TUYA_ACCESS_SECRET",
  "TUYA_TEST_DEVICE_ID",
];

const AZURE_DOCUMENT_INTELLIGENCE_KEY = defineSecret("AZURE_DOCUMENT_INTELLIGENCE_KEY");
const AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = defineSecret("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");
const CLINFLOW_MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

function assertSignedIn(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in is required to use Primovex cloud services.");
  }
}

async function assertConnectManager(request) {
  assertSignedIn(request);
  const profile = await db.collection("users").doc(request.auth.uid).get();
  const data = profile.data() || {};
  const permitted = data.role === "System Admin" || data.permissions?.connect?.manageDevices === true;
  if (!permitted) throw new HttpsError("permission-denied", "Connect device management permission is required.");
}

function hasProfileCapability(profile, capability) {
  const permissions = profile?.permissions;
  if (Array.isArray(permissions)) return permissions.includes("*") || permissions.includes(capability);
  const [domain, action] = capability.split(".");
  return permissions?.[domain]?.[action] === true || permissions?.[capability] === true;
}

async function requireClinFlowCapture(request) {
  assertSignedIn(request);
  const snapshot = await db.collection("users").doc(request.auth.uid).get();
  const profile = snapshot.data() || {};
  const permitted = profile.role === "System Admin" || hasProfileCapability(profile, "clinflow.capture");
  if (!permitted) throw new HttpsError("permission-denied", "ClinFlow capture permission is required.");
  return profile;
}

function decodeApprovedSyntheticPdf(data) {
  if (data?.dataMode !== "synthetic" || data?.syntheticAttestation !== true) {
    throw new HttpsError("failed-precondition", "Confirm that this is synthetic test data before analysis.");
  }
  const base64 = String(data?.documentBase64 || "");
  if (!base64 || base64.length > Math.ceil(CLINFLOW_MAX_DOCUMENT_BYTES * 4 / 3) + 16) {
    throw new HttpsError("invalid-argument", "Choose a PDF no larger than 4 MB.");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new HttpsError("invalid-argument", "The document encoding is invalid.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > CLINFLOW_MAX_DOCUMENT_BYTES || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new HttpsError("invalid-argument", "Only a valid PDF up to 4 MB can be analysed.");
  }
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const packDocument = getSyntheticPackDocument(sha256);
  if (!packDocument) {
    throw new HttpsError(
      "failed-precondition",
      "This foundation release accepts only the approved Primovex synthetic hospital test pack."
    );
  }
  return { base64, bytes, sha256, packDocument };
}

function safeFileName(value) {
  return String(value || "synthetic-document.pdf").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 140);
}

exports.clinFlowDocumentIntelligenceHealth = onCall(
  {
    region: "europe-west2",
    secrets: [AZURE_DOCUMENT_INTELLIGENCE_KEY, AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT],
  },
  async (request) => {
    await requireClinFlowCapture(request);
    return {
      ok: true,
      mode: "synthetic-pack-only",
      provider: "Azure AI Document Intelligence",
      modelId: MODEL_ID,
      apiVersion: API_VERSION,
      configured: Boolean(AZURE_DOCUMENT_INTELLIGENCE_KEY.value() && AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT.value()),
      limits: { maxBytes: CLINFLOW_MAX_DOCUMENT_BYTES, maxPages: 2 },
      checkedAt: new Date().toISOString(),
    };
  }
);

exports.analyzeSyntheticClinFlowDocument = onCall(
  {
    region: "europe-west2",
    timeoutSeconds: 120,
    memory: "512MiB",
    maxInstances: 1,
    concurrency: 1,
    secrets: [AZURE_DOCUMENT_INTELLIGENCE_KEY, AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT],
  },
  async (request) => {
    const profile = await requireClinFlowCapture(request);
    const decoded = decodeApprovedSyntheticPdf(request.data || {});
    const fileName = safeFileName(request.data?.fileName);
    const practiceId = String(profile.practiceId || profile.organisationId || profile.organizationId || "primary");
    const siteId = String(profile.siteId || "SITE-MAIN");
    const eventRef = db.collection("clinflow_analysis_events").doc();

    await eventRef.set({
      schemaVersion: 1,
      dataMode: "synthetic",
      provider: "azure-document-intelligence",
      modelId: MODEL_ID,
      apiVersion: API_VERSION,
      status: "submitted",
      fileName,
      fileSha256: decoded.sha256,
      packDocumentId: decoded.packDocument.id,
      fileBytes: decoded.bytes.length,
      practiceId,
      siteId,
      actorUid: request.auth.uid,
      retentionClass: "synthetic_analysis_metadata_only",
      documentStored: false,
      extractedTextStored: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    try {
      const providerResult = await analyzeDocument({
        endpoint: AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT.value(),
        key: AZURE_DOCUMENT_INTELLIGENCE_KEY.value(),
        base64Source: decoded.base64,
      });
      const result = summariseAnalyzeResult(providerResult, decoded.packDocument);
      await eventRef.set({
        status: "succeeded",
        pageCount: result.pageCount,
        wordCount: result.wordCount,
        averageConfidence: result.averageConfidence,
        groundTruthScore: result.groundTruthScore,
        completedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { ok: true, analysisId: eventRef.id, fileName, fileSha256: decoded.sha256, result };
    } catch (error) {
      console.error("ClinFlow Azure analysis failed", { eventId: eventRef.id, message: error?.message });
      await eventRef.set({
        status: "failed",
        failureCategory: "provider_error",
        completedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw new HttpsError("unavailable", error?.message || "Azure Document Intelligence is unavailable.");
    }
  }
);

exports.connectCloudHealth = onCall({ region: "europe-west2", secrets: TUYA_SECRETS }, async (request) => {
  assertSignedIn(request);
  const providerId = request.data?.providerId || "simulator";
  const provider = getProvider(providerId);
  const health = await provider.getHealth(request.data?.settings || {});
  return {
    status: "online",
    service: "MedTrak Connect Cloud",
    version: "0.9.30",
    provider: providerId,
    providerHealth: health,
    providers: listProviders(),
    checkedAt: new Date().toISOString(),
  };
});

exports.syncConnectProvider = onCall({ region: "europe-west2", secrets: TUYA_SECRETS }, async (request) => {
  await assertConnectManager(request);
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
  await db.collection("connect_device_readings").add({
    ...reading,
    source: reading.source || "manual-cloud-ingest",
    recordedAt: FieldValue.serverTimestamp(),
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

exports.scheduledTuyaSync = onSchedule(
  {
    region: "europe-west2",
    schedule: "every 5 minutes",
    timeZone: "Europe/London",
    secrets: TUYA_SECRETS,
  },
  async () => {
    await syncProvider("tuya", {});
  }
);
