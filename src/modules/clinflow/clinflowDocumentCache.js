const DATABASE_NAME = "primovex-clinflow";
const DATABASE_VERSION = 2;
const DOCUMENT_STORE = "synthetic_documents";
const TEACHING_STORE = "triage_teaching";

function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) database.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(TEACHING_STORE)) database.createObjectStore(TEACHING_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("ClinFlow local database could not be opened."));
  });
}

function serialisableDocument(document) {
  if (!document?.syntheticOcr || !document?.id) return null;
  const { sourceFile: _sourceFile, ...syntheticOcr } = document.syntheticOcr;
  return JSON.parse(JSON.stringify({
    ...document,
    syntheticOcr: { ...syntheticOcr, sourceFileAvailable: false },
    dataMode: "synthetic",
    locallyCachedAt: new Date().toISOString(),
  }));
}

async function runTransaction(storeName, mode, operation) {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = operation(store);
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("ClinFlow local database operation failed.")); };
  });
}

export async function loadCachedClinFlowDocuments() {
  const database = await openDatabase();
  if (!database) return [];
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DOCUMENT_STORE, "readonly");
    const request = transaction.objectStore(DOCUMENT_STORE).getAll();
    request.onsuccess = () => resolve((request.result || []).filter((item) => item.dataMode === "synthetic" && !item.archived));
    request.onerror = () => reject(request.error || new Error("ClinFlow cached documents could not be read."));
    transaction.oncomplete = () => database.close();
  });
}

export async function cacheClinFlowDocuments(documents) {
  const rows = (documents || []).map(serialisableDocument).filter(Boolean);
  if (!rows.length) return 0;
  await runTransaction(DOCUMENT_STORE, "readwrite", (store) => rows.forEach((item) => store.put(item)));
  return rows.length;
}

export async function removeCachedClinFlowDocument(documentId) {
  if (!documentId) return;
  await runTransaction(DOCUMENT_STORE, "readwrite", (store) => store.delete(documentId));
}

export async function loadClinFlowTeachingFeedback() {
  const database = await openDatabase();
  if (!database) return [];
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TEACHING_STORE, "readonly");
    const request = transaction.objectStore(TEACHING_STORE).getAll();
    request.onsuccess = () => resolve((request.result || []).filter((item) => item.dataMode === "synthetic"));
    request.onerror = () => reject(request.error || new Error("ClinFlow teaching evidence could not be read."));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveClinFlowTeachingFeedback({ document, suggestedDecision, confirmedDecision, actorUid, feedback = {} }) {
  if (!document?.syntheticOcr || !confirmedDecision) return null;
  const triage = document.clinflowAnalysis?.triage || {};
  const record = {
    id: globalThis.crypto?.randomUUID?.() || `teaching-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    schemaVersion: 2,
    dataMode: "synthetic",
    documentProfile: document.syntheticOcr?.document?.id || "unknown",
    suggestedDecision: suggestedDecision || triage.decision || "review_required",
    confirmedDecision,
    rulesetVersion: triage.rulesetVersion || "unknown",
    featureKeys: (triage.reasons || []).map((item) => item.key).filter(Boolean),
    clinicalTriggerTypes: (triage.clinicalTriggers || []).map((item) => item.type).filter(Boolean),
    suggestedDestination: triage.destination || "Workflow review",
    confirmedDestination: String(feedback.confirmedDestination || "").trim(),
    nfwfCategory: String(feedback.nfwfCategory || "").trim(),
    correctionReason: String(feedback.correctionReason || "").trim(),
    correctedSummary: String(feedback.correctedSummary || "").trim(),
    learningNotes: String(feedback.learningNotes || "").trim(),
    accuracyChecks: feedback.accuracyChecks || {},
    actorUid: actorUid || "unknown",
    createdAt: new Date().toISOString(),
    governanceStatus: "awaiting_governed_review",
    mayChangeLiveRules: false,
  };
  await runTransaction(TEACHING_STORE, "readwrite", (store) => store.put(record));
  return record;
}
