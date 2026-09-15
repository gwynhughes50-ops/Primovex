const crypto = require("crypto");
const { Timestamp } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

const AUDIT_SCHEMA_VERSION = 2;
const MAX_SUMMARY_LENGTH = 320;
const MAX_IDENTIFIER_LENGTH = 160;
const MAX_METADATA_KEYS = 24;
const BLOCKED_METADATA_KEY = /(patient|nhs|dob|email|name|address|phone|prompt|query|answer|transcript|document.?text|raw|content|secret|token|password)/i;

function clean(value, max = MAX_IDENTIFIER_LENGTH) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function safeCode(value, fallback) {
  const normalised = clean(value, 96).toLowerCase();
  return /^[a-z0-9][a-z0-9._:-]*$/.test(normalised) ? normalised : fallback;
}

function allowedCode(value, allowed, fallback) {
  const candidate = safeCode(value, fallback);
  return allowed.includes(candidate) ? candidate : fallback;
}

function safeMetadata(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  Object.entries(input).slice(0, MAX_METADATA_KEYS).forEach(([rawKey, rawValue]) => {
    const key = clean(rawKey, 64);
    if (!key || BLOCKED_METADATA_KEY.test(key)) return;
    if (typeof rawValue === "boolean") output[key] = rawValue;
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) output[key] = rawValue;
    else if (typeof rawValue === "string") output[key] = clean(rawValue, 180);
    else if (Array.isArray(rawValue)) {
      output[key] = rawValue.slice(0, 12).map((item) => clean(item, 80)).filter(Boolean);
    }
  });
  return output;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildAuditEvent({ data, auth, profile, eventId, sequence, previousHash, occurredAt }) {
  const practiceId = clean(profile.practiceId || profile.organisationId || profile.organizationId, MAX_IDENTIFIER_LENGTH) || "primary";
  // Actor tenancy and location are trusted profile attributes. A client may
  // identify the target record, but cannot claim to be acting from another site.
  const siteId = clean(profile.siteId, MAX_IDENTIFIER_LENGTH) || "SITE-MAIN";
  const action = safeCode(data.action, "unknown.action");
  const module = safeCode(data.module, "platform");
  const targetType = safeCode(data.targetType, "platform_record");
  const targetId = clean(data.targetId || "", MAX_IDENTIFIER_LENGTH) || null;
  const classification = allowedCode(data.classification, ["operational", "synthetic", "personal", "special_category", "security", "governance"], "operational");
  const disclosureLevel = allowedCode(data.disclosureLevel, ["operational", "named_operational", "restricted", "synthetic"], "operational");
  const outcome = allowedCode(data.outcome, ["success", "failure", "denied", "partial", "queued"], "success");
  const permissionDecision = allowedCode(data.permissionDecision, ["allowed", "denied", "partially_withheld", "not_applicable"], "allowed");
  const correlationId = clean(data.correlationId, 96) || eventId;
  const sessionId = clean(data.sessionId, 96) || null;
  const source = {
    app: "primovex",
    version: clean(data.appVersion, 32) || "unknown",
    client: safeCode(data.client, "web"),
    platform: safeCode(data.platform, "unknown"),
  };
  const event = {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    eventId,
    sequence,
    previousHash: previousHash || null,
    occurredAt,
    recordedAt: occurredAt,
    actorUid: auth.uid,
    actorRole: clean(profile.role, 80) || "Unknown",
    practiceId,
    siteId,
    action,
    module,
    targetType,
    targetId,
    summary: clean(data.summary, MAX_SUMMARY_LENGTH) || action,
    outcome,
    permissionDecision,
    classification,
    disclosureLevel,
    correlationId,
    sessionId,
    source,
    metadata: safeMetadata(data.metadata),
    retentionClass: "security_and_governance_audit",
    legalHold: false,
  };
  event.integrityHash = sha256(stableJson(event));
  return event;
}

async function appendGovernedAuditEvent({ db, auth, data = {}, profile = {} }) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in is required to write an audit event.");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "A structured audit event is required.");
  }
  const practiceId = clean(profile.practiceId || profile.organisationId || profile.organizationId, MAX_IDENTIFIER_LENGTH) || "primary";
  const headRef = db.collection("audit_ledger_heads").doc(practiceId);
  const requestedId = clean(data.clientEventId, 96);
  const eventRef = /^[a-zA-Z0-9_-]{20,96}$/.test(requestedId)
    ? db.collection("audit_events").doc(requestedId)
    : db.collection("audit_events").doc();

  return db.runTransaction(async (transaction) => {
    const [headSnapshot, existingSnapshot] = await Promise.all([
      transaction.get(headRef),
      transaction.get(eventRef),
    ]);
    if (existingSnapshot.exists) {
      const existing = existingSnapshot.data() || {};
      if (existing.actorUid !== auth.uid) throw new HttpsError("already-exists", "That audit receipt belongs to another user.");
      return { ok: true, duplicate: true, eventId: eventRef.id, sequence: existing.sequence, integrityHash: existing.integrityHash };
    }
    const head = headSnapshot.data() || {};
    const sequence = Number(head.sequence || 0) + 1;
    const occurredAt = Timestamp.now();
    const event = buildAuditEvent({
      data,
      auth,
      profile,
      eventId: eventRef.id,
      sequence,
      previousHash: head.integrityHash || null,
      occurredAt,
    });
    transaction.create(eventRef, event);
    transaction.set(headRef, {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      practiceId,
      sequence,
      eventId: eventRef.id,
      integrityHash: event.integrityHash,
      updatedAt: occurredAt,
    });
    return {
      ok: true,
      eventId: eventRef.id,
      sequence,
      integrityHash: event.integrityHash,
      occurredAt: occurredAt.toDate().toISOString(),
    };
  });
}

module.exports = {
  AUDIT_SCHEMA_VERSION,
  appendGovernedAuditEvent,
  buildAuditEvent,
  safeMetadata,
};
