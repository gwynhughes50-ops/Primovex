// Plain-English reasons for a local thermometer not answering, and what to try. Pure, so it can be tested.

// The raw message from the desktop side (a network library's wording) in words a practice can act on.
export function describeShellyError(raw, config = {}) {
  const text = String(raw?.message || raw || "").toLowerCase();
  const where = config.ip ? ` at ${config.ip}` : "";
  if (/timed out|timeout|deadline/.test(text)) {
    return config.wakeOnly
      ? `No answer${where}. A battery sensor is asleep between reports, so this is normal unless it has not reported for hours.`
      : `No answer${where} within 5 seconds. It is switched off, out of WiFi range, or the address has changed.`;
  }
  if (/refused|actively refused/.test(text)) return `The device${where} refused the connection. Check it is a Shelly and that its address is right.`;
  if (/unreachable|no route|network is down|dns|lookup|resolve/.test(text)) return `This PC cannot reach${where}. Is it on the same WiFi as the thermometer?`;
  if (/error sending request/.test(text)) return `Could not reach${where}. It is off, out of range, on a different network, or its address has changed.`;
  if (/status 401|status 403/.test(text)) return `The thermometer${where} asked for a password. Turn off its local password, or ask for support.`;
  if (/status 404/.test(text)) return `${config.ip || "That address"} answered but is not a Shelly (or is an older model with a different interface).`;
  if (/did not include a temperature/.test(text)) return `The device${where} answered but sent no temperature. It may not be a thermometer, or the add-on is not connected.`;
  return String(raw?.message || raw || "Could not read this thermometer.");
}

const agoText = (ms) => {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

// One thermometer's story for the Connect page.
//   entry: { lastAttemptAt, lastOkAt, lastError, lastWakeAt } from this PC's own record (empty before anything has run)
export function summariseThermometer(entry = {}, config = {}, now = Date.now()) {
  const lines = [];
  if (entry.lastOkAt) lines.push({ tone: "ok", text: `Last answered ${agoText(now - entry.lastOkAt)}.` });
  if (entry.lastError && (!entry.lastOkAt || entry.lastAttemptAt >= entry.lastOkAt)) {
    lines.push({ tone: "bad", text: `${entry.lastAttemptAt ? `Last try ${agoText(now - entry.lastAttemptAt)}: ` : ""}${entry.lastError}` });
  }
  if (config.wakeOnly) {
    lines.push(entry.lastWakeAt
      ? { tone: "ok", text: `Last woke and reported ${agoText(now - entry.lastWakeAt)}.` }
      : { tone: "warn", text: "This PC has not heard it wake since Primovex was opened. Check the webhook in the Shelly app points here." });
  }
  if (!entry.lastAttemptAt && !entry.lastWakeAt && !config.wakeOnly) lines.push({ tone: "warn", text: "Not tried yet since Primovex was opened." });
  return lines;
}

// A wake ping from an address no thermometer is set up with: the usual cause of a sensor that wakes but never shows.
export function unmatchedWakeHint(pings = [], configs = []) {
  const known = new Set(configs.map((c) => c.ip));
  const stray = pings.filter((p) => !known.has(p.ip));
  if (!stray.length) return "";
  const ips = [...new Set(stray.map((p) => p.ip))];
  return `A device at ${ips.join(", ")} woke and called this PC, but no thermometer is set up with that address. If that is your sensor, its address has changed: remove and add it again with the new one.`;
}
