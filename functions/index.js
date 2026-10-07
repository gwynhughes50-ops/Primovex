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
const { createUserAccount, setUserActive, deleteUserAccount, createPasswordLink, resetUserMfa } = require("./services/userAccountService");
const { getEffectiveCapabilities, hasCapability } = require("./services/roleCapabilities");
const { notifySarAssignment } = require("./services/notificationService");
const { listStaffDirectory } = require("./services/staffDirectoryService");
const { sendDueNotifications } = require("./services/dueNotificationService");
const { sendKitNotification, replaceKitItemBatch } = require("./services/kitCheckService");
const { recordUsage } = require("./services/usageService");
const { routeQuestion } = require("./services/orbRouterService");
const { phraseAnswer } = require("./services/orbPhraseService");
const { runRetention } = require("./services/retentionService");
const { sendTeamMessage } = require("./services/teamMessageService");

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

exports.createPasswordLink = onCall({ region: "europe-west2" }, async (request) => {
  const callerRole = await assertAdmin(request);
  const { uid } = request.data || {};
  const result = await createPasswordLink({ uid, callerRole });

  // Issuing a credential-setting link is exactly the kind of action an audit
  // trail exists for. Best-effort: a failed audit write must not leave an
  // administrator unable to get someone back into the system.
  try {
    const callerProfile = await db.collection("users").doc(request.auth.uid).get();
    await appendGovernedAuditEvent({
      db,
      auth: request.auth,
      profile: callerProfile.data() || {},
      data: {
        action: "admin.user.password-link-created",
        module: "administration",
        targetType: "user",
        targetId: result.uid,
        summary: "Password reset link generated for a user account",
        classification: "security",
      },
    });
  } catch (error) {
    console.error("Password-link audit event failed", { message: error?.message });
  }

  return result;
});

exports.resetUserMfa = onCall({ region: "europe-west2" }, async (request) => {
  const callerRole = await assertAdmin(request);
  const { uid } = request.data || {};
  const result = await resetUserMfa({ uid, callerUid: request.auth.uid, callerRole });

  // Removing someone's second factor is exactly what the audit ledger is for.
  // Best-effort: a failed audit write must not leave a locked-out person stuck.
  try {
    const callerProfile = await db.collection("users").doc(request.auth.uid).get();
    await appendGovernedAuditEvent({
      db,
      auth: request.auth,
      profile: callerProfile.data() || {},
      data: {
        action: "admin.user.mfa-reset",
        module: "administration",
        targetType: "user",
        targetId: result.uid,
        summary: "Two-step sign-in reset for a user account",
        classification: "security",
        metadata: { removed: result.removed },
      },
    });
  } catch (error) {
    console.error("MFA-reset audit event failed", { message: error?.message });
  }

  return result;
});

// Tells the person a SAR has been assigned to that it has. The app used to try
// to write this notification straight from the browser, which the Firestore
// rules refuse (clients can't create notifications), so no one ever received
// one. The content is built here from the SAR itself; the caller only names
// the SAR, and must be on the SAR team (the same people the rules let assign one).
exports.notifySarAssignment = onCall({ region: "europe-west2" }, async (request) => {
  assertSignedIn(request);
  const callerProfile = (await db.collection("users").doc(request.auth.uid).get()).data() || {};
  if (callerProfile.role !== "System Admin") {
    const capabilities = await getEffectiveCapabilities(db, callerProfile.role);
    if (!hasCapability(capabilities, "governance.manageSars")) {
      throw new HttpsError("permission-denied", "SAR management permission is required.");
    }
  }
  const { sarId } = request.data || {};
  return notifySarAssignment({
    db,
    callerUid: request.auth.uid,
    callerName: callerProfile.displayName || callerProfile.email || "Primovex",
    sarId,
  });
});

// The staff list behind the SAR "Assigned To" / "Manager for Escalation"
// pickers. A SAR team member who isn't an administrator can't read the users
// collection directly (the rules keep email addresses and roles private), so
// they got an empty list; this returns just an id, a name and the role, to the
// people who need to pick someone.
exports.listStaffDirectory = onCall({ region: "europe-west2" }, async (request) => {
  assertSignedIn(request);
  const profile = (await db.collection("users").doc(request.auth.uid).get()).data() || {};
  if (profile.role !== "System Admin") {
    const capabilities = await getEffectiveCapabilities(db, profile.role);
    const allowed = hasCapability(capabilities, "governance.manageSars")
      || hasCapability(capabilities, "governance.concernsTeam")
      || hasCapability(capabilities, "admin.access")
      || hasCapability(capabilities, "inventory.verify"); // choosing a colleague to message from a kit check
    if (!allowed) throw new HttpsError("permission-denied", "You need SAR, concerns, admin or stock-verification access to list staff.");
  }
  return { staff: await listStaffDirectory({ db }) };
});

