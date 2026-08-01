const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { SYNTHETIC_DOCUMENT_PACK, getSyntheticPackDocument } = require("../config/clinflowSyntheticPack");
const { compareGroundTruth, normaliseEndpoint, retryDelayMs, summariseAnalyzeResult } = require("../services/azureDocumentIntelligenceService");

test("the controlled synthetic pack contains five fingerprinted PDFs", () => {
  assert.equal(Object.keys(SYNTHETIC_DOCUMENT_PACK).length, 5);
  for (const hash of Object.keys(SYNTHETIC_DOCUMENT_PACK)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(getSyntheticPackDocument("not-approved"), null);
});

test("the bundled PDFs match the server allowlist", () => {
  const directory = path.join(__dirname, "..", "..", "test-data", "clinflow-synthetic-hospital-pack");
  const files = fs.readdirSync(directory).filter((name) => name.endsWith(".pdf"));
  assert.equal(files.length, 5);
  for (const name of files) {
    const bytes = fs.readFileSync(path.join(directory, name));
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    assert.ok(getSyntheticPackDocument(hash), `${name} is not allowlisted`);
  }
});

test("ground truth comparison is case and punctuation tolerant", () => {
  const values = compareGroundTruth("Patient: Alex Example. SpO2 97%.", [["Patient", "alex example"], ["Oxygen", "97%"], ["Drug", "salbutamol"]]);
  assert.deepEqual(values.map((item) => item.matched), [true, true, false]);
});

test("Azure endpoint validation accepts HTTPS and rejects arbitrary URLs", () => {
  assert.equal(normaliseEndpoint("https://example.cognitiveservices.azure.com/"), "https://example.cognitiveservices.azure.com");
  assert.throws(() => normaliseEndpoint("http://example.test"));
  assert.throws(() => normaliseEndpoint("https://example.test/path"));
});

test("Azure throttling honours Retry-After and uses bounded backoff", () => {
  const response = { headers: { get: (name) => name === "retry-after" ? "7" : null } };
  assert.equal(retryDelayMs(response, 0), 7000);
  assert.equal(retryDelayMs({ headers: { get: () => null } }, 0), 4000);
  assert.equal(retryDelayMs({ headers: { get: () => null } }, 9), 20000);
});

test("provider output is reduced to review-safe fields", () => {
  const packDocument = { id: "demo", title: "Demo", expected: [["Patient", "Alex Example"]] };
  const summary = summariseAnalyzeResult({
    analyzeResult: {
      apiVersion: "2024-11-30",
      modelId: "prebuilt-layout",
      content: "Alex Example",
      pages: [{ words: [{ content: "Alex", confidence: 0.8 }, { content: "Example", confidence: 1 }], lines: [{ content: "Alex Example" }] }],
      tables: [],
    },
  }, packDocument);
  assert.equal(summary.pageCount, 1);
  assert.equal(summary.wordCount, 2);
  assert.equal(summary.averageConfidence, 0.9);
  assert.equal(summary.groundTruthScore, 1);
  assert.equal(summary.pages[0].pageNumber, 1);
  assert.equal(summary.pages[0].content, "Alex Example");
  assert.equal(Object.hasOwn(summary, "rawResponse"), false);
});

test("provider output preserves numbered Azure page boundaries", () => {
  const summary = summariseAnalyzeResult({ analyzeResult: {
    content: "First page\nSecond page",
    pages: [
      { pageNumber: 1, lines: [{ content: "First page" }] },
      { pageNumber: 2, lines: [{ content: "Second page" }] },
    ],
  } }, { id: "multi", title: "Multi-page", expected: [] });
  assert.deepEqual(summary.pages.map((page) => [page.pageNumber, page.content]), [[1, "First page"], [2, "Second page"]]);
});
