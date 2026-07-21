var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/ai/tools/intentRouter.js
var intentRouter_exports = {};
__export(intentRouter_exports, {
  routeApprovedTool: () => routeApprovedTool
});
module.exports = __toCommonJS(intentRouter_exports);

// src/ai/tools/languageEngine.js
var PHRASE_REPLACEMENTS = [
  [/\bwhat(?:'s| is)\b/g, " what is "],
  [/\bwhats\b/g, " what is "],
  [/\bwhere(?:'s| is)\b/g, " where is "],
  [/\bhasn(?:'t|t)\b/g, " has not "],
  [/\bhaven(?:'t|t)\b/g, " have not "],
  [/\bcan(?:'t|t)\b/g, " cannot "],
  [/\bpls\b|\bplz\b/g, " please "],
  [/\bstk\b|\binv\b/g, " inventory "],
  [/\bqty\b/g, " quantity "],
  [/\bmin\b(?=\s+(?:level|stock|qty|quantity))/g, " minimum "],
  [/\bood\b/g, " out of date "],
  [/\bexp\b|\bexpiring\b/g, " expiry "],
  [/\btemp\b|\btemps\b/g, " temperature "],
  [/\bmaint\b/g, " maintenance "],
  [/\btr\s*(\d+)\b/g, " treatment room $1 "],
  [/\bcr\s*(\d+)\b/g, " consulting room $1 "],
  [/\bmo\b/g, " minor ops "],
  [/\baed\b/g, " defibrillator "],
  [/\bdefib\b/g, " defibrillator "],
  [/\brecess\s+(?:trolley|box|cart)\b/g, " resus trolley "],
  [/\bresuscitation\s+(?:trolley|box|cart)\b/g, " resus trolley "],
  [/\bcrash\s+(?:cart|box)\b/g, " crash trolley "],
  [/\bemergency\s+(?:medications|medicines)\b/g, " emergency drugs "],
  [/\becg\b/g, " ecg "],
  [/\bfridges?\b/g, " fridge "],
  [/\bcleaners?\b/g, " cleaning "],
  [/\bhousekeeping\b/g, " cleaning "],
  [/\bcaretakers?\b/g, " caretaker "]
];
var STOP_WORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "could",
  "do",
  "does",
  "for",
  "from",
  "have",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "our",
  "please",
  "show",
  "tell",
  "that",
  "the",
  "there",
  "to",
  "we",
  "what",
  "which",
  "with",
  "you",
  "got",
  "any",
  "all",
  "currently",
  "today"
]);
function normalisePracticeLanguage(value) {
  let text = String(value || "").toLowerCase().replace(/[’‘]/g, "'");
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) text = text.replace(pattern, replacement);
  return text.replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}
function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}
function extractNumberOfDays(text, fallback = 60) {
  const direct = text.match(/(?:next|within|in)\s+(\d{1,3})\s+days?/);
  if (direct) return Math.max(1, Math.min(365, Number(direct[1])));
  if (/next week|within a week/.test(text)) return 7;
  if (/next fortnight|within a fortnight/.test(text)) return 14;
  if (/next month|within a month/.test(text)) return 30;
  if (/next (?:two|2) months|within (?:two|2) months/.test(text)) return 60;
  if (/next (?:three|3) months|within (?:three|3) months/.test(text)) return 90;
  if (/this year|next year/.test(text)) return 365;
  return fallback;
}
function extractSearchSubject(text, removablePhrases = []) {
  let cleaned = text;
  const ordered = [...removablePhrases].sort((a, b) => b.length - a.length);
  for (const phrase of ordered) cleaned = cleaned.replaceAll(phrase, " ");
  const tokens = cleaned.split(" ").filter((token) => token && !STOP_WORDS.has(token));
  return tokens.join(" ").trim();
}
function getConversationContext(conversation = []) {
  const messages = Array.isArray(conversation) ? conversation : [];
  const lastAssistant = [...messages].reverse().find((message) => message?.role === "assistant");
  const lastUser = [...messages].reverse().find((message) => message?.role === "user");
  return {
    lastIntent: lastAssistant?.intent || null,
    lastAssistantContent: lastAssistant?.content || "",
    lastUserContent: lastUser?.content || ""
  };
}
function isFollowUp(text) {
  return /^(show|list|which|what about|and|those|them|these|more|details|yes|please show|go on)\b/.test(text) || /\b(show|list) (?:me )?(?:those|them|the items|the rooms|the results)\b/.test(text);
}
function levenshteinDistance(left = "", right = "") {
  const a = String(left);
  const b = String(right);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}
function phraseSimilarity(left, right) {
  const a = normalisePracticeLanguage(left);
  const b = normalisePracticeLanguage(right);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return Math.min(1, 0.88 + Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.12);
  const edit = 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
  const aTokens = new Set(a.split(" ").filter((token) => !STOP_WORDS.has(token)));
  const bTokens = new Set(b.split(" ").filter((token) => !STOP_WORDS.has(token)));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = (/* @__PURE__ */ new Set([...aTokens, ...bTokens])).size || 1;
  return Math.max(0, Math.min(1, edit * 0.55 + overlap / union * 0.45));
}

// src/core/identity/capabilities.js
var CAPABILITIES = {
  dashboard: {
    read: "dashboard.read"
  },
  operations: {
    read: "operations.read",
    manage: "operations.manage"
  },
  inventory: {
    read: "inventory.read",
    write: "inventory.write",
    adjust: "inventory.adjust",
    verify: "inventory.verify",
    delete: "inventory.delete"
  },
  purchasing: {
    read: "purchasing.read",
    write: "purchasing.write",
    approve: "purchasing.approve"
  },
  suppliers: {
    read: "suppliers.read",
    write: "suppliers.write"
  },
  governance: {
    read: "governance.read",
    write: "governance.write",
    manageSars: "governance.manageSars",
    manageComplaints: "governance.manageComplaints",
    manageConcerns: "governance.manageConcerns"
  },
  connect: {
    view: "connect.view",
    manageDevices: "connect.manageDevices",
    acknowledgeAlerts: "connect.acknowledgeAlerts"
  },
  temperature: {
    read: "temperature.read",
    write: "temperature.write",
    resolveIncident: "temperature.resolveIncident"
  },
  compliance: {
    read: "compliance.read",
    write: "compliance.write",
    recordChecks: "compliance.recordChecks",
    manageAssets: "compliance.manageAssets"
  },
  practiceAdmin: {
    read: "practiceAdmin.read",
    write: "practiceAdmin.write"
  },
  reports: {
    read: "reports.read"
  },
  theme: {
    lab: "theme.lab"
  },
  admin: {
    access: "admin.access",
    manageUsers: "admin.manageUsers",
    manageRoles: "admin.manageRoles",
    manageSettings: "admin.manageSettings"
  },
  mobile: {
    access: "mobile.access",
    biometricUnlock: "mobile.biometricUnlock"
  },
  audit: {
    read: "audit.read",
    write: "audit.write"
  },
  security: {
    read: "security.read",
    manage: "security.manage"
  }
};
var ALL_CAPABILITIES = Object.values(CAPABILITIES).flatMap((group) => Object.values(group));

// src/orb/clinicalIntentCatalog.js
var ORB_INTENT_THRESHOLD = 0.78;
var ORB_CLARIFY_THRESHOLD = 0.52;
var CLINICAL_INTENTS = Object.freeze([
  { id: "emergency.readiness", label: "Check emergency drugs", description: "Read emergency drugs, equipment and resus kit readiness.", requiredCapability: "inventory.read", phrases: ["emergency drugs", "emergency medicines", "emergency kit", "emergency box", "crash trolley", "crash cart", "resus trolley", "resuscitation trolley", "resus box", "recess trolley", "reconcile resus trolley", "check emergency drugs", "tell me about emergency drugs"] },
  { id: "anaphylaxis.readiness", label: "Check anaphylaxis boxes", description: "Read anaphylaxis box readiness and latest checks.", requiredCapability: "inventory.read", phrases: ["anaphylaxis box", "anaphylaxis boxes", "anaphylaxis kit", "anaphylaxis kits", "check anaphylaxis box", "how is the anaphylaxis box"] },
  { id: "inventory.lowStock", label: "Check low stock", description: "Read items at or below minimum stock.", requiredCapability: "inventory.read", phrases: ["low stock", "running low", "out of stock", "needs ordering"] },
  { id: "inventory.expiring", label: "Check expiry dates", description: "Read stock approaching expiry.", requiredCapability: "inventory.read", phrases: ["expiry dates", "expiring stock", "out of date", "short dated"] },
  { id: "coldChain.latestStatus", label: "Check all fridges", description: "Read current cold-chain status.", requiredCapability: "temperature.read", phrases: ["all fridges", "cold chain", "fridges ok", "fridge status"] },
  { id: "facilities.cleaningStatus", label: "Check cleaning", description: "Read rooms with outstanding cleaning.", requiredCapability: "operations.read", phrases: ["cleaning status", "rooms need cleaning", "cleaning outstanding"] },
  { id: "facilities.maintenanceOpen", label: "Check maintenance", description: "Read open maintenance work.", requiredCapability: "operations.read", phrases: ["maintenance", "repairs", "broken equipment", "open jobs"] },
  { id: "operations.summary", label: "Check practice readiness", description: "Read the current operational summary.", requiredCapability: "operations.read", phrases: ["practice ready", "what needs attention", "anything urgent", "is everything ok"] }
]);

// src/ai/tools/intentRouter.js
var INVENTORY_WORDS = ["stock", "inventory", "supplies", "products", "consumables", "items"];
var LOW_WORDS = ["low", "below minimum", "minimum level", "need ordering", "needs ordering", "reorder", "running low", "short of", "out of stock", "order next"];
var EXPIRY_WORDS = ["expiry", "expire", "expires", "out of date", "use by", "short dated", "date soon"];
var SUMMARY_WORDS = ["what stock have we got", "what inventory have we got", "stock summary", "inventory summary", "how much stock", "overview of stock", "show all stock", "list stock", "what is in stock"];
var SEARCH_PREFIXES = ["search inventory", "search stock", "find stock", "find inventory", "find", "do we have", "have we got", "is there any", "look for"];
function routeFollowUp(text, context) {
  if (!isFollowUp(text) || !context.lastIntent) return null;
  if (context.lastIntent === "inventory.lowStock") return { toolId: "inventory.lowStock", input: {} };
  if (context.lastIntent === "inventory.expiring") return { toolId: "inventory.expiring", input: { days: extractNumberOfDays(text, 60) } };
  if (context.lastIntent === "inventory.summary") return { toolId: "inventory.summary", input: {} };
  if (context.lastIntent === "facilities.cleaningStatus") return { toolId: "facilities.cleaningStatus", input: {} };
  if (context.lastIntent === "facilities.maintenanceOpen") return { toolId: "facilities.maintenanceOpen", input: {} };
  if (context.lastIntent === "operations.timeline") return { toolId: "operations.timeline", input: { sinceYesterday: true } };
  return null;
}
function routeApprovedTool(prompt, options = {}) {
  const text = normalisePracticeLanguage(prompt);
  const context = getConversationContext(options.conversation);
  const followUp = routeFollowUp(text, context);
  if (followUp) return { ...followUp, language: { normalised: text, followUp: true } };
  const clinicalCandidates = CLINICAL_INTENTS.map((intent) => ({ intent, score: Math.max(...intent.phrases.map((phrase) => phraseSimilarity(text, phrase))) })).sort((a, b) => b.score - a.score);
  const clinical = clinicalCandidates[0];
  if (clinical?.score >= ORB_INTENT_THRESHOLD) {
    return { toolId: clinical.intent.id, input: { mode: /reconcil|check/.test(text) ? "reconcile" : "status" }, language: { normalised: text, confidence: clinical.score, fuzzy: clinical.score < 0.96, candidates: clinicalCandidates.slice(0, 3).map(({ intent, score }) => ({ id: intent.id, score })) } };
  }
  if (includesAny(text, ["what changed", "since yesterday", "what happened", "operations timeline", "activity timeline", "what has happened"])) {
    return { toolId: "operations.timeline", input: { sinceYesterday: true }, language: { normalised: text } };
  }
  if (includesAny(text, ["practice ready", "practice readiness", "what needs attention", "what needs doing", "priorities", "priority", "how is the practice", "operations summary", "morning brief", "is everything ok", "anything urgent"])) {
    return { toolId: "operations.summary", input: {}, language: { normalised: text } };
  }
  const fridgeMatch = text.match(/\b(?:fridge|freezer)\s*(?:number\s*)?(\d+)\b/i);
  if (fridgeMatch || includesAny(text, ["tell me about", "status of", "how is", "is"]) && includesAny(text, ["fridge", "freezer"])) {
    const unit = fridgeMatch ? `${text.includes("freezer") ? "freezer" : "fridge"} ${fridgeMatch[1]}` : extractSearchSubject(text, ["tell me about", "status of", "how is", "is", "the"]);
    return { toolId: "coldChain.unitStatus", input: { unit }, language: { normalised: text, entityType: text.includes("freezer") ? "freezer" : "fridge" } };
  }
  if (includesAny(text, ["cold chain", "fridge temperature", "fridge check", "temperature reading", "vaccine fridge", "fridge ok", "fridge status"])) {
    return { toolId: "coldChain.latestStatus", input: {}, language: { normalised: text } };
  }
  const hasLowStockLanguage = includesAny(text, LOW_WORDS);
  const hasExpiryLanguage = includesAny(text, EXPIRY_WORDS);
  const isInventory = includesAny(text, INVENTORY_WORDS) || includesAny(text, ["insulin", "dressings", "vaccines", "gloves", "needles", "syringes"]);
  if (isInventory && hasLowStockLanguage || includesAny(text, ["anything need ordering", "anything needs ordering", "what needs ordering", "what is low", "what is running low", "below minimum"])) {
    return { toolId: "inventory.lowStock", input: {}, language: { normalised: text } };
  }
  if (isInventory && hasExpiryLanguage || includesAny(text, ["out of date", "what is expiry", "what expires", "expiry soon", "short dated"])) {
    return { toolId: "inventory.expiring", input: { days: extractNumberOfDays(text, 60) }, language: { normalised: text } };
  }
  if (includesAny(text, SUMMARY_WORDS) || isInventory && includesAny(text, ["overview", "summary", "how many", "total stock", "all items"])) {
    return { toolId: "inventory.summary", input: {}, language: { normalised: text } };
  }
  if (includesAny(text, ["where is", "where was", "last seen", "locate", "location of"]) && includesAny(text, ["ecg", "machine", "equipment", "doppler", "nebuliser", "wheelchair", "defibrillator", "asset"])) {
    const equipment = extractSearchSubject(text, ["where is", "where was", "last seen", "locate", "location of", "the", "equipment", "machine", "asset"]);
    return { toolId: "facilities.equipmentLocation", input: { equipment }, language: { normalised: text } };
  }
  if (includesAny(text, ["maintenance", "caretaker", "fault", "repair", "broken", "jobs outstanding", "jobs open"])) {
    return { toolId: "facilities.maintenanceOpen", input: {}, language: { normalised: text } };
  }
  if (includesAny(text, ["which rooms", "rooms need cleaning", "rooms not cleaned", "cleaning status", "not been cleaned", "cleaning outstanding", "cleaning due"])) {
    return { toolId: "facilities.cleaningStatus", input: {}, language: { normalised: text } };
  }
  if (includesAny(text, ["minor ops", "treatment room", "consulting room", "meeting room"]) && includesAny(text, ["cleaned", "cleaning", "ready", "status"])) {
    const room = extractSearchSubject(text, ["has", "have", "been", "cleaned", "cleaning", "today", "ready", "status", "is"]);
    return { toolId: "facilities.roomStatus", input: { room }, language: { normalised: text } };
  }
  if (isInventory && (includesAny(text, SEARCH_PREFIXES) || !includesAny(text, [...LOW_WORDS, ...EXPIRY_WORDS]))) {
    const query = extractSearchSubject(text, [...SEARCH_PREFIXES, ...INVENTORY_WORDS, "what is", "what are", "show me"]);
    if (!query) return { toolId: "inventory.summary", input: {}, language: { normalised: text } };
    return { toolId: "inventory.search", input: { query }, language: { normalised: text } };
  }
  return clinical?.score >= ORB_CLARIFY_THRESHOLD ? { toolId: null, input: {}, language: { normalised: text, confidence: clinical.score, needsClarification: true, candidates: clinicalCandidates.slice(0, 3).map(({ intent, score }) => ({ id: intent.id, score })) } } : null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  routeApprovedTool
});
