// The Orb's approved read-only lookups, as the language model is allowed to see
// them. The model is only ever shown this list (names, what each one does, what it
// takes) and picks one; the lookup itself then runs in the app under the person's
// own permissions. It never sees any practice data.
//
// Mirrors src/ai/tools/toolSchemas.js and the capabilities in
// src/ai/tools/readOnlyTools.js (scripts/verify-orb-catalog.mjs fails if they drift).
//
// Deliberately NOT here: the concern and SAR lookups (they take a patient's
// reference or EMIS number, which must never be sent to a model) and the taught
// practice-knowledge lookup (not yet).

const NONE = {};

const TOOLS = [
  { id: "emergency.readiness", capability: "inventory.read", description: "Readiness of emergency drugs and resuscitation equipment (crash trolley): missing or expired items and the last check.", params: { mode: { type: "string", enum: ["status", "reconcile"], description: "status = just report; reconcile = start a check." } } },
  { id: "anaphylaxis.readiness", capability: "inventory.read", description: "Readiness of the anaphylaxis boxes: missing or expired items and the last check.", params: { mode: { type: "string", enum: ["status", "reconcile"] } } },
  { id: "operations.summary", capability: "operations.read", description: "Overall practice readiness and today's top priorities across facilities, stock and cold chain.", params: NONE },
  { id: "operations.timeline", capability: "operations.read", description: "Recent operational events (cleaning, maintenance, stock movements, temperatures) as a timeline.", params: { sinceYesterday: { type: "boolean", description: "true = since yesterday, false = full history." } } },
  { id: "inventory.summary", capability: "inventory.read", description: "Overview of stock: how many items, how many low or out, how many expiring soon.", params: NONE },
  { id: "inventory.search", capability: "inventory.read", description: "Find a specific stock item by name and give its level, minimum and expiry.", params: { query: { type: "string", description: "Item name or part of one." } }, required: ["query"] },
  { id: "inventory.lowStock", capability: "inventory.read", description: "Every stock item at or below its minimum level.", params: NONE },
  { id: "inventory.expiring", capability: "inventory.read", description: "Stock expiring within a number of days.", params: { days: { type: "number", min: 1, max: 365, description: "Look-ahead window in days (default 60)." } } },
  { id: "inventory.categoryLookup", capability: "inventory.read", description: "Stock in a category (for example wound care, dressings, vaccines) with levels and expiry.", params: { category: { type: "string", description: "Category name." }, days: { type: "number", min: 1, max: 365 } }, required: ["category"] },
  { id: "facilities.roomStatus", capability: "operations.read", description: "Status of one room: when it was last cleaned and by whom.", params: { room: { type: "string", description: "Room or space name, for example treatment room 2." } }, required: ["room"] },
  { id: "facilities.cleaningStatus", capability: "operations.read", description: "Every room not yet cleaned today.", params: NONE },
  { id: "facilities.equipmentLocation", capability: "operations.read", description: "Which room a piece of equipment is recorded in.", params: { equipment: { type: "string", description: "Equipment name, for example ECG machine." } }, required: ["equipment"] },
  { id: "facilities.maintenanceOpen", capability: "operations.read", description: "Open facilities maintenance issues.", params: NONE },
  { id: "coldChain.unitStatus", capability: "temperature.read", description: "Latest temperature and range status for one named fridge or freezer.", params: { unit: { type: "string", description: "Unit name, for example fridge 2." } }, required: ["unit"] },
  { id: "coldChain.latestStatus", capability: "temperature.read", description: "Latest cold-chain status across all fridges and freezers.", params: NONE },
  { id: "spaces.summary", capability: "operations.read", description: "Overview of the practice's registered rooms and spaces and which need attention.", params: NONE },
  { id: "compliance.summary", capability: "compliance.read", description: "Compliance evidence overview: assets, recorded checks and failed checks needing review.", params: NONE },
  { id: "tasks.summary", capability: "operations.read", description: "Open operational tasks and escalations across the practice.", params: NONE },
  { id: "tasks.quickNotes", capability: "operations.read", description: "The signed-in person's own open quick notes plus shared practice reminders.", params: NONE },
  { id: "alerts.summary", capability: "operations.read", description: "Currently active alerts: low stock and connected-device alerts.", params: NONE },
  { id: "admin.users", capability: "admin.access", description: "A team member's role by name, or a breakdown of all accounts by role.", params: { name: { type: "string", description: "Staff name to look up. Omit for everyone." } } },
];

module.exports = { ORB_TOOLS: TOOLS, ORB_TOOL_IDS: TOOLS.map((tool) => tool.id) };
