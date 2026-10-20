// Adding many compliance assets at once from a list (a spreadsheet pasted in, or a CSV file): every fire point, water
// outlet and so on in a building, instead of one at a time. Pure: it turns the text into a plan, row by row, saying
// what each row will become, the code it will get, and what is wrong with it. Nothing is created until the person
// has looked at the plan. The screen is components/compliance/AssetImportPanel.jsx.

import { COMPLIANCE_ASSET_TYPES, buildAssetPatch, generateNextAssetCode, getAssetTypeConfig } from "./complianceRules.js";

const squash = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---- reading the text ----

// A table from pasted text (tabs, from a spreadsheet) or a CSV (commas), with quoted fields and doubled quotes.
export function parseTable(text) {
  const source = String(text ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = source.split("\n").find((line) => line.trim()) || "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; } else if (char === '"') quoted = false; else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; } else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else field += char;
  }
  row.push(field);
  rows.push(row);
  return rows.map((r) => r.map((cell) => cell.trim())).filter((r) => r.some((cell) => cell !== ""));
}

const HEADERS = {
  type: ["type", "asset type", "kind", "what is it", "item"],
  label: ["name", "label", "description", "asset", "asset name"],
  location: ["location", "room", "place", "where"],
  frequency: ["frequency", "how often", "check frequency", "checked"],
  minTempC: ["lowest", "lowest c", "lowest safe c", "min", "min c", "minimum", "minimum c", "lowest temp"],
  maxTempC: ["highest", "highest c", "highest safe c", "max", "max c", "maximum", "maximum c", "highest temp"],
};

// which column each field is in, by its heading (any case, with or without the degree sign)
export function mapHeaders(headerRow = []) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const name = squash(cell).replace(/\bdegrees?\b/g, "").replace(/\s+/g, " ").trim();
    for (const [field, names] of Object.entries(HEADERS)) if (map[field] === undefined && names.includes(name)) map[field] = index;
  });
  return map;
}

// ---- what a row means ----

const TYPE_WORDS = [
  ["fire_point", ["fire point", "fire points", "call point", "fire call point", "manual call point", "fire alarm point", "mcp", "break glass"]],
  ["fire_door", ["fire door", "fire doors"]],
  ["fire_extinguisher", ["fire extinguisher", "extinguisher"]],
  ["fire_emergency_light", ["emergency light", "emergency lighting", "emergency lights"]],
  ["fire_alarm_panel", ["fire alarm panel", "alarm panel", "fire panel"]],
  ["fire_drill", ["fire drill", "drill"]],
  ["water_tmv", ["tmv", "thermostatic mixing valve", "mixing valve"]],
  ["water_flush", ["shower", "showers", "little used outlet", "flush", "flushing"]],
  ["water_hot", ["hot", "hot water", "hot tap", "hot outlet", "hot water outlet", "calorifier"]],
  ["water_cold", ["cold", "cold water", "cold tap", "cold outlet", "cold water outlet", "cold water tank", "cold tank"]],
  ["freezer", ["freezer"]],
  ["fridge", ["fridge", "refrigerator"]],
  ["aed", ["aed", "defibrillator", "defib"]],
  ["emergency_equipment", ["emergency equipment", "emergency kit", "emergency bag"]],
  ["general", ["general", "general asset", "other"]],
];

// an asset type from what was written ("Fire Point", "fire_point", "call point", "hot tap"), or "" when it is not recognised
export function matchAssetType(text) {
  const wanted = squash(text);
  if (!wanted) return "";
  const direct = COMPLIANCE_ASSET_TYPES.find((t) => squash(t.key) === wanted || squash(t.label) === wanted);
  if (direct) return direct.key;
  for (const [key, words] of TYPE_WORDS) if (words.includes(wanted)) return key;
  // a looser match: a type word inside what was written ("ground floor hot tap"), most specific first
  for (const [key, words] of TYPE_WORDS) if (words.some((w) => w.length > 3 && ` ${wanted} `.includes(` ${w} `))) return key;
  return "";
}

const FREQUENCY_WORDS = [
  ["daily", ["daily", "every day", "day", "each day"]],
  ["weekly", ["weekly", "every week", "week", "each week", "1 weekly"]],
  ["monthly", ["monthly", "every month", "month", "each month", "1 monthly"]],
  ["quarterly", ["quarterly", "every 3 months", "3 monthly", "three monthly", "every three months", "3 months"]],
  ["sixmonthly", ["six monthly", "6 monthly", "every 6 months", "every six months", "half yearly", "6 months", "sixmonthly", "biannual"]],
  ["annually", ["annually", "annual", "yearly", "every year", "12 monthly", "every 12 months", "year"]],
];

// a frequency key from words, "" if none was given, null if it was given but not understood
export function matchFrequency(text) {
  const wanted = squash(text);
  if (!wanted) return "";
  for (const [key, words] of FREQUENCY_WORDS) if (words.includes(wanted) || key === wanted) return key;
  return null;
}

const toNumber = (text) => {
  const clean = String(text ?? "").trim().replace(",", ".").replace("−", "-").replace(/\s*°?\s*c$/i, "");
  if (clean === "") return null;
  return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : NaN;
};

const typeLabel = (key) => getAssetTypeConfig(key).label;
const sameThing = (a, b) => squash(a) === squash(b);

