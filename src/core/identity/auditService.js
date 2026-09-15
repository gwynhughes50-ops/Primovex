import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";

export const AUDIT_EVENTS_COLLECTION = "audit_events";
export const AUDIT_LEDGER_VERSION = 2;
const OUTBOX_KEY = "primovex.audit.outbox.v2";
const APP_VERSION = "0.15.41";

function clientId() {
  return globalThis.crypto?.randomUUID?.() || `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function platformContext() {
  const userAgent = String(globalThis.navigator?.userAgent || "").toLowerCase();
  const client = globalThis.__TAURI_INTERNALS__ ? "tauri" : "web";
  const platform = userAgent.includes("android") ? "android" : userAgent.includes("windows") ? "windows" : userAgent.includes("iphone") || userAgent.includes("ipad") ? "ios" : "browser";
  return { client, platform };
}

function readOutbox() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(OUTBOX_KEY) || "[]");
    return Array.isArray(value) ? value.slice(-100) : [];
  } catch {
    return [];
  }
}

function writeOutbox(rows) {
  try { globalThis.localStorage?.setItem(OUTBOX_KEY, JSON.stringify(rows.slice(-100))); } catch { /* retry queue is availability support only */ }
}

function normaliseEvent(input = {}) {
  const source = platformContext();
  return {
    clientEventId: input.clientEventId || clientId(),
    action: input.action,
    module: input.module,
    targetType: input.targetType,
    targetId: input.targetId || null,
    summary: input.summary,
    metadata: input.metadata || {},
    classification: input.classification || "operational",
    disclosureLevel: input.disclosureLevel || "operational",
    permissionDecision: input.permissionDecision || "allowed",
    outcome: input.outcome || "success",
    correlationId: input.correlationId || null,
    sessionId: input.sessionId || null,
    siteId: input.siteId || null,
    appVersion: APP_VERSION,
    ...source,
  };
}

async function send(event) {
  const call = httpsCallable(functions, "recordGovernedAuditEvent", { timeout: 15000 });
  const response = await call(event);
  return response.data;
}

export async function flushAuditOutbox() {
  const queued = readOutbox();
  if (!queued.length) return { attempted: 0, remaining: 0 };
  const remaining = [];
  for (const event of queued) {
    try { await send(event); } catch { remaining.push(event); }
  }
  writeOutbox(remaining);
  return { attempted: queued.length, remaining: remaining.length };
}

/**
 * Writes through the server-authoritative governed ledger. Actor identity and
 * role are taken from Firebase Auth/profile by the Cloud Function, never from
 * caller-supplied display data. Failed best-effort writes enter a small retry
 * outbox; critical callers can request a thrown error with required=true.
 */
export async function writeAuditEvent(input = {}) {
  const event = normaliseEvent(input);
  flushAuditOutbox().catch(() => {});
  try {
    return await send(event);
  } catch (error) {
    const queued = readOutbox();
    if (!queued.some((row) => row.clientEventId === event.clientEventId)) writeOutbox([...queued, event]);
    console.warn("[Primovex Governed Audit] Event queued for retry", { action: event.action, module: event.module, code: error?.code });
    if (input.required) throw error;
    return { ok: false, queued: true, clientEventId: event.clientEventId };
  }
}

export function subscribeAuditEvents({ practiceId = "primary", max = 500, since = null, until = null } = {}, onData, onError) {
  const clauses = [
    collection(db, AUDIT_EVENTS_COLLECTION),
    where("practiceId", "==", practiceId || "primary"),
  ];
  if (since instanceof Date && !Number.isNaN(since.getTime())) {
    clauses.push(where("occurredAt", ">=", Timestamp.fromDate(since)));
  }
  if (until instanceof Date && !Number.isNaN(until.getTime())) {
    clauses.push(where("occurredAt", "<=", Timestamp.fromDate(until)));
  }
  if (since || until) clauses.push(orderBy("occurredAt", "desc"));
  clauses.push(limit(Math.min(Math.max(Number(max) || 250, 1), 2000)));
  const request = query(...clauses);
  return onSnapshot(request, (snapshot) => {
    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    rows.sort((a, b) => Number(b.sequence || 0) - Number(a.sequence || 0));
    onData(rows);
  }, onError);
}

/** Date-range report presets for "who did what when" audit queries. */
export const AUDIT_RANGE_PRESETS = [
  { id: "24h", label: "Last 24 hours", hours: 24 },
  { id: "7d", label: "Last 7 days", hours: 24 * 7 },
  { id: "1m", label: "Last month", hours: 24 * 30 },
  { id: "6m", label: "Last 6 months", hours: 24 * 30 * 6 },
  { id: "12m", label: "Last 12 months", hours: 24 * 365 },
  { id: "custom", label: "Custom range", hours: null },
];

export function resolveAuditRange(presetId, customFrom, customTo) {
  if (presetId === "custom") {
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const to = customTo ? new Date(`${customTo}T23:59:59.999`) : null;
    return {
      since: from && !Number.isNaN(from.getTime()) ? from : null,
      until: to && !Number.isNaN(to.getTime()) ? to : null,
    };
  }
  const preset = AUDIT_RANGE_PRESETS.find((row) => row.id === presetId);
  if (!preset?.hours) return { since: null, until: null };
  return { since: new Date(Date.now() - preset.hours * 3600000), until: null };
}

export function auditTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function downloadAuditEvidence(events, format = "json") {
  const generatedAt = new Date().toISOString();
  const safeRows = events.map((event) => ({
    sequence: event.sequence,
    eventId: event.eventId || event.id,
    occurredAt: auditTimestamp(event.occurredAt)?.toISOString() || null,
    actorUid: event.actorUid,
    actorRole: event.actorRole,
    practiceId: event.practiceId,
    siteId: event.siteId,
    action: event.action,
    module: event.module,
    targetType: event.targetType,
    targetId: event.targetId,
    summary: event.summary,
    outcome: event.outcome,
    permissionDecision: event.permissionDecision,
    correlationId: event.correlationId,
    previousHash: event.previousHash,
    integrityHash: event.integrityHash,
    source: event.source,
    metadata: event.metadata,
  }));
  let content;
  let type;
  let extension;
  if (format === "csv") {
    const keys = ["sequence", "eventId", "occurredAt", "actorUid", "actorRole", "practiceId", "siteId", "action", "module", "targetType", "targetId", "summary", "outcome", "permissionDecision", "correlationId", "previousHash", "integrityHash"];
    const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    content = [keys.join(","), ...safeRows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n");
    type = "text/csv";
    extension = "csv";
  } else {
    content = JSON.stringify({ schemaVersion: AUDIT_LEDGER_VERSION, generatedAt, recordCount: safeRows.length, events: safeRows }, null, 2);
    type = "application/json";
    extension = "json";
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `primovex-audit-evidence-${generatedAt.slice(0, 10)}.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
}
