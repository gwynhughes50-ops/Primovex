const test = require("node:test");
const assert = require("node:assert/strict");
const { checkRecording, cleanPhrases, transcribe, SAMPLE_RATE } = require("../services/speechService");

// a WAV of `seconds` of silence in the format the phone sends
function wav(seconds, { rate = SAMPLE_RATE, channels = 1, bits = 16 } = {}) {
  const samples = Math.round(SAMPLE_RATE * seconds);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer.toString("base64");
}

test("a recording of a few seconds in the right format is accepted", () => {
  const result = checkRecording(wav(3));
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.seconds - 3) < 0.01);
});

test("nothing, too short, too long, not a WAV, or the wrong format is refused with a reason", () => {
  assert.match(checkRecording("").error, /no recording/);
  assert.match(checkRecording(undefined).error, /no recording/);
  assert.match(checkRecording(wav(0.1)).error, /too short/);
  assert.match(checkRecording(wav(25)).error, /too long/);
  assert.match(checkRecording(Buffer.from("this is not audio at all".repeat(2000)).toString("base64")).error, /expected format/);
  assert.match(checkRecording(wav(2, { rate: 44100 })).error, /expected format/);
  assert.match(checkRecording(wav(2, { channels: 2 })).error, /expected format/);
  assert.match(checkRecording(wav(2, { bits: 8 })).error, /expected format/);
});

test("name hints are tidied and limited", () => {
  const phrases = cleanPhrases(["  Cliniwipes ", "", null, "x".repeat(200), ...Array.from({ length: 150 }, (_, i) => `item ${i}`)]);
  assert.equal(phrases.length, 100);
  assert.equal(phrases[0], "Cliniwipes");
  assert.equal(phrases[1].length, 60);
  assert.deepEqual(cleanPhrases("not a list"), []);
});

test("the words come back joined, with the settings the phone's recording needs", async () => {
  const calls = [];
  const client = { recognize: async (request) => { calls.push(request); return [{ results: [{ alternatives: [{ transcript: " how many saline ", confidence: 0.9 }] }, { alternatives: [{ transcript: "are in the store", confidence: 0.8 }] }] }]; } };
  const result = await transcribe({ client, base64: "AAAA", phrases: ["Saline"] });
  assert.deepEqual(result, { text: "how many saline are in the store", confidence: 0.85 });
  assert.deepEqual([calls[0].config.encoding, calls[0].config.sampleRateHertz, calls[0].config.languageCode, calls[0].config.model], ["LINEAR16", 16000, "en-GB", "latest_short"]);
  assert.deepEqual(calls[0].config.speechContexts[0].phrases, ["Saline"]);
  assert.equal(calls[0].audio.content, "AAAA");
});

test("nothing heard gives empty text; an unknown model falls back, other errors are raised", async () => {
  assert.deepEqual(await transcribe({ client: { recognize: async () => [{ results: [] }] }, base64: "A" }), { text: "", confidence: 0 });
  let n = 0;
  const flaky = { recognize: async (request) => { n += 1; if (request.config.model) throw new Error("Invalid recognition 'config': model not supported"); return [{ results: [{ alternatives: [{ transcript: "ok", confidence: 1 }] }] }]; } };
  assert.equal((await transcribe({ client: flaky, base64: "A" })).text, "ok");
  assert.equal(n, 2);
  await assert.rejects(() => transcribe({ client: { recognize: async () => { throw new Error("quota exceeded"); } }, base64: "A" }), /quota/);
});
