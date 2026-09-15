// Short audible confirmation tones for hands-busy workflows (e.g. a cleaner
// tapping an NFC tag while carrying supplies) where glancing at the screen
// isn't practical. Pure Web Audio, no asset files, no native permissions.
export function playBeep(count = 1) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const beepSeconds = 0.18;
    const gapSeconds = 0.12;

    for (let i = 0; i < count; i += 1) {
      const startTime = ctx.currentTime + i * (beepSeconds + gapSeconds);
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.9, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + beepSeconds);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + beepSeconds);
    }

    window.setTimeout(() => ctx.close().catch(() => {}), (count * (beepSeconds + gapSeconds) + 0.2) * 1000);
  } catch (error) {
    console.warn('Unable to play confirmation tone', error);
  }
}
