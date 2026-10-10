// Setting up the practice's fridges: each one's name, site and the range it must stay in (2 to 8 °C for a
// fridge), and which roles are alerted when a reading is outside it. Pure, so it can be tested; the screen is
// components/temperature/FridgeSetup.jsx.

export const UNIT_TYPES = [
  { key: "fridge", label: "Fridge", min: 2, max: 8 },
  { key: "freezer20", label: "Freezer (-20 °C)", min: -25, max: -15 },
  { key: "freezer40", label: "Freezer (-40 °C)", min: -45, max: -35 },
];

const finite = (value) => (value === "" || value === null || value === undefined || !Number.isFinite(Number(String(value).replace(",", "."))) ? null : Number(String(value).replace(",", ".")));

export const emptyForm = (siteId = "") => ({ id: "", name: "", siteId, type: "fridge", min: "2", max: "8", active: true });

export function formFromUnit(unit) {
  const type = UNIT_TYPES.find((t) => t.key === unit.rawType)?.key || (unit.type === "freezer" ? "freezer20" : "fridge");
  return { id: unit.id, name: unit.name || "", siteId: unit.siteId || "", type, min: String(unit.range?.min ?? ""), max: String(unit.range?.max ?? ""), active: unit.active !== false };
}

// Changing the kind of fridge offers the usual range for it; a range typed by hand is kept if the type is unchanged.
export function withType(form, type) {
  const preset = UNIT_TYPES.find((t) => t.key === type);
  return preset ? { ...form, type, min: String(preset.min), max: String(preset.max) } : { ...form, type };
}

// The problem with a form, or "".
export function validateUnit(form, existing = []) {
  const name = String(form.name || "").trim();
  if (!name) return "Give the fridge a name.";
  if (!String(form.siteId || "").trim()) return "Choose which site it is at.";
  const min = finite(form.min);
  const max = finite(form.max);
  if (min === null || max === null) return "Enter the lowest and highest safe temperature.";
  if (min < -60 || max > 60) return "Those temperatures don't look right.";
  if (min >= max) return "The lowest safe temperature must be below the highest.";
  const clash = existing.find((unit) => unit.id !== form.id && String(unit.name || "").trim().toLowerCase() === name.toLowerCase() && (unit.siteId || "") === form.siteId);
  if (clash) return "There is already a fridge with that name at this site.";
  return "";
}

// What is stored, in the shape the Temperature page reads (unitName, unitType, site, rangeMin, rangeMax).
export function buildUnitDoc(form, { sites = [] } = {}) {
  const site = sites.find((s) => s.id === form.siteId);
  return {
    unitName: String(form.name).trim(),
    unitType: form.type,
    site: form.siteId,
    siteName: site?.name || "",
    rangeMin: finite(form.min),
    rangeMax: finite(form.max),
    active: form.active !== false,
  };
}

// Who may set fridges up: admins and the Practice Manager (practiceAdmin.write), and any role ticked for fridge
// alerts (the nurse lead). The database rules say the same.
export function canSetUpFridges({ role = "", capabilities = [], isAdmin = false, alertRoles = [] } = {}) {
  if (isAdmin || capabilities.includes("*") || capabilities.includes("practiceAdmin.write")) return true;
  return Boolean(role) && alertRoles.includes(role);
}

// Who may choose which roles are alerted: admins and the Practice Manager only (not the people being ticked).
export const canChooseAlertRoles = ({ capabilities = [], isAdmin = false } = {}) => isAdmin || capabilities.includes("*") || capabilities.includes("practiceAdmin.write");

// The roles that can be ticked: the built-in ones that work with fridges and any custom role the practice made.
export function roleChoices({ builtIn = [], custom = [] } = {}) {
  const skip = new Set(["System Admin", "ReadOnly", "Cleaner"]);
  return [...new Set([...builtIn, ...custom.map((r) => r.name || r.id).filter(Boolean)])].filter((r) => !skip.has(r)).sort((a, b) => a.localeCompare(b));
}

// What is saved: only roles that exist, never an empty list (that falls back to the Practice Manager).
export function cleanAlertRoles(selected = [], choices = []) {
  const valid = selected.filter((role) => choices.includes(role));
  return valid.length ? valid : ["Practice Manager"];
}
