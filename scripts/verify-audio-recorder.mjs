import assert from "node:assert/strict";
import { createEndpointer, downsample, encodeWav, floatTo16BitPCM, rmsOf, toBase64 } from "../src/lib/audioRecorder.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("audio is brought down to 16 kHz by averaging, and never up", () => {
  const input = Float32Array.from({ length: 48 }, (_, i) => i % 2);
  const out = downsample(input, 48000, 16000);
  assert.equal(out.length, 16);
  assert.ok(out.every((v) => v >= 0 && v <= 1));
  assert.equal(downsample(input, 8000, 16000), input, "a lower rate is left as it is");
});

t("samples become 16-bit numbers, clipped at the ends", () => {
  const pcm = floatTo16BitPCM(Float32Array.from([0, 1, -1, 2, -2, 0.5]));
  assert.deepEqual([...pcm], [0, 32767, -32768, 32767, -32768, 16383]);
});

t("the WAV file has the right header and size", () => {
  const wav = encodeWav(Int16Array.from([1, -1, 100]), 16000);
  const text = (a, b) => String.fromCharCode(...wav.slice(a, b));
  assert.equal(wav.length, 44 + 6);
  assert.deepEqual([text(0, 4), text(8, 12), text(12, 16), text(36, 40)], ["RIFF", "WAVE", "fmt ", "data"]);
  const view = new DataView(wav.buffer);
  assert.equal(view.getUint32(24, true), 16000, "sample rate");
  assert.equal(view.getUint16(22, true), 1, "mono");
  assert.equal(view.getUint32(40, true), 6, "data length");
  assert.equal(view.getInt16(44, true), 1);
  assert.equal(view.getInt16(46, true), -1);
});

t("base64 of the bytes round-trips, including large inputs", () => {
  const bytes = Uint8Array.from({ length: 100000 }, (_, i) => i % 251);
  const back = Uint8Array.from(Buffer.from(toBase64(bytes), "base64"));
  assert.deepEqual(back, bytes);
});

t("loudness is the root mean square", () => {
  assert.equal(rmsOf(new Float32Array(0)), 0);
  assert.ok(Math.abs(rmsOf(Float32Array.from([0.5, -0.5, 0.5, -0.5])) - 0.5) < 1e-9);
});

t("recording stops once something has been said and it goes quiet, or at the time limit, never before anything is said", () => {
  const e = createEndpointer({ silenceMs: 1000, maxMs: 6000, threshold: 0.02 });
  for (let i = 0; i < 4; i += 1) assert.equal(e.feed(0.001, 250), "continue", "waiting for the person to start");
  assert.equal(e.heard, false);
  assert.equal(e.feed(0.2, 250), "continue");
  assert.equal(e.heard, true);
  assert.equal(e.feed(0.001, 500), "continue");
  assert.equal(e.feed(0.001, 500), "stop", "a second of quiet after speaking");
  const long = createEndpointer({ silenceMs: 1000, maxMs: 2000, threshold: 0.02 });
  assert.equal(long.feed(0.2, 1000), "continue");
  assert.equal(long.feed(0.2, 1000), "stop", "the time limit");
  const resumed = createEndpointer({ silenceMs: 1000, maxMs: 9000, threshold: 0.02 });
  resumed.feed(0.2, 200); resumed.feed(0.001, 600);
  assert.equal(resumed.feed(0.2, 200), "continue", "a pause in the middle of a sentence resets the quiet");
  assert.equal(resumed.feed(0.001, 600), "continue");
});

console.log(`\n${n} passed`);
