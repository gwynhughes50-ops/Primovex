const test = require("node:test");
const assert = require("node:assert/strict");
const { extractClinicalFacts } = require("../services/azureOpenAiExtractionService");

const AZURE = { endpoint: "https://example.openai.azure.com", key: "k", deployment: "d" };
const reply = (json) => async () => ({ ok: true, status: 200, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(json) }] }] }) });
const read = (json) => extractClinicalFacts({ ...AZURE, ocrText: "Seen in clinic. Nothing further is required from the GP.", fetchImpl: reply(json) });

test("the 'nothing needed from the practice' reading carries its quote and its requests", async () => {
  const result = await read({ noActionRequired: true, noActionQuote: "Nothing further is required from the GP.", requestsOfPractice: [] });
  assert.equal(result.noActionRequired, true);
  assert.equal(result.noActionQuote, "Nothing further is required from the GP.");
  assert.deepEqual(result.requestsOfPractice, []);
});

test("if the model names any request of the practice, 'no action' is forced to false and the quote dropped", async () => {
  const result = await read({ noActionRequired: true, noActionQuote: "Nothing further is required.", requestsOfPractice: ["Please repeat the sodium in two weeks."] });
  assert.equal(result.noActionRequired, false);
  assert.equal(result.noActionQuote, null);
  assert.deepEqual(result.requestsOfPractice, ["Please repeat the sodium in two weeks."]);
});

test("anything other than a plain true counts as not confirmed, and missing fields are safe", async () => {
  for (const value of ["true", 1, null, undefined]) {
    const result = await read({ noActionRequired: value, noActionQuote: "Nothing further is required from the GP." });
    assert.equal(result.noActionRequired, false, `noActionRequired ${JSON.stringify(value)} is not true`);
    assert.equal(result.noActionQuote, null);
  }
  const empty = await extractClinicalFacts({ ...AZURE, ocrText: "   " });
  assert.equal(empty.noActionRequired, false);
  assert.deepEqual(empty.requestsOfPractice, []);
});

test("the instructions ask for word-for-word requests, say 'when in doubt, false', and forbid made-up quotes", () => {
  const source = require("node:fs").readFileSync(require.resolve("../services/azureOpenAiExtractionService"), "utf8");
  assert.match(source, /requestsOfPractice: EVERY sentence/);
  assert.match(source, /When in doubt, false/);
  assert.match(source, /Never write a sentence that is not in the letter/);
});
