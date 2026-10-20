// Adding many appliances to the PAT register at once, from a pasted spreadsheet or a CSV. Pure: turns the text into a plan,
// row by row, saying what each row will become and what is wrong with it. Nothing is created until the plan has been looked at.
// The screen is components/compliance/PatImportPanel.jsx. Reading the table is shared with the compliance asset import.

import { parseTable } from "../../services/compliance/assetImport.js";
import { PAT_CATEGORIES } from "./pat.js";

const squash = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const same = (a, b) => squash(a) === squash(b);

const HEADERS = {
  tag: ["tag", "tag number", "asset tag", "id", "pat tag", "number", "asset number"],
  name: ["name", "description", "appliance", "item", "equipment"],
  location: ["location", "room", "place", "where"],
  category: ["category", "type", "kind", "appliance type"],
  cls: ["class", "equipment class"],
  makeModel: ["make", "model", "make model", "make and model", "make/model"],
  serialNumber: ["serial", "serial number", "serial no", "sn"],
};

export function mapHeaders(headerRow = []) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const name = squash(cell);
    for (const [field, names] of Object.entries(HEADERS)) if (map[field] === undefined && names.map(squash).includes(name)) map[field] = index;
  });
  return map;
}

const CATEGORY_WORDS = [
  ["extension", ["extension", "extension lead", "extension leads", "adaptor", "adapter", "cable reel", "multi socket", "multisocket", "four way", "six way"]],
  ["it", ["it", "computer", "desktop", "pc", "laptop", "monitor", "printer", "phone", "phone charger", "charger", "router", "ict", "it equipment", "computers and it equipment"]],
  ["clinical", ["clinical", "medical", "ecg", "couch", "examination lamp", "clinical and medical electrical", "medical electrical"]],
  ["fixed", ["fixed", "stationary", "fridge", "freezer", "microwave", "water boiler", "boiler", "dishwasher", "fixed and stationary"]],
  ["handheld", ["handheld", "hand held", "portable", "kettle", "hairdryer", "vacuum", "fan", "heater", "hand held and portable", "toaster"]],
  ["other", ["other"]],
];

// a kind of appliance from what was written ("Kettle", "extension lead", "IT"), "" when it is not given, null when it is not understood
export function matchCategory(text) {
  const wanted = squash(text);
  if (!wanted) return "";
  const direct = PAT_CATEGORIES.find((c) => squash(c.key) === wanted || squash(c.label) === wanted);
  if (direct) return direct.key;
  for (const [key, words] of CATEGORY_WORDS) if (words.map(squash).includes(wanted)) return key;
  for (const [key, words] of CATEGORY_WORDS) if (words.some((w) => squash(w).length > 3 && ` ${wanted} `.includes(` ${squash(w)} `))) return key;
  return null;
}

export const TEMPLATE_TEXT = [
  "Tag\tName\tLocation\tCategory\tClass\tMake/model\tSerial",
  "R-1\tKettle\tStaff kitchen\tHand-held and portable\tI\t\t",
  "R-2\tDesktop PC and lead\tReception\tComputers and IT equipment\tI\tDell OptiPlex\t",
  "R-3\tFour-way extension lead\tReception\tExtension leads and adaptors\tI\t\t",
].join("\n");

// text: the pasted list. existing: the appliances already on the register. rooms: the site's rooms (empty when none are set up).
// overrides: { [line]: room } chosen on the plan for rows whose room was not recognised.
export function buildPatImportPlan({ text, existing = [], rooms = [], overrides = {} } = {}) {
  const none = { ok: 0, exists: 0, problem: 0 };
  const table = parseTable(text);
  if (!table.length) return { rows: [], problems: ["Paste the list, or choose a file."], counts: none };
  const columns = mapHeaders(table[0]);
  if (columns.tag === undefined || columns.name === undefined) return { rows: [], problems: ["The first row should be the headings. There needs to be a Tag column and a Name column (Location, Category, Class, Make/model and Serial are optional)."], counts: none };

  const live = existing.filter((a) => a && a.active !== false);
  const seen = [];
  const cell = (row, field) => (columns[field] === undefined ? "" : row[columns[field]] ?? "");
  const rows = [];

  table.slice(1).forEach((raw, index) => {
    const line = index + 2;
    const problems = [];
    const tag = String(cell(raw, "tag")).replace(/\s+/g, " ").trim().slice(0, 40);
    const name = String(cell(raw, "name")).replace(/\s+/g, " ").trim().slice(0, 120);
    if (!tag) problems.push("Give it a tag number.");
    if (!name) problems.push("Say what it is.");

    const categoryText = cell(raw, "category");
    let category = matchCategory(categoryText);
    if (category === null) { problems.push(`"${categoryText}" is not a kind Primovex knows. Use ${PAT_CATEGORIES.map((c) => c.label).join(", ")}.`); category = ""; }
    if (!category) category = matchCategory(name) || "other";

    const clsText = squash(cell(raw, "cls"));
    let cls = "I";
    if (clsText) {
      if (["ii", "2", "class ii", "class 2"].includes(clsText)) cls = "II";
      else if (!["i", "1", "class i", "class 1"].includes(clsText)) problems.push(`"${cell(raw, "cls")}" is not a class. Use I or II.`);
    }

    const written = String(overrides[line] ?? cell(raw, "location")).trim();
    let location = written;
    if (rooms.length) {
      const match = rooms.find((room) => same(room, written));
      location = match || "";
      if (!match) problems.push(written ? `"${written}" is not one of the site's rooms. Choose the room.` : "Choose the room.");
    }

    // "R-1", "r1" and "R 1" are the same tag
    const tagKey = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const duplicate = !problems.length && [...live, ...seen].some((a) => tagKey(a.tag) === tagKey(tag));
    const status = problems.length ? "problem" : duplicate ? "exists" : "ok";
    if (status === "ok") seen.push({ tag });
    rows.push({ line, tag, name, category, cls, location, written, makeModel: String(cell(raw, "makeModel")).trim().slice(0, 120), serialNumber: String(cell(raw, "serialNumber")).trim().slice(0, 80), status, problems });
  });

  return {
    rows,
    problems: rows.length ? [] : ["There are no rows under the headings."],
    counts: { ok: rows.filter((r) => r.status === "ok").length, exists: rows.filter((r) => r.status === "exists").length, problem: rows.filter((r) => r.status === "problem").length },
  };
}
