const DATABASE_NAME = "primovex-clinflow";
const DATABASE_VERSION = 3;
const DOCUMENT_STORE = "synthetic_documents";
const TEACHING_STORE = "triage_teaching";
const SOURCE_STORE = "source_documents";
const FINISHED_STORE = "finished_docman_packs";

function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) database.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(TEACHING_STORE)) database.createObjectStore(TEACHING_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(SOURCE_STORE)) database.createObjectStore(SOURCE_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(FINISHED_STORE)) database.createObjectStore(FINISHED_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("ClinFlow local database could not be opened."));
  });
}

function serialisableDocument(document, sourceFileAvailable = false) {
  if (!document?.id || document?.dataMode === "live") return null;
  const { sourceFile: _sourceFile, ...syntheticOcr } = document.syntheticOcr || {};
  return JSON.parse(JSON.stringify({
    ...document,
    ...(document.syntheticOcr ? { syntheticOcr: { ...syntheticOcr, sourceFileAvailable } } : {}),
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

function getAllFromStore(storeName) {
  return openDatabase().then((database) => {
    if (!database) return [];
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("ClinFlow cached records could not be read."));
      transaction.oncomplete = () => database.close();
    });
  });
}

function sourceFileFromRecord(record) {
  if (!record?.blob) return null;
  if (typeof File === "function") {
    return new File([record.blob], record.fileName || "original.pdf", {
      type: record.type || "application/pdf",
      lastModified: record.lastModified || Date.now(),
    });
  }
  return record.blob;
}

export async function loadCachedClinFlowDocuments() {
  const [documents, sources] = await Promise.all([getAllFromStore(DOCUMENT_STORE), getAllFromStore(SOURCE_STORE)]);
  const sourceById = new Map(sources.map((record) => [record.id, record]));
  return documents
    .filter((item) => item.dataMode === "synthetic" && !item.archived)
    .map((item) => {
      const sourceFile = sourceFileFromRecord(sourceById.get(item.id));
      if (!sourceFile) return item;
      return { ...item, syntheticOcr: { ...item.syntheticOcr, sourceFile, sourceFileAvailable: true } };
    });
}

export async function cacheClinFlowDocuments(documents) {
  const sourceRows = (documents || []).map((document) => {
    const sourceFile = document?.syntheticOcr?.sourceFile;
    if (!document?.id || !(sourceFile instanceof Blob)) return null;
    return {
      id: document.id,
      blob: sourceFile,
      fileName: sourceFile.name || document.syntheticOcr.fileName || "original.pdf",
      type: sourceFile.type || "application/pdf",
      size: sourceFile.size || 0,
      lastModified: sourceFile.lastModified || Date.now(),
      storedAt: new Date().toISOString(),
      dataMode: "synthetic",
    };
  }).filter(Boolean);
  if (sourceRows.length) await runTransaction(SOURCE_STORE, "readwrite", (store) => sourceRows.forEach((item) => store.put(item)));
  const sourceIds = new Set(sourceRows.map((item) => item.id));
  const rows = (documents || []).map((document) => serialisableDocument(document, sourceIds.has(document.id) || Boolean(document?.syntheticOcr?.sourceFileAvailable))).filter(Boolean);
  if (!rows.length) return 0;
  await runTransaction(DOCUMENT_STORE, "readwrite", (store) => rows.forEach((item) => store.put(item)));
  return rows.length;
}

export async function loadClinFlowSourceFile(documentId) {
  if (!documentId) return null;
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SOURCE_STORE, "readonly");
    const request = transaction.objectStore(SOURCE_STORE).get(documentId);
    request.onsuccess = () => resolve(sourceFileFromRecord(request.result));
    request.onerror = () => reject(request.error || new Error("The original ClinFlow document could not be read."));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveFinishedClinFlowPack({ document, originalBlob, summaryBlob, manifest }) {
  if (!document?.id || !(originalBlob instanceof Blob) || !(summaryBlob instanceof Blob)) {
    throw new Error("A finished pack requires both the untouched original and the ClinFlow summary.");
  }
  const record = {
    id: document.id,
    documentId: document.id,
    title: document.title,
    patient: document.patient,
    destination: document.destination,
    completedAt: document.completedAt || new Date().toISOString(),
    originalFileName: document.syntheticOcr?.fileName || originalBlob.name || "original.pdf",
    originalBlob,
    summaryFileName: `${String(document.syntheticOcr?.fileName || document.title || "document").replace(/\.pdf$/i, "")}-primovex-clinflow-summary.pdf`,
    summaryBlob,
    manifest: manifest || {},
    dataMode: document.dataMode || "synthetic",
    storedAt: new Date().toISOString(),
  };
  await runTransaction(FINISHED_STORE, "readwrite", (store) => store.put(record));
  return record;
}

export async function loadFinishedClinFlowPacks() {
  return (await getAllFromStore(FINISHED_STORE)).filter((item) => item.dataMode === "synthetic");
}

export async function removeCachedClinFlowDocument(documentId) {
  if (!documentId) return;
  await Promise.all([
    runTransaction(DOCUMENT_STORE, "readwrite", (store) => store.delete(documentId)),
    runTransaction(SOURCE_STORE, "readwrite", (store) => store.delete(documentId)),
    runTransaction(FINISHED_STORE, "readwrite", (store) => store.delete(documentId)),
  ]);
}

export async function loadClinFlowTeachingFeedback() {
  return (await getAllFromStore(TEACHING_STORE)).filter((item) => item.dataMode === "synthetic");
}

export async function saveClinFlowTeachingFeedback({ document, suggestedDecision, confirmedDecision, actorUid, feedback = {} }) {
  if (!document?.id || document?.dataMode === "live" || !confirmedDecision) return null;
  const triage = document.clinflowAnalysis?.triage || {};
  const record = {
    id: globalThis.crypto?.randomUUID?.() || `teaching-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    schemaVersion: 2,
    dataMode: "synthetic",
    documentProfile: document.syntheticOcr?.document?.id || document.id || "unknown",
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
