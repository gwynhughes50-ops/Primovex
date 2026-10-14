// Recording a short spoken question in the browser as 16 kHz mono WAV, for turning into words on the server. Used where the browser
// has no speech recognition of its own (the iPhone Home Screen app). The audio is held in memory only and sent for that one request.

export const TARGET_RATE = 16000;

// Average a block of samples down to a lower rate (a simple box filter, enough for speech)
export function downsample(samples, inRate, outRate = TARGET_RATE) {
  if (outRate >= inRate) return samples;
  const ratio = inRate / outRate;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += samples[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export function floatTo16BitPCM(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// A WAV file (16-bit PCM, mono) as bytes
export function encodeWav(pcm, sampleRate = TARGET_RATE) {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i += 1) view.setInt16(44 + i * 2, pcm[i], true);
  return new Uint8Array(buffer);
}

export function toBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export const rmsOf = (samples) => {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
};

// When to stop on its own: once something has been said and it then goes quiet for `silenceMs`, or at `maxMs`.
// Returns a small decider fed with the loudness of each block.
export function createEndpointer({ silenceMs = 1400, maxMs = 15000, threshold = 0.018 } = {}) {
  let elapsed = 0;
  let heard = false;
  let quietFor = 0;
  return {
    // blockMs: how long this block of audio lasts; rms: how loud it was. Returns "continue" | "stop".
    feed(rms, blockMs) {
      elapsed += blockMs;
      if (rms >= threshold) { heard = true; quietFor = 0; } else if (heard) quietFor += blockMs;
      if (elapsed >= maxMs) return "stop";
      if (heard && quietFor >= silenceMs) return "stop";
      return "continue";
    },
    get heard() { return heard; },
    get elapsed() { return elapsed; },
  };
}

// Start recording. Resolves to { stop, cancel }: stop() gives { base64, durationMs, heard }, cancel() drops it.
// onAutoStop() is called when the person stops talking (or the time limit), so the screen can finish up.
export async function startRecording({ onAutoStop, onLevel } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This phone can't record. Type your question instead.");
  // The audio context is made straight away, before waiting for the microphone: an iPhone only lets sound start from the
  // tap itself, not from something that happens after a permission question.
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  const resuming = context.state === "suspended" ? context.resume() : Promise.resolve();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch {
    context.close?.().catch?.(() => {});
    throw new Error("Primovex can't use the microphone. Allow it in your phone's Settings, or type your question.");
  }
  await resuming.catch(() => {});
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  const endpointer = createEndpointer();
  let finished = false;

  processor.onaudioprocess = (event) => {
    if (finished) return;
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    const rms = rmsOf(input);
    onLevel?.(rms);
    if (endpointer.feed(rms, (input.length / context.sampleRate) * 1000) === "stop") {
      finished = true;
      onAutoStop?.();
    }
  };
  // the node must be connected onward for the browser to run it; the output is silent
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);

  const release = () => {
    try { processor.disconnect(); source.disconnect(); mute.disconnect(); } catch { /* already closed */ }
    stream.getTracks().forEach((track) => track.stop());
    context.close?.().catch?.(() => {});
  };

  return {
    stop() {
      finished = true;
      const rate = context.sampleRate;
      release();
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const joined = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) { joined.set(c, offset); offset += c.length; }
      const pcm = floatTo16BitPCM(downsample(joined, rate));
      return { base64: toBase64(encodeWav(pcm)), durationMs: Math.round((total / rate) * 1000), heard: endpointer.heard };
    },
    cancel() { finished = true; release(); },
  };
}
