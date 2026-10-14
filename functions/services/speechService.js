// Turning a short spoken question into words, for people whose phone's browser has no speech recognition of its own (the
// iPhone Home Screen app). The phone sends one short WAV recording (16 kHz, mono); it is passed to Google Cloud
// Speech-to-Text through its EU endpoint and the words come back. The audio is not stored by Primovex and is not kept in any
// log: it exists only for that one request. The words are treated exactly as if the person had typed them.

const MAX_SECONDS = 20;
const SAMPLE_RATE = 16000;
const MIN_BYTES = 44 + SAMPLE_RATE * 2 * 0.3; // under a third of a second is not a question
const MAX_BYTES = 44 + SAMPLE_RATE * 2 * MAX_SECONDS;
const HOURLY_LIMIT = 60;
const DAILY_LIMIT = 400;

// The recording, checked: a real 16 kHz mono 16-bit WAV of a sensible length. Returns the decoded bytes' facts or an error in words.
function checkRecording(base64) {
  if (typeof base64 !== "string" || !base64) return { ok: false, error: "There was no recording." };
  if (base64.length > Math.ceil(MAX_BYTES * 4 / 3) + 8) return { ok: false, error: "That recording is too long. Keep it to a sentence or two." };
  let bytes;
  try { bytes = Buffer.from(base64, "base64"); } catch { return { ok: false, error: "The recording could not be read." }; }
  if (bytes.length < MIN_BYTES) return { ok: false, error: "That was too short to make out. Try again." };
  if (bytes.length > MAX_BYTES) return { ok: false, error: "That recording is too long. Keep it to a sentence or two." };
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return { ok: false, error: "The recording was not in the expected format." };
  const channels = bytes.readUInt16LE(22);
  const rate = bytes.readUInt32LE(24);
  const bits = bytes.readUInt16LE(34);
  if (channels !== 1 || rate !== SAMPLE_RATE || bits !== 16) return { ok: false, error: "The recording was not in the expected format." };
  return { ok: true, bytes: bytes.length, seconds: (bytes.length - 44) / (SAMPLE_RATE * 2) };
}

// words that help the service with names it would otherwise mishear (the practice's own stock names): a few, short, plain
function cleanPhrases(phrases) {
  return (Array.isArray(phrases) ? phrases : [])
    .map((p) => String(p ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 100);
}

// client: a Speech-to-Text client (SpeechClient). Returns { text, confidence }.
async function transcribe({ client, base64, phrases = [] }) {
  const request = (withModel) => ({
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: SAMPLE_RATE,
      languageCode: "en-GB",
      ...(withModel ? { model: "latest_short" } : {}),
      enableAutomaticPunctuation: true,
      maxAlternatives: 1,
      ...(cleanPhrases(phrases).length ? { speechContexts: [{ phrases: cleanPhrases(phrases), boost: 12 }] } : {}),
    },
    audio: { content: base64 },
  });
  let response;
  try {
    [response] = await client.recognize(request(true));
  } catch (error) {
    // an older endpoint may not know the short-speech model: try again with the default
    if (!/model|invalid/i.test(String(error?.message))) throw error;
    [response] = await client.recognize(request(false));
  }
  const alternatives = (response?.results || []).map((r) => r.alternatives?.[0]).filter(Boolean);
  const text = alternatives.map((a) => String(a.transcript || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 500);
  const confidence = alternatives.length ? alternatives.reduce((n, a) => n + (Number(a.confidence) || 0), 0) / alternatives.length : 0;
  return { text, confidence: Math.round(confidence * 100) / 100 };
}

module.exports = { checkRecording, cleanPhrases, transcribe, HOURLY_LIMIT, DAILY_LIMIT, MAX_SECONDS, SAMPLE_RATE };
