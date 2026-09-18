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
const { extractClinicalFacts } = require("./services/azureOpenAiExtractionService");
const { appendGovernedAuditEvent } = require("./services/governedAuditService");
const { reportRoomIssue } = require("./services/roomIssueService");
const { recordSensePresenceTap } = require("./services/sensePresenceService");
const { createUserAccount, setUserActive, deleteUserAccount } = require("./services/userAccountService");
const { getEffectiveCapabilities, hasCapability } = require("./services/roleCapabilities");

initializeApp();
const db = getFirestore();

const TUYA_SECRETS = [
  "TUYA_ACCESS_ID",
  "TUYA_ACCESS_SECRET",
  "TUYA_TEST_DEVICE_ID",
];

const AZURE_DOCUMENT_INTELLIGENCE_KEY = defineSecret("AZURE_DOCUMENT_INTELLIGENCE_KEY");
const AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = defineSecret("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");
const AZURE_OPENAI_KEY = defineSecret("AZURE_OPENAI_KEY");
const AZURE_OPENAI_ENDPOINT = defineSecret("AZURE_OPENAI_ENDPOINT");
const AZURE_OPENAI_DEPLOYMENT = defineSecret("AZURE_OPENAI_DEPLOYMENT");
const CLINFLOW_MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

function assertSignedIn(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in is required to use Primovex cloud services.");
  }
}

// These used to check profile.permissions (a nested-map shape the app never
// actually writes onto users/{uid} — capabilities are computed client-side
// from the user's role, see capabilities.js's getCapabilitiesForProfile), so
// every role except the literal "System Admin" was silently denied here
// regardless of what their role actually grants — same bug class fixed in
// firestore.rules' hasPermission() after Craig hit it on SARs. Fixed to
// derive capabilities from role the same way, via roleCapabilities.js.
async function assertConnectManager(request) {
  assertSignedIn(request);
  const profile = await db.collection("users").doc(request.auth.uid).get();
  const data = profile.data() || {};
  if (data.role === "System Admin") return;
  const capabilities = await getEffectiveCapabilities(db, data.role);
  if (!hasCapability(capabilities, "connect.manageDevices")) {
    throw new HttpsError("permission-denied", "Connect device management permission is required.");
  }
}

// Returns the caller's role once admin.access is confirmed, so callers that
// need to know whether the caller is a *real* System Admin (not just
// admin.access-capable — e.g. createUserAccount granting the System Admin
// role itself) don't need a second profile read.
async function assertAdmin(request) {
  assertSignedIn(request);
  const profile = await db.collection("users").doc(request.auth.uid).get();
  const data = profile.data() || {};
  if (data.role === "System Admin") return data.role;
  const capabilities = await getEffectiveCapabilities(db, data.role);
  if (!hasCapability(capabilities, "admin.access")) {
    throw new HttpsError("permission-denied", "Admin access is required.");
  }
  return data.role;
}

async function requireClinFlowCapture(request) {
  assertSignedIn(request);
  const snapshot = await db.collection("users").doc(request.auth.uid).get();
  const profile = snapshot.data() || {};
  if (profile.role !== "System Admin") {
    const capabilities = await getEffectiveCapabilities(db, profile.role);
    if (!hasCapability(capabilities, "clinflow.capture")) {
      throw new HttpsError("permission-denied", "ClinFlow capture permission is required.");
    }
  }
  return profile;
}

