const API_VERSION = "2024-11-30";
const MODEL_ID = "prebuilt-layout";
const MAX_RESULT_TEXT = 24000;
const MAX_PAGE_TEXT = 12000;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelayMs(response, throttleAttempt = 0) {
  const retryAfterMs = Number(response?.headers?.get?.("x-ms-retry-after-ms"));
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return Math.min(retryAfterMs, 30000);
  const retryAfter = response?.headers?.get?.("retry-after");
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30000);
  const date = Date.parse(retryAfter || "");
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 1000), 30000);
  return Math.min(4000 * (2 ** throttleAttempt), 20000);
}

function normaliseEndpoint(endpoint) {
  const value = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(value)) {
    throw new Error("The Azure Document Intelligence endpoint is missing or invalid.");
  }
  return value;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function normaliseForComparison(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9%&/.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compareGroundTruth(content, expected = []) {
  const haystack = normaliseForComparison(content);
  return expected.map(([label, value]) => {
    const needle = normaliseForComparison(value);
    return { label, expected: value, matched: Boolean(needle && haystack.includes(needle)) };
  });
}

function compactTables(tables = []) {
  return tables.slice(0, 8).map((table, index) => ({
    index: index + 1,
    rows: table.rowCount || 0,
    columns: table.columnCount || 0,
    cells: (table.cells || []).slice(0, 80).map((cell) => ({
      row: cell.rowIndex,
      column: cell.columnIndex,
      content: String(cell.content || "").slice(0, 500),
      kind: cell.kind || "content",
    })),
  }));
}

function compactPages(pages = []) {
  let remainingCharacters = MAX_RESULT_TEXT;
  return pages.map((page, index) => {
    const pageText = (page.lines || [])
      .map((line) => String(line.content || "").trim())
      .filter(Boolean)
      .join("\n");
    const limit = Math.max(0, Math.min(MAX_PAGE_TEXT, remainingCharacters));
    const content = pageText.slice(0, limit);
    remainingCharacters -= content.length;
    return {
      pageNumber: Number(page.pageNumber) || index + 1,
      lineCount: (page.lines || []).length,
      width: Number.isFinite(Number(page.width)) ? Number(page.width) : null,
      height: Number.isFinite(Number(page.height)) ? Number(page.height) : null,
      unit: page.unit || null,
      content,
      truncated: pageText.length > content.length,
    };
  });
}

function summariseAnalyzeResult(payload, packDocument) {
  const analyzeResult = payload?.analyzeResult || {};
  const pages = analyzeResult.pages || [];
  const words = pages.flatMap((page) => page.words || []);
  const lines = pages.flatMap((page) => page.lines || []);
  const confidences = words.map((word) => Number(word.confidence)).filter(Number.isFinite);
  const content = String(analyzeResult.content || "").slice(0, MAX_RESULT_TEXT);
  const groundTruth = compareGroundTruth(content, packDocument.expected);
  const matched = groundTruth.filter((field) => field.matched).length;

  return {
    provider: "Azure AI Document Intelligence",
    apiVersion: analyzeResult.apiVersion || API_VERSION,
    modelId: analyzeResult.modelId || MODEL_ID,
    document: { id: packDocument.id, title: packDocument.title },
    pageCount: pages.length,
    wordCount: words.length,
    lineCount: lines.length,
    averageConfidence: average(confidences),
    content,
    pages: compactPages(pages),
    tables: compactTables(analyzeResult.tables),
    groundTruth,
    groundTruthScore: groundTruth.length ? matched / groundTruth.length : null,
    warnings: [
      "Synthetic test data only.",
      "OCR output must be reviewed by a person and must not trigger a clinical action automatically.",
    ],
  };
}

async function analyzeDocument({ endpoint, key, base64Source, fetchImpl = fetch }) {
  const serviceEndpoint = normaliseEndpoint(endpoint);
  if (!String(key || "").trim()) throw new Error("The Azure Document Intelligence key is missing.");

  const analyzeUrl = `${serviceEndpoint}/documentintelligence/documentModels/${MODEL_ID}:analyze?_overload=analyzeDocument&api-version=${API_VERSION}`;
  let submitted;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    submitted = await fetchImpl(analyzeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": key,
      },
      body: JSON.stringify({ base64Source }),
    });
    if (submitted.status !== 429) break;
    await sleep(retryDelayMs(submitted, attempt));
  }

  if (submitted.status !== 202) {
    const detail = (await submitted.text()).slice(0, 1200);
    throw new Error(`Azure rejected the document (${submitted.status}). ${detail}`);
  }

  const operationLocation = submitted.headers.get("operation-location");
  if (!operationLocation?.startsWith(serviceEndpoint)) {
    throw new Error("Azure did not return a trusted operation location.");
  }

  let throttleAttempts = 0;
  for (let attempt = 0; attempt < 55; attempt += 1) {
    await sleep(1500);
    const polled = await fetchImpl(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": key },
    });
    if (polled.status === 429) {
      if (throttleAttempts >= 7) throw new Error("Azure remained busy after controlled retries. Wait a minute and retry this document.");
      await sleep(retryDelayMs(polled, throttleAttempts));
      throttleAttempts += 1;
      continue;
    }
    if (!polled.ok) throw new Error(`Azure analysis polling failed (${polled.status}).`);
    throttleAttempts = 0;
    const payload = await polled.json();
    const status = String(payload.status || "").toLowerCase();
    if (status === "succeeded") return payload;
    if (status === "failed") {
      const message = payload?.error?.message || "Azure could not analyse the document.";
      throw new Error(message);
    }
  }

  throw new Error("Azure analysis timed out. Try the document again.");
}

module.exports = {
  API_VERSION,
  MODEL_ID,
  analyzeDocument,
  compareGroundTruth,
  compactPages,
  normaliseEndpoint,
  retryDelayMs,
  summariseAnalyzeResult,
};
