// The manual fridge check: someone scans the fridge's tag (NFC or QR), reads the thermometer attached to it
// (current, minimum and maximum), presses its reset button, and the phone records it with who and when.
// Pure, so it can be tested; the screen is MobileFridgeCheckSheet.jsx.

const FRIDGE_WORDS = /fridge|freezer|refrigerat|cold.?chain/i;
export const DEFAULT_RANGES = { fridge: { min: 2, max: 8 }, freezer: { min: -25, max: -15 } };
const finite = (value) => (value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);
const norm = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// A piece of equipment that is a fridge or freezer (so a printer or an ultrasound isn't treated as one).
export function isFridgeAsset(asset) {
  if (!asset) return false;
  if (asset.monitoring?.fridgeId) return true;
  return [asset.category, asset.equipmentType, asset.type, asset.name].some((value) => FRIDGE_WORDS.test(String(value || "")));
}

export const unitTypeOf = (asset) => (/freezer/i.test(`${asset?.name || ""} ${asset?.category || ""} ${asset?.equipmentType || ""}`) ? "freezer" : "fridge");

// The temperature unit (the Temperature page's own list) this fridge is: by its id, then by its name.
export function resolveUnit(asset, units = []) {
  if (!asset) return null;
  const id = asset.monitoring?.fridgeId || asset.id;
  return units.find((unit) => unit.id === id) || units.find((unit) => norm(unit.name) && norm(unit.name) === norm(asset.name)) || null;
}

// The safe range: the unit's own, then the fridge's, then the usual for its kind.
export function rangeFor(asset, unit) {
  const fallback = DEFAULT_RANGES[unit?.type === "freezer" || unitTypeOf(asset) === "freezer" ? "freezer" : "fridge"];
  const pick = (source) => (source && finite(source.min) !== null && finite(source.max) !== null ? { min: Number(source.min), max: Number(source.max) } : null);
  return pick(unit?.range) || pick(asset?.monitoring) || fallback;
}