// A starting list to fill in or adapt: the headings the importer reads, with a few example rows.
export const TEMPLATE_TEXT = [
  "Type\tName\tLocation\tFrequency\tLowest °C\tHighest °C",
  "Fire point\tFire point 2, entrance\tEntrance\t\t\t",
  "Hot water outlet\tStaff kitchen hot tap\tStaff kitchen\t\t\t",
  "Cold water outlet\tStaff kitchen cold tap\tStaff kitchen\t\t\t",
  "Fire extinguisher\tCO2 extinguisher by reception\tReception\tMonthly\t\t",
].join("\n");

// ---- the plan ----

// text: the pasted list. existing: the assets already there (retired ones are ignored). rooms: the rooms of the site these go
// in (empty when none are set up, then a place is typed). overrides: { [line]: room } chosen on the plan for rows whose room was not
// recognised. Returns { rows, problems, counts }; a row's status is "ok", "exists" (already there, skipped) or "problem".
export function buildImportPlan({ text, existing = [], rooms = [], overrides = {} } = {}) {
  const table = parseTable(text);
  if (!table.length) return { rows: [], problems: ["Paste the list, or choose a file."], counts: { ok: 0, exists: 0, problem: 0 } };
  const columns = mapHeaders(table[0]);
  const hasHeader = columns.type !== undefined || columns.label !== undefined || columns.location !== undefined;
  if (!hasHeader) return { rows: [], problems: ["The first row should be the headings: Type, Name, Location (and, if you want them, Frequency, Lowest °C, Highest °C)."], counts: { ok: 0, exists: 0, problem: 0 } };
  if (columns.type === undefined) return { rows: [], problems: ["There needs to be a Type column, saying what each one is (for example Fire point, Hot water outlet)."], counts: { ok: 0, exists: 0, problem: 0 } };

  const live = existing.filter((a) => a && a.active !== false);
  // new codes carry on after every code ever used, a retired asset's included, so a code never means two assets
  const pool = existing.filter(Boolean).map((a) => ({ assetCode: a.assetCode, assetType: a.assetType }));
  const seen = [];
  const cell = (row, field) => (columns[field] === undefined ? "" : row[columns[field]] ?? "");
  const rows = [];

  table.slice(1).forEach((raw, index) => {
    const line = index + 2; // as the person sees it: the heading is line 1
    const problems = [];
    const typeText = cell(raw, "type");
    const assetType = matchAssetType(typeText);
    if (!assetType) problems.push(typeText ? `"${typeText}" is not a type Primovex knows. Use Fire point, Fire door, Hot water outlet, Cold water outlet, TMV, Shower, Fridge and so on.` : "Say what type it is.");
    const config = getAssetTypeConfig(assetType || "general");

    // the room: matched to the site's rooms, or chosen on the plan; typed only when the site has no rooms set up
    const written = String(overrides[line] ?? cell(raw, "location")).trim();
    let location = written;
    if (rooms.length) {
      const match = rooms.find((room) => sameThing(room, written));
      location = match || "";
      if (!match) problems.push(written ? `"${written}" is not one of the site's rooms. Choose the room.` : "Choose the room.");
    } else if (!written) problems.push("Say where it is.");

    const frequencyText = cell(raw, "frequency");
    const frequency = matchFrequency(frequencyText);
    if (frequency === null) problems.push(`"${frequencyText}" is not a frequency Primovex knows. Use Daily, Weekly, Monthly, Every 3 months, Every 6 months or Yearly.`);

    const minRaw = toNumber(cell(raw, "minTempC"));
    const maxRaw = toNumber(cell(raw, "maxTempC"));
    if (Number.isNaN(minRaw) || Number.isNaN(maxRaw)) problems.push("The lowest and highest temperatures must be numbers.");
    const isTemperature = config.checkMode === "temperature";
    const minTempC = isTemperature ? (minRaw ?? config.minTempC ?? null) : null;
    const maxTempC = isTemperature ? (maxRaw ?? config.maxTempC ?? null) : null;
    if (!isTemperature && (cell(raw, "minTempC") || cell(raw, "maxTempC"))) problems.push(`${config.label} is not a temperature check, so it has no lowest or highest temperature.`);

    const label = (cell(raw, "label") || [location || written, assetType ? config.label : ""].filter(Boolean).join(" ")).replace(/\s+/g, " ").trim().slice(0, 120);
    const chosenFrequency = assetType === "fire_point" ? "weekly" : frequency || config.defaultFrequency;

    if (assetType && !problems.length) {
      const patch = buildAssetPatch({ label, location, frequency: chosenFrequency, minTempC, maxTempC, countdownSeconds: "" }, assetType);
      if (patch.problems.length) problems.push(...patch.problems);
    }

    const duplicate = assetType && !problems.length && [...live, ...seen].some((a) => a.assetType === assetType && sameThing(a.label, label) && sameThing(a.location, location));
    const status = problems.length ? "problem" : duplicate ? "exists" : "ok";
    const row = { line, assetType, typeLabel: assetType ? typeLabel(assetType) : typeText, label, location, written, frequency: chosenFrequency, minTempC, maxTempC, status, problems, code: "" };
    if (status === "ok") {
      row.code = generateNextAssetCode(assetType, pool);
      pool.push({ assetCode: row.code, assetType });
      seen.push({ assetType, label, location });
    }
    rows.push(row);
  });

  const counts = { ok: rows.filter((r) => r.status === "ok").length, exists: rows.filter((r) => r.status === "exists").length, problem: rows.filter((r) => r.status === "problem").length };
  return { rows, problems: rows.length ? [] : ["There are no rows under the headings."], counts };
}