// Whoever does the kit checks (the people who can verify stock) - and System Admin.
async function assertCanVerifyStock(request) {
  assertSignedIn(request);
  const profile = (await db.collection("users").doc(request.auth.uid).get()).data() || {};
  if (profile.role !== "System Admin") {
    const capabilities = await getEffectiveCapabilities(db, profile.role);
    if (!hasCapability(capabilities, "inventory.verify")) {
      throw new HttpsError("permission-denied", "Stock verification permission is required.");
    }
  }
  return profile;
}

// A message to a colleague, or a reminder to yourself, from the phone's kit check.
// Delivered into the in-app inbox; clients can't create notifications themselves,
// and the content is built here from the real kit and the sender's own name.
exports.sendKitNotification = onCall({ region: "europe-west2" }, async (request) => {
  const profile = await assertCanVerifyStock(request);
  return sendKitNotification({
    db,
    callerUid: request.auth.uid,
    callerName: profile.displayName || profile.email || "A colleague",
    data: request.data || {},
  });
});

// The Orb's language layer: works out which approved read-only lookup a question in
// ordinary words is asking for. The model sees only the (scrubbed) question and the
// lookups this person may use, never any practice data; the lookup then runs in the
// app under their own permissions. Off unless an administrator turns it on
// (settings/orb.aiRouting), limited per person and per day.
exports.orbRoute = onCall(
  {
    region: "europe-west2",
    timeoutSeconds: 20,
    memory: "256MiB",
    secrets: [AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT],
  },
  async (request) => {
    assertSignedIn(request);
    const snapshot = await db.collection("users").doc(request.auth.uid).get();
    if (!snapshot.exists) throw new HttpsError("failed-precondition", "A Primovex user profile is required.");
    const profile = snapshot.data() || {};
    const capabilities = await getEffectiveCapabilities(db, profile.role);
    const startedAt = Date.now();
    const result = await routeQuestion({
      db,
      uid: request.auth.uid,
      capabilities,
      question: request.data?.question,
      azure: { endpoint: AZURE_OPENAI_ENDPOINT.value(), key: AZURE_OPENAI_KEY.value(), deployment: AZURE_OPENAI_DEPLOYMENT.value() },
    });
    if (result.enabled && result.reason !== "empty" && result.reason !== "no-tools") {
      // Which lookup was chosen, never the question's words.
      appendGovernedAuditEvent({
        db,
        auth: request.auth,
        profile,
        data: {
          action: "orb.ai.route",
          module: "orb",
          targetType: "orb_request",
          summary: result.toolId ? "Orb language assistant chose a lookup" : "Orb language assistant found no matching lookup",
          classification: "operational",
          metadata: { tool: result.toolId || "none", reason: result.reason || "matched", redactions: result.redactions || 0, ms: Date.now() - startedAt },
        },
      }).catch((error) => console.error("Orb AI audit failed", { message: error?.message }));
    }
    // The client needs only the decision.
    const { detail, ...decision } = result;
    if (detail) console.warn("Orb language assistant unavailable", { detail });
    return decision;
  }
);

// The Orb's wording layer: puts an answer into friendlier words. Separate switch
// (settings/orb.aiPhrasing), off unless a System Admin turns it on. Sends the answer's
// facts (item, room and fridge names and counts) to the model, only for lookups cleared
// for it; any reply that changes a figure or drops a warning is discarded.
exports.orbPhrase = onCall(
  {
    region: "europe-west2",
    timeoutSeconds: 20,
    memory: "256MiB",
    secrets: [AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT],
  },
  async (request) => {
    assertSignedIn(request);
    const snapshot = await db.collection("users").doc(request.auth.uid).get();
    if (!snapshot.exists) throw new HttpsError("failed-precondition", "A Primovex user profile is required.");
    const profile = snapshot.data() || {};
    const capabilities = await getEffectiveCapabilities(db, profile.role);
    const startedAt = Date.now();
    const result = await phraseAnswer({
      db,
      uid: request.auth.uid,
      capabilities,
      toolId: String(request.data?.toolId || ""),
      question: request.data?.question,
      facts: request.data?.facts,
      azure: { endpoint: AZURE_OPENAI_ENDPOINT.value(), key: AZURE_OPENAI_KEY.value(), deployment: AZURE_OPENAI_DEPLOYMENT.value() },
    });
    if (result.enabled && result.reason !== "not-allowed" && result.reason !== "empty") {
      // Which lookup and whether the wording was used; never the text.
      appendGovernedAuditEvent({
        db,
        auth: request.auth,
        profile,
        data: {
          action: "orb.ai.phrase",
          module: "orb",
          targetType: "orb_request",
          summary: result.text ? "Orb language assistant reworded an answer" : "Orb language assistant's wording was not used",
          classification: "operational",
          metadata: { tool: String(request.data?.toolId || "").slice(0, 60), reason: result.reason || "reworded", redactions: result.redactions || 0, ms: Date.now() - startedAt },
        },
      }).catch((error) => console.error("Orb AI phrase audit failed", { message: error?.message }));
    }
    const { detail, ...decision } = result;
    if (detail) console.warn("Orb language assistant wording unavailable", { detail });
    return decision;
  }
);

