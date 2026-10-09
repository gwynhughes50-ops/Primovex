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
  { id: "emergency.readiness", capability: "inventory.read", phrase: true, description: "Readiness of emergency drugs and resuscitation equipment (crash trolley): missing or expired items and the last check.", params: { mode: { type: "string", enum: ["status", "reconcile"], description: "status = just report; reconcile = start a check." } } },
  { id: "anaphylaxis.readiness", capability: "inventory.read", phrase: true, description: "Readiness of the anaphylaxis boxes: missing or expired items and the last check.", params: { mode: { type: "string", enum: ["status", "reconcile"] } } },
  { id: "operations.summary", capability: "operations.read", phrase: true, description: "Overall practice readiness and today's top priorities across facilities, stock and cold chain.", params: NONE },
  { id: "operations.timeline", capability: "operations.read", description: "Recent operational events (cleaning, maintenance, stock movements, temperatures) as a timeline.", params: { sinceYesterday: { type: "boolean", description: "true = since yesterday, false = full history." } } },
  { id: "inventory.summary", capability: "inventory.read", phrase: true, description: "Overview of stock: how many items, how many low or out, how many expiring soon.", params: NONE },
  { id: "inventory.search", capability: "inventory.read", phrase: true, description: "Find a specific stock item by name and give its level, minimum and expiry.", params: { query: { type: "string", description: "Item name or part of one." } }, required: ["query"] },
  { id: "inventory.lowStock", capability: "inventory.read", phrase: true, description: "Every stock item at or below its minimum level.", params: NONE },
  { id: "inventory.expiring", capability: "inventory.read", phrase: true, description: "Stock expiring within a number of days.", params: { days: { type: "number", min: 1, max: 365, description: "Look-ahead window in days (default 60)." } } },
  { id: "inventory.categoryLookup", capability: "inventory.read", phrase: true, description: "Stock in a category (for example wound care, dressings, vaccines) with levels and expiry.", params: { category: { type: "string", description: "Category name." }, days: { type: "number", min: 1, max: 365 } }, required: ["category"] },
  { id: "facilities.roomStatus", capability: "operations.read", description: "Status of one room: when it was last cleaned and by whom.", params: { room: { type: "string", description: "Room or space name, for example treatment room 2." } }, required: ["room"] },
  { id: "facilities.cleaningStatus", capability: "operations.read", phrase: true, description: "Every room not yet cleaned today.", params: NONE },
  { id: "facilities.equipmentLocation", capability: "operations.read", description: "Which room a piece of equipment is recorded in.", params: { equipment: { type: "string", description: "Equipment name, for example ECG machine." } }, required: ["equipment"] },
  { id: "facilities.maintenanceOpen", capability: "operations.read", description: "Open facilities maintenance issues.", params: NONE },
  { id: "coldChain.unitStatus", capability: "temperature.read", phrase: true, description: "Latest temperature and range status for one named fridge or freezer.", params: { unit: { type: "string", description: "Unit name, for example fridge 2." } }, required: ["unit"] },
  { id: "coldChain.latestStatus", capability: "temperature.read", phrase: true, description: "Latest cold-chain status across all fridges and freezers.", params: NONE },
  { id: "spaces.summary", capability: "operations.read", phrase: true, description: "Overview of the practice's registered rooms and spaces and which need attention.", params: NONE },
  { id: "compliance.summary", capability: "compliance.read", phrase: true, description: "Compliance evidence overview: assets, recorded checks and failed checks needing review.", params: NONE },
  { id: "tasks.summary", capability: "operations.read", description: "Open operational tasks and escalations across the practice.", params: NONE },
  { id: "tasks.quickNotes", capability: "operations.read", description: "The signed-in person's own open quick notes plus shared practice reminders.", params: NONE },
  { id: "alerts.summary", capability: "operations.read", phrase: true, description: "Currently active alerts: low stock and connected-device alerts.", params: NONE },
  { id: "inventory.locate", capability: "inventory.read", description: "Where a stock item is kept, how many are in a particular place (a kit, box, room or the store room), or what is in a place. Use for questions like where are the blue needles, how many adrenaline are in anaphylaxis box 3, or what is in the emergency trolley.", params: { item: { type: "string", description: "The stock item, if one is asked about." }, place: { type: "string", description: "The place, if one is asked about, for example anaphylaxis box 3." } } },
  { id: "team.messageDraft", capability: "inventory.write", description: "Prepare a short message to a team (a role such as HCA, nurses or reception). The person is shown the message and must confirm it before it is sent. Use when someone asks to tell, message or let a team know something about stock.", params: { team: { type: "string", description: "The team, for example HCA or nurses." }, message: { type: "string", description: "What to tell them, in the person's words." } }, required: ["team", "message"] },
  { id: "reorder.draft", capability: "inventory.write", description: "Prepare a request to reorder a stock item, or report that something is missing or has run out. The person must confirm before anything is created. Use for: we need more X, X needs ordering, reorder X, we are out of X, box 3 is missing X.", params: { item: { type: "string", description: "The stock item." }, quantity: { type: "number", min: 1, max: 999, description: "How many to order, if said." }, place: { type: "string", description: "Where it is missing from, if said." } }, required: ["item"] },
  { id: "stock.useDraft", capability: "inventory.write", description: "Record that someone has used or taken stock, for example 'I just used one ampoule of chlorphenamine from the store cupboard' or 'took 2 boxes of gloves from room D62'. Prepares a card for them to confirm before any stock changes. Use when they say they have taken, used, removed or opened something.", params: { item: { type: "string", description: "The stock item they used." }, quantity: { type: "number", min: 1, max: 999, description: "How many, if said." }, place: { type: "string", description: "Where they took it from, if said." }, batch: { type: "string", description: "The batch, if said." } }, required: ["item"] },
  { id: "help.howTo", capability: "dashboard.read", description: "Step-by-step help for how to do something in Primovex, for example how to add stock, check a kit or add a user. Use for any question that asks how to do something in the app.", params: { question: { type: "string", description: "What they want to know how to do, in their words." } }, required: ["question"] },
  { id: "admin.users", capability: "admin.access", description: "A team member's role by name, or a breakdown of all accounts by role.", params: { name: { type: "string", description: "Staff name to look up. Omit for everyone." } } },
];

// Lookups whose ANSWER may be reworded by the language model: item, room, fridge and
// space names and counts only. Never anything with free text typed by staff (tasks,
// notes, maintenance titles, the timeline), staff names (who cleaned, who saw it, the
// team list) or patient references.
const PHRASE_TOOL_IDS = TOOLS.filter((tool) => tool.phrase).map((tool) => tool.id);

module.exports = { ORB_TOOLS: TOOLS, ORB_TOOL_IDS: TOOLS.map((tool) => tool.id), PHRASE_TOOL_IDS };
