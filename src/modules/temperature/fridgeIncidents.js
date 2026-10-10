// What the person alerted about an out-of-range fridge can do: quarantine it, record what happened to the
// stock, and clear it once a recheck is back in range. Pure, so it can be tested; the screen is
// components/temperature/FridgeIncidentSheet.jsx. (Only people who can resolve incidents may do any of this:
// firestore.rules say so too.)

export const ALERT_ROLES_DEFAULT = ["Practice Manager"];

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const num = (value) => (value === "" || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));
const clock = (date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const isOpen = (incident) => String(incident?.status || "open") === "open";
// A quarantined fridge: stock in it is not to be used until it is cleared.
export const isQuarantined = (incident) => isOpen(incident) && incident?.quarantined === true;
export const quarantinedUnitIds = (incidents = []) => incidents.filter(isQuarantined).map((incident) => incident.unitId);

export function quarantinePatch({ actor }) {
  return { quarantined: true, quarantinedBy: actor.displayName || actor.email || "Unknown", quarantinedByUid: actor.uid || null };
}

// What happened to the stock: ticked, with how many if known. The wording is made here, not typed.
export function stockPatch(incident, { moved = false, discarded = false, movedUnits = null, discardedUnits = null, actor }) {
  const movedN = num(movedUnits);
  const discardedN = num(discardedUnits);
  const parts = [];
  if (moved) parts.push(`${movedN ? `${plural(movedN, "unit")} of stock` : "Stock"} moved to another fridge`);
  if (discarded) parts.push(`${discardedN ? `${plural(discardedN, "unit")} of stock` : "Stock"} discarded`);
  return {
    affectedStock: {
      ...(incident?.affectedStock || {}),
      movedToBackupUnit: Boolean(moved) || Boolean(incident?.affectedStock?.movedToBackupUnit),
      discarded: Boolean(discarded) || Boolean(incident?.affectedStock?.discarded),
      stockNotes: parts.join("; "),
      ...(movedN ? { unitsMoved: movedN } : {}),
      ...(discardedN ? { unitsDiscarded: discardedN } : {}),
    },
    stockRecordedBy: actor.displayName || actor.email || "Unknown",
  };
}

// Readings recorded for this fridge after the incident was opened, newest first.
export function recheckReadings(incident, logs = []) {
  const opened = toDate(incident?.openedAt)?.getTime() ?? 0;
  return logs
    .filter((log) => (!incident?.unitId || log.unitId === incident.unitId) && (toDate(log.measured_at || log.created_at)?.getTime() ?? 0) > opened)
    .sort((a, b) => (toDate(b.measured_at || b.created_at)?.getTime() ?? 0) - (toDate(a.measured_at || a.created_at)?.getTime() ?? 0));
}

const inRange = (log, range) => {
  if (log.outOfRange === true) return false;
  const temp = num(log.temp);
  if (temp === null || !range) return log.outOfRange === false;
  return temp >= range.min && temp <= range.max && (num(log.minTemp) === null || num(log.minTemp) >= range.min) && (num(log.maxTemp) === null || num(log.maxTemp) <= range.max);
};

// Why the fridge can't be cleared yet, or "" if it can: a fridge only returns to use after a check
// recorded since the incident that is back in range.
export function clearBlockedReason(incident, logs = [], range = null) {
  if (!isOpen(incident)) return "This incident is already cleared.";
  const rechecks = recheckReadings(incident, logs);
  if (!rechecks.length) return "It can only be cleared after a recheck. Scan the fridge and record a check that is back in range.";
  const latest = rechecks[0];
  if (!inRange(latest, range || incident?.expectedRange || null)) return `The latest recheck (${latest.temp}°C) is still out of range, so it can't be cleared yet.`;
  return "";
}

export function clearPatch(incident, logs, { actor, now = new Date() } = {}) {
  const latest = recheckReadings(incident, logs)[0];
  return {
    status: "resolved",
    quarantined: false,
    resolvedBy: actor.displayName || actor.email || "Unknown",
    resolvedByUid: actor.uid || null,
    resolutionNotes: `Recheck ${latest ? `${latest.temp}°C` : ""} in range${latest ? ` (recorded by ${latest.recordedBy || "a colleague"})` : ""}. Cleared by ${actor.displayName || actor.email || "Unknown"} at ${clock(now)}.`.replace("Recheck  in", "Recheck in"),
  };
}

// A short line for a list or the sheet header.
export function incidentStatusLabel(incident) {
  if (!isOpen(incident)) return "Cleared";
  return incident?.quarantined ? "Quarantined" : "Open";
}