// What a person types from the thermometer: "4.5", "4,5", "-18", "−18" -> a number, or null.
export function parseTemp(text) {
  const clean = String(text ?? "").trim().replace(",", ".").replace("−", "-");
  if (!/^-?\d{1,2}(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return value >= -60 && value <= 60 ? value : null;
}

// The three thermometer readings against the safe range.
//   errors:    things that can't be right (a missing number, min above max, current outside min and max)
//   reasons:   why it is out of range, if it is
export function checkReadings({ current, min, max }, range) {
  const errors = [];
  if ([current, min, max].some((v) => v === null || v === undefined || Number.isNaN(v))) return { errors: ["Enter all three readings."], reasons: [], outOfRange: false };
  if (min > max) errors.push("The minimum can't be higher than the maximum.");
  else if (current < min || current > max) errors.push("The current reading should be between the minimum and the maximum.");
  const reasons = [];
  if (!errors.length) {
    if (current < range.min || current > range.max) reasons.push(`Right now it is ${current}°C`);
    if (min < range.min && min !== current) reasons.push(`It dropped to ${min}°C`);
    if (max > range.max && max !== current) reasons.push(`It rose to ${max}°C`);
  }
  return { errors, reasons, outOfRange: reasons.length > 0 };
}

// What was done about an out-of-range reading: ticked, not typed.
export const ACTIONS = [
  { key: "door", label: "Checked the door was closed" },
  { key: "moved", label: "Moved the stock to another fridge" },
  { key: "quarantined", label: "Put the stock aside, not to be used" },
  { key: "engineer", label: "Called the engineer" },
  { key: "told", label: "Told the Practice Manager" },
];

const pad = (n) => String(n).padStart(2, "0");
export const dateKeyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const slotOf = (date) => (date.getHours() < 12 ? "AM" : "PM");

// The reading as the Temperature page stores it (the same fields its own form writes), plus the min, max and reset.
export function buildReadingDoc({ asset, unit, range, readings, actor, now = new Date(), checked }) {
  const unitId = unit?.id || asset.monitoring?.fridgeId || asset.id;
  return {
    measured_at: now,
    temp: readings.current,
    minTemp: readings.min,
    maxTemp: readings.max,
    resetDone: Boolean(checked?.reset),
    outOfRange: Boolean(checked?.outOfRange),
    recordedBy: actor.displayName || actor.email || "Unknown",
    recordedByUid: actor.uid || null,
    notes: "",
    siteId: unit?.siteId || "",
    siteName: unit?.siteName || "",
    unitId,
    unitName: unit?.name || asset.name,
    unitType: unit?.type || unitTypeOf(asset),
    unitRange: range,
    assetId: asset.id,
    dateKey: dateKeyOf(now),
    slot: slotOf(now),
    source: "manual-mobile",
  };
}

// An out-of-range reading opens an incident, in the shape the Temperature page's own incidents have.
export function buildIncidentDoc({ asset, unit, range, readings, reasons, actionKeys = [], actor }) {
  const unitName = unit?.name || asset.name;
  const picked = ACTIONS.filter((a) => actionKeys.includes(a.key));
  return {
    unitId: unit?.id || asset.monitoring?.fridgeId || asset.id,
    unitName,
    unitType: unit?.type || unitTypeOf(asset),
    siteId: unit?.siteId || "",
    expectedRange: range,
    observedTemp: readings.current,
    observedMin: readings.min,
    observedMax: readings.max,
    summary: `${unitName} out of range (${readings.min}°C to ${readings.max}°C)`,
    details: reasons.join(". "),
    actionsTaken: picked.map((a) => a.label).join("; "),
    affectedStock: { quarantined: actionKeys.includes("quarantined"), discarded: false, movedToBackupUnit: actionKeys.includes("moved"), stockNotes: "" },
    status: "open",
    openedBy: actor.displayName || actor.email || "Unknown",
    openedByUid: actor.uid || null,
    source: "mobile-check",
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: "",
  };
}

// Is a check due: a weekday afternoon onwards. (A practice closed at the weekend isn't nagged.)
export function isCheckTime(now = new Date(), afterHour = 12) {
  const day = now.getDay();
  return day >= 1 && day <= 5 && now.getHours() >= afterHour;
}

// fridges: [{ id, name }]; logs: temperature_logs rows (unitId, dateKey). The fridges with no reading today.
export function notCheckedToday({ fridges = [], logs = [], now = new Date(), afterHour = 12 } = {}) {
  if (!isCheckTime(now, afterHour)) return [];
  const today = dateKeyOf(now);
  const done = new Set(logs.filter((log) => (log.dateKey || "") === today).map((log) => log.unitId));
  return fridges.filter((fridge) => !done.has(fridge.id));
}

// The fridges to expect a check for: the Temperature page's active units, plus any fridge or freezer
// equipment that isn't one of those units yet (matched by id or name).
export function expectedFridges({ units = [], assets = [] } = {}) {
  const list = units.filter((unit) => unit.active !== false).map((unit) => ({ id: unit.id, name: unit.name }));
  for (const asset of assets.filter(isFridgeAsset)) {
    if (resolveUnit(asset, units)) continue;
    list.push({ id: asset.monitoring?.fridgeId || asset.id, name: asset.name });
  }
  return list;
}

// A document from the Temperature page's own list of units, as one object (the same reading of it the desktop uses).
export function normaliseUnit(id, data = {}) {
  const rawType = String(data.unitType || data.type || "fridge");
  const type = /freezer/i.test(rawType) ? "freezer" : "fridge";
  const fallback = /40/.test(rawType) ? { min: -45, max: -35 } : DEFAULT_RANGES[type];
  const rangeMin = finite(data.rangeMin);
  const rangeMax = finite(data.rangeMax);
  return {
    id,
    name: data.unitName ?? data.name ?? id,
    siteId: data.site ?? data.siteId ?? "",
    siteName: data.siteName || "",
    type,
    rawType,
    active: data.active !== false,
    range: rangeMin !== null && rangeMax !== null ? { min: rangeMin, max: rangeMax } : fallback,
  };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const names = (list, max = 5) => `${list.slice(0, max).map((f) => f.name).join(", ")}${list.length > max ? ` and ${list.length - max} more` : ""}`;

// "Which fridges haven't been checked today?": fridges are [{ id, name }], logs the day's temperature_logs,
// incidents the open temperature_incidents.
export function fridgeChecksAnswer({ fridges = [], logs = [], incidents = [], now = new Date() } = {}) {
  if (!fridges.length) return { text: "No fridges or freezers are set up to be checked yet.", unchecked: 0 };
  const today = dateKeyOf(now);
  const done = new Set(logs.filter((log) => (log.dateKey || "") === today).map((log) => log.unitId));
  const missing = fridges.filter((fridge) => !done.has(fridge.id));
  const lines = [missing.length
    ? `${fridges.length - missing.length} of ${plural(fridges.length, "fridge")} checked today. Not checked yet: ${names(missing)}.`
    : `All ${plural(fridges.length, "fridge")} ${fridges.length === 1 ? "has" : "have"} been checked today.`];
  const open = incidents.filter((incident) => String(incident.status || "open") === "open");
  if (open.length) lines.push(`${plural(open.length, "fridge incident")} open: ${names(open.map((i) => ({ name: i.unitName || "a fridge" })))}.`);
  return { text: lines.join("\n"), unchecked: missing.length, openIncidents: open.length };
}
