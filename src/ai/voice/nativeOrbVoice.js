const EVENT_NAME = 'primovex-orb-voice';

export function getNativeOrbVoice() {
  if (typeof window === 'undefined') return null;
  return window.PrimovexOrbVoice || null;
}

export function nativeVoiceAvailable() {
  const bridge = getNativeOrbVoice();
  try { return Boolean(bridge?.isAvailable?.()); } catch { return false; }
}

export function hasNativeMicrophonePermission() {
  const bridge = getNativeOrbVoice();
  try { return Boolean(bridge?.hasPermission?.()); } catch { return false; }
}

export function requestNativeMicrophonePermission() {
  getNativeOrbVoice()?.requestPermission?.();
}

export function startNativeListening() {
  getNativeOrbVoice()?.startListening?.();
}

export function stopNativeListening() {
  getNativeOrbVoice()?.stopListening?.();
}

export function cancelNativeListening() {
  getNativeOrbVoice()?.cancelListening?.();
}

export function subscribeNativeOrbVoice(listener) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => listener(event.detail || {});
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