exports.recordGovernedAuditEvent = onCall(
  { region: "europe-west2", timeoutSeconds: 15, memory: "256MiB" },
  async (request) => {
    assertSignedIn(request);
    const profileSnapshot = await db.collection("users").doc(request.auth.uid).get();
    if (!profileSnapshot.exists) {
      throw new HttpsError("failed-precondition", "A Primovex user profile is required for governed audit logging.");
    }
    return appendGovernedAuditEvent({
      db,
      auth: request.auth,
      data: request.data,
      profile: profileSnapshot.data() || {},
    });
  }
);

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
  const packDocument = getSyntheticPackDocument(sha256) || { id: "attested-upload", title: "Attested anonymised document", expected: [] };
  return { base64, bytes, sha256, packDocument, isKnownPackDocument: Boolean(getSyntheticPackDocument(sha256)) };
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
    secrets: [AZURE_DOCUMENT_INTELLIGENCE_KEY, AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT],
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
      // The 5 bundled sample letters already have a hand-verified extraction
      // path client-side (ClinFlow's known-answer demo). Anything else is a
      // real attested document with no pre-written answers, so this is where
      // actual document understanding happens — everything it returns is
      // still routed through ClinFlow's existing "suggestion only, human
      // review required" workflow, unchanged.
      if (!decoded.isKnownPackDocument) {
        try {
          result.llmExtraction = await extractClinicalFacts({
            endpoint: AZURE_OPENAI_ENDPOINT.value(),
            key: AZURE_OPENAI_KEY.value(),
            deployment: AZURE_OPENAI_DEPLOYMENT.value(),
            ocrText: result.content,
          });
        } catch (extractionError) {
          console.error("ClinFlow LLM extraction failed", { eventId: eventRef.id, message: extractionError?.message });
          result.llmExtractionError = extractionError?.message || "Extraction was unavailable.";
        }
      }
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
  // The equivalent client-side write (connect_device_readings' Firestore
  // rule) requires connect.manageDevices — this Cloud Function bypasses
  // Firestore rules via the Admin SDK, so it must enforce the same capability
  // itself, or any signed-in user (any role) could inject fabricated
  // cold-chain readings (e.g. a fake "in range" vaccine fridge temperature).
  await assertConnectManager(request);
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

exports.reportRoomIssue = onCall({ region: "europe-west2" }, async (request) => {
  assertSignedIn(request);
  const { roomId, roomName, note } = request.data || {};
  if (!String(note || "").trim()) {
    throw new HttpsError("invalid-argument", "Add a short note describing the issue.");
  }
  const profileSnap = await db.collection("users").doc(request.auth.uid).get();
  const profile = profileSnap.data() || {};
  const practiceId = profile.practiceId || profile.organisationId || profile.organizationId || null;
  const reporterName = profile.displayName || request.auth.token?.name || request.auth.token?.email || "Cleaning team";

  const result = await reportRoomIssue(db, {
    roomId,
    roomName,
    note: String(note).trim(),
    reporterUid: request.auth.uid,
    reporterName,
    practiceId,
  });

  if (!result.notifiedCount) {
    throw new HttpsError("failed-precondition", "No Caretaker or Practice Manager is set up to receive this yet — ask an admin to add one in Practice Admin.");
  }
  return result;
});

// Called by the invisible native NfcSightingActivity (Android) when a Sense
// room tag is tapped with Primovex closed, using a cached ID token rather
// than a live client SDK session — see AuthContext.jsx's onIdTokenChanged
// bridge and NfcSightingActivity.kt.
exports.recordSensePresenceTap = onCall({ region: "europe-west2", timeoutSeconds: 15, memory: "256MiB" }, async (request) => {
  assertSignedIn(request);
  const profileSnapshot = await db.collection("users").doc(request.auth.uid).get();
  if (!profileSnapshot.exists) {
    throw new HttpsError("failed-precondition", "A Primovex user profile is required to record a location.");
  }
  return recordSensePresenceTap({
    db,
    auth: request.auth,
    data: request.data,
    profile: profileSnapshot.data() || {},
  });
});

exports.createUserAccount = onCall({ region: "europe-west2" }, async (request) => {
  const callerRole = await assertAdmin(request);
  const { displayName, email, role } = request.data || {};
  // admin.access (granted to Practice Manager, not just System Admin) is
  // enough to add ordinary staff accounts, but minting another System Admin
  // is a strictly higher-trust action reserved for an actual System Admin —
  // otherwise admin.access alone becomes a path to self-escalate.
  if (role === "System Admin" && callerRole !== "System Admin") {
    throw new HttpsError("permission-denied", "Only a System Admin can create another System Admin account.");
  }
  return createUserAccount({ displayName, email, role, creatorUid: request.auth.uid });
});

exports.setUserActive = onCall({ region: "europe-west2" }, async (request) => {
  await assertAdmin(request);
  const { uid, active } = request.data || {};
  return setUserActive({ uid, active, actorUid: request.auth.uid });
});

exports.deleteUserAccount = onCall({ region: "europe-west2" }, async (request) => {
  await assertAdmin(request);
  const { uid } = request.data || {};
  return deleteUserAccount({ uid, actorUid: request.auth.uid });
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
