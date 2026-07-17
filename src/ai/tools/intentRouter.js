import {
  extractNumberOfDays,
  extractSearchSubject,
  getConversationContext,
  includesAny,
  isFollowUp,
  normalisePracticeLanguage,
} from './languageEngine';

const INVENTORY_WORDS = ['stock', 'inventory', 'supplies', 'products', 'consumables', 'items'];
const LOW_WORDS = ['low', 'below minimum', 'minimum level', 'need ordering', 'needs ordering', 'reorder', 'running low', 'short of', 'out of stock', 'order next'];
const EXPIRY_WORDS = ['expiry', 'expire', 'expires', 'out of date', 'use by', 'short dated', 'date soon'];
const SUMMARY_WORDS = ['what stock have we got', 'what inventory have we got', 'stock summary', 'inventory summary', 'how much stock', 'overview of stock', 'show all stock', 'list stock', 'what is in stock'];
const SEARCH_PREFIXES = ['search inventory', 'search stock', 'find stock', 'find inventory', 'find', 'do we have', 'have we got', 'is there any', 'look for'];

function routeFollowUp(text, context) {
  if (!isFollowUp(text) || !context.lastIntent) return null;
  if (context.lastIntent === 'inventory.lowStock') return { toolId: 'inventory.lowStock', input: {} };
  if (context.lastIntent === 'inventory.expiring') return { toolId: 'inventory.expiring', input: { days: extractNumberOfDays(text, 60) } };
  if (context.lastIntent === 'inventory.summary') return { toolId: 'inventory.summary', input: {} };
  if (context.lastIntent === 'facilities.cleaningStatus') return { toolId: 'facilities.cleaningStatus', input: {} };
  if (context.lastIntent === 'facilities.maintenanceOpen') return { toolId: 'facilities.maintenanceOpen', input: {} };
  if (context.lastIntent === 'operations.timeline') return { toolId: 'operations.timeline', input: { sinceYesterday: true } };
  return null;
}

export function routeApprovedTool(prompt, options = {}) {
  const text = normalisePracticeLanguage(prompt);
  const context = getConversationContext(options.conversation);
  const followUp = routeFollowUp(text, context);
  if (followUp) return { ...followUp, language: { normalised: text, followUp: true } };

  if (includesAny(text, ['what changed', 'since yesterday', 'what happened', 'operations timeline', 'activity timeline', 'what has happened'])) {
    return { toolId: 'operations.timeline', input: { sinceYesterday: true }, language: { normalised: text } };
  }

  if (includesAny(text, ['practice ready', 'practice readiness', 'what needs attention', 'what needs doing', 'priorities', 'priority', 'how is the practice', 'operations summary', 'morning brief', 'is everything ok', 'anything urgent'])) {
    return { toolId: 'operations.summary', input: {}, language: { normalised: text } };
  }

  const fridgeMatch = text.match(/\b(?:fridge|freezer)\s*(?:number\s*)?(\d+)\b/i);
  if (fridgeMatch || (includesAny(text, ['tell me about', 'status of', 'how is', 'is']) && includesAny(text, ['fridge', 'freezer']))) {
    const unit = fridgeMatch ? `${text.includes('freezer') ? 'freezer' : 'fridge'} ${fridgeMatch[1]}` : extractSearchSubject(text, ['tell me about', 'status of', 'how is', 'is', 'the']);
    return { toolId: 'coldChain.unitStatus', input: { unit }, language: { normalised: text, entityType: text.includes('freezer') ? 'freezer' : 'fridge' } };
  }

  if (includesAny(text, ['cold chain', 'fridge temperature', 'fridge check', 'temperature reading', 'vaccine fridge', 'fridge ok', 'fridge status'])) {
    return { toolId: 'coldChain.latestStatus', input: {}, language: { normalised: text } };
  }

  const hasLowStockLanguage = includesAny(text, LOW_WORDS);
  const hasExpiryLanguage = includesAny(text, EXPIRY_WORDS);
  const isInventory = includesAny(text, INVENTORY_WORDS) || includesAny(text, ['insulin', 'dressings', 'vaccines', 'gloves', 'needles', 'syringes']);
  if ((isInventory && hasLowStockLanguage) || includesAny(text, ['anything need ordering', 'anything needs ordering', 'what needs ordering', 'what is low', 'what is running low', 'below minimum'])) {
    return { toolId: 'inventory.lowStock', input: {}, language: { normalised: text } };
  }
  if ((isInventory && hasExpiryLanguage) || includesAny(text, ['out of date', 'what is expiry', 'what expires', 'expiry soon', 'short dated'])) {
    return { toolId: 'inventory.expiring', input: { days: extractNumberOfDays(text, 60) }, language: { normalised: text } };
  }
  if (includesAny(text, SUMMARY_WORDS) || (isInventory && includesAny(text, ['overview', 'summary', 'how many', 'total stock', 'all items']))) {
    return { toolId: 'inventory.summary', input: {}, language: { normalised: text } };
  }

  if (includesAny(text, ['where is', 'where was', 'last seen', 'locate', 'location of']) && includesAny(text, ['ecg', 'machine', 'equipment', 'doppler', 'nebuliser', 'wheelchair', 'defibrillator', 'asset'])) {
    const equipment = extractSearchSubject(text, ['where is', 'where was', 'last seen', 'locate', 'location of', 'the', 'equipment', 'machine', 'asset']);
    return { toolId: 'facilities.equipmentLocation', input: { equipment }, language: { normalised: text } };
  }

  if (includesAny(text, ['maintenance', 'caretaker', 'fault', 'repair', 'broken', 'jobs outstanding', 'jobs open'])) {
    return { toolId: 'facilities.maintenanceOpen', input: {}, language: { normalised: text } };
  }

  if (includesAny(text, ['which rooms', 'rooms need cleaning', 'rooms not cleaned', 'cleaning status', 'not been cleaned', 'cleaning outstanding', 'cleaning due'])) {
    return { toolId: 'facilities.cleaningStatus', input: {}, language: { normalised: text } };
  }

  if (includesAny(text, ['minor ops', 'treatment room', 'consulting room', 'meeting room']) && includesAny(text, ['cleaned', 'cleaning', 'ready', 'status'])) {
    const room = extractSearchSubject(text, ['has', 'have', 'been', 'cleaned', 'cleaning', 'today', 'ready', 'status', 'is']);
    return { toolId: 'facilities.roomStatus', input: { room }, language: { normalised: text } };
  }

  if (isInventory && (includesAny(text, SEARCH_PREFIXES) || !includesAny(text, [...LOW_WORDS, ...EXPIRY_WORDS]))) {
    const query = extractSearchSubject(text, [...SEARCH_PREFIXES, ...INVENTORY_WORDS, 'what is', 'what are', 'show me']);
    if (!query) return { toolId: 'inventory.summary', input: {}, language: { normalised: text } };
    return { toolId: 'inventory.search', input: { query }, language: { normalised: text } };
  }

  return null;
}