// A short message to everyone with a role ("tell the HCA team BD blue needles need ordering"),
// started from the Orb after the person confirms it. Only someone who can write stock; refuses
// anything that looks like a patient identifier; limited per person; audited by team and count.
exports.orbTeamMessage = onCall({ region: "europe-west2", timeoutSeconds: 30 }, async (request) => {
  assertSignedIn(request);
  const snapshot = await db.collection("users").doc(request.auth.uid).get();
  if (!snapshot.exists) throw new HttpsError("failed-precondition", "A Primovex user profile is required.");
  const profile = snapshot.data() || {};
  const capabilities = await getEffectiveCapabilities(db, profile.role);
  const result = await sendTeamMessage({
    db,
    callerUid: request.auth.uid,
    callerName: profile.displayName || profile.email || "A colleague",
    capabilities,
    data: { role: request.data?.role, text: request.data?.text, actionUrl: request.data?.actionUrl },
  });
  appendGovernedAuditEvent({
    db,
    auth: request.auth,
    profile,
    data: {
      action: "orb.team.message",
      module: "inventory",
      targetType: "team",
      targetId: String(result.role).slice(0, 60),
      summary: "A message was sent to a team through the Orb",
      classification: "operational",
      metadata: { role: result.role, recipients: result.sent },
    },
  }).catch((error) => console.error("Team message audit failed", { message: error?.message }));
  return result;
});

// Weekly tidy-up so records about how people use the system are not kept indefinitely:
// sign-in sessions for 12 months, the Orb's request counters for 60 days. The audit ledger
// is not touched.
exports.scheduledRetention = onSchedule(
  { region: "europe-west2", schedule: "every sunday 03:30", timeZone: "Europe/London" },
  async () => {
    const result = await runRetention({ db });
    console.log("Retention clean-up", result);
  }
);

// Sign-in and activity reporting: the app tells us which area of it a person is in
// and for how long. Identity and every time come from the server, and what is
// stored is areas of the app only. Read back by administrators and audit readers.
exports.recordUsage = onCall({ region: "europe-west2", timeoutSeconds: 15, memory: "256MiB" }, async (request) => {
  assertSignedIn(request);
  const snapshot = await db.collection("users").doc(request.auth.uid).get();
  if (!snapshot.exists) throw new HttpsError("failed-precondition", "A Primovex user profile is required.");
  return recordUsage({ db, callerUid: request.auth.uid, profile: snapshot.data() || {}, data: request.data || {} });
});

// Swapping an item in a kit for a new batch during a check. Kits can only be edited
// directly by administrators, so this is the narrow route for the people doing the
// check: it changes one item's expected batch and expiry, nothing else, and is audited.
exports.replaceKitItemBatch = onCall({ region: "europe-west2" }, async (request) => {
  const profile = await assertCanVerifyStock(request);
  const callerName = profile.displayName || profile.email || "A colleague";
  const result = await replaceKitItemBatch({ db, callerUid: request.auth.uid, callerName, data: request.data || {} });

  try {
    await appendGovernedAuditEvent({
      db,
      auth: request.auth,
      profile,
      data: {
        action: "inventory.kit.item-replaced",
        module: "inventory",
        targetType: String(request.data?.collection || "kit"),
        targetId: String(request.data?.kitId || ""),
        summary: `Kit item replaced: ${result.itemName}`,
        classification: "operational",
        metadata: { itemId: String(request.data?.itemId || ""), previousBatch: result.previous.batch_number, newBatch: result.now.batch_number, newExpiry: result.now.expiry_date },
      },
    });
  } catch (error) {
    console.error("Kit replacement audit event failed", { message: error?.message });
  }
  return result;
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

// Due-soon and overdue notifications for SARs and concerns, into each person's
// in-app inbox, every morning at 07:30 London time. The person a SAR/concern is
// assigned to is told when it is due within two days and again when it goes
// overdue; a SAR's escalation manager is told only once it is overdue. Each
// notification is created once (a fixed id per record, person and due date), so
// running every day never repeats one. See services/dueNotificationService.js.
exports.scheduledDueNotifications = onSchedule(
  {
    region: "europe-west2",
    schedule: "30 7 * * *",
    timeZone: "Europe/London",
    timeoutSeconds: 120,
  },
  async () => {
    const result = await sendDueNotifications({ db });
    console.log("Due-date notifications", result);
  }
);

// The same job, run on demand by an administrator (Admin > Notifications), so
// the schedule can be tried without waiting for the morning.
exports.sendDueNotificationsNow = onCall({ region: "europe-west2", timeoutSeconds: 120 }, async (request) => {
  await assertAdmin(request);
  return sendDueNotifications({ db });
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
