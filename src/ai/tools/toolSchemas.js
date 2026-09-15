// Anthropic tool-definition metadata for the read-only tools registered in
// readOnlyTools.js. Kept separate from that file so the tool
// implementations don't have to carry LLM-specific schema noise — this is
// purely presentation for Claude's tool-use API. If a tool here has no
// matching registration (or vice versa), claudeProvider.js filters it out
// against the live toolRegistry, so this can safely lag behind by a tool or
// two without breaking anything.
const EMPTY_SCHEMA = { type: 'object', properties: {} };

export const TOOL_SCHEMAS = {
  'emergency.readiness': {
    description: 'Check readiness of emergency drugs and resuscitation equipment (crash trolley). Reports missing/expired items and last verification date.',
    input_schema: { type: 'object', properties: { mode: { type: 'string', enum: ['status', 'reconcile'], description: 'status = just report readiness; reconcile = propose starting a verification check for the item that most needs it.' } } },
  },
  'anaphylaxis.readiness': {
    description: 'Check readiness of anaphylaxis boxes. Reports missing/expired items and last verification date.',
    input_schema: { type: 'object', properties: { mode: { type: 'string', enum: ['status', 'reconcile'] } } },
  },
  'operations.summary': {
    description: 'Overall practice operational readiness score and today\'s top priorities across facilities, inventory and cold chain.',
    input_schema: EMPTY_SCHEMA,
  },
  'operations.timeline': {
    description: 'Recent operational events (cleaning, maintenance, stock movements, temperature readings) as a timeline.',
    input_schema: { type: 'object', properties: { sinceYesterday: { type: 'boolean', description: 'true = only events since yesterday (default), false = full recorded history.' } } },
  },
  'inventory.summary': {
    description: 'Overview of stock: total items, how many are low/out of stock, how many are expiring soon.',
    input_schema: EMPTY_SCHEMA,
  },
  'inventory.search': {
    description: 'Search for a specific stock item by name and get its current level, minimum, and expiry.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Item name or part of a name to search for.' } }, required: ['query'] },
  },
  'inventory.lowStock': {
    description: 'List every stock item currently at or below its minimum level.',
    input_schema: EMPTY_SCHEMA,
  },
  'inventory.expiring': {
    description: 'List stock items expiring within a given number of days.',
    input_schema: { type: 'object', properties: { days: { type: 'number', description: 'Look-ahead window in days (default 60).' } } },
  },
  'facilities.roomStatus': {
    description: 'Status of a specific room or space, including when it was last cleaned and by whom.',
    input_schema: { type: 'object', properties: { room: { type: 'string', description: 'Room or space name (partial match is fine), e.g. "treatment room 2".' } }, required: ['room'] },
  },
  'facilities.cleaningStatus': {
    description: 'List every room not yet marked as cleaned today.',
    input_schema: EMPTY_SCHEMA,
  },
  'facilities.equipmentLocation': {
    description: 'Find which room a piece of equipment is currently recorded in.',
    input_schema: { type: 'object', properties: { equipment: { type: 'string', description: 'Equipment name, e.g. "ECG machine", "doppler".' } }, required: ['equipment'] },
  },
  'facilities.maintenanceOpen': {
    description: 'List currently open facilities maintenance issues.',
    input_schema: EMPTY_SCHEMA,
  },
  'coldChain.unitStatus': {
    description: 'Latest temperature reading and range status for a specific named fridge or freezer unit.',
    input_schema: { type: 'object', properties: { unit: { type: 'string', description: 'Unit name, e.g. "fridge 2", "vaccine freezer".' } }, required: ['unit'] },
  },
  'coldChain.latestStatus': {
    description: 'Latest cold-chain reading across all fridge/freezer units.',
    input_schema: EMPTY_SCHEMA,
  },
  'spaces.summary': {
    description: 'Overview of the practice space registry: how many active rooms/spaces are registered and which need attention.',
    input_schema: EMPTY_SCHEMA,
  },
  'compliance.summary': {
    description: 'Overview of compliance evidence: assets, recorded checks, and any failed checks needing review.',
    input_schema: EMPTY_SCHEMA,
  },
  'tasks.summary': {
    description: 'List open operational tasks/escalations across the practice.',
    input_schema: EMPTY_SCHEMA,
  },
  'tasks.quickNotes': {
    description: 'The signed-in user\'s own open Quick Notes (personal reminders) plus any shared "practice task" notes.',
    input_schema: EMPTY_SCHEMA,
  },
  'alerts.summary': {
    description: 'Currently active operational alerts: low stock and connected-device alerts.',
    input_schema: EMPTY_SCHEMA,
  },
  'admin.users': {
    description: 'Look up a specific team member\'s role by name/email, or get a breakdown of all registered accounts by role.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Name or email to search for. Omit to get a breakdown of everyone.' } } },
  },
  'governance.concernLookup': {
    description: 'Look up a Listening to People concern/complaint by its reference (e.g. CN-2026-...) or the patient\'s EMIS number. Returns status, priority, deadline and owner.',
    input_schema: { type: 'object', properties: { reference: { type: 'string', description: 'Concern reference, e.g. CN-2026-0803141522.' }, emisNumber: { type: 'string', description: 'Patient EMIS number.' } } },
  },
  'governance.sarLookup': {
    description: 'Look up a Subject Access Request (SAR) by its reference (e.g. SAR-2026-...) or the patient\'s EMIS number. Returns status, request type, deadline and who it\'s assigned to.',
    input_schema: { type: 'object', properties: { reference: { type: 'string', description: 'SAR reference, e.g. SAR-2026-0803141522.' }, emisNumber: { type: 'string', description: 'Patient EMIS number.' } } },
  },
};
