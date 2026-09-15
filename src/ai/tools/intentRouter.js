import {
  extractNumberOfDays,
  extractSearchSubject,
  getConversationContext,
  includesAny,
  isFollowUp,
  normalisePracticeLanguage,
  phraseSimilarity,
} from './languageEngine';
import { CLINICAL_INTENTS, ORB_CLARIFY_THRESHOLD, ORB_INTENT_THRESHOLD } from '@/orb/clinicalIntentCatalog';
import { STOCK_CATEGORIES } from '@/data/stockCategories';
import { orbKnowledgeStore } from '@/orb/OrbKnowledgeStore';

const INVENTORY_WORDS = ['stock', 'inventory', 'supplies', 'products', 'consumables', 'items'];
// Longest phrases first, so "wound care" matches before a shorter "care"
// style false-positive would ever get a chance to.
const CATEGORY_PHRASES = STOCK_CATEGORIES
  .flatMap((cat) => [cat.label, ...cat.subcategories.map((sub) => sub.label)])
  .map((label) => label.toLowerCase())
  .sort((a, b) => b.length - a.length);
const CATEGORY_QUESTION_WORDS = ['how many', 'do we have', 'show me', 'list', 'everything in', 'stock of', 'count', 'items', 'expiring', 'expire'];
const LOW_WORDS = ['low', 'below minimum', 'minimum level', 'need ordering', 'needs ordering', 'reorder', 'running low', 'short of', 'out of stock', 'order next'];
const EXPIRY_WORDS = ['expiry', 'expire', 'expires', 'out of date', 'use by', 'short dated', 'date soon'];
const SUMMARY_WORDS = ['what stock have we got', 'what inventory have we got', 'stock summary', 'inventory summary', 'how much stock', 'overview of stock', 'show all stock', 'list stock', 'what is in stock'];
const SEARCH_PREFIXES = ['search inventory', 'search stock', 'find stock', 'find inventory', 'find', 'do we have', 'have we got', 'is there any', 'look for'];
const CONCERN_WORDS = ['concern', 'complaint', 'listening to people', 'pals case'];
const SAR_PHRASES = ['subject access request'];
const SAR_WORD_PATTERN = /\bsars?\b/;

function extractCaseIdentifier(text) {
  const refMatch = text.match(/\b(?:cn|sar)-\d{4}-\d+\b/i);
  if (refMatch) return { reference: refMatch[0].toUpperCase() };
  const emisMatch = text.match(/\b(?:emis\s*(?:number|no)?\s*)?(\d{5,})\b/i);
  if (emisMatch) return { emisNumber: emisMatch[1] };
  return {};
}

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

  const clinicalCandidates = CLINICAL_INTENTS
    .map((intent) => ({ intent, score: Math.max(...intent.phrases.map((phrase) => phraseSimilarity(text, phrase))) }))
    .sort((a, b) => b.score - a.score);
  const clinical = clinicalCandidates[0];
  if (clinical?.score >= ORB_INTENT_THRESHOLD) {
    return { toolId: clinical.intent.id, input: { mode: /reconcil|check/.test(text) ? 'reconcile' : 'status' }, language: { normalised: text, confidence: clinical.score, fuzzy: clinical.score < 0.96, candidates: clinicalCandidates.slice(0, 3).map(({ intent, score }) => ({ id: intent.id, score })) } };
  }

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

  // A named category ("wound care", "emergency drugs", "PPE"...) plus
  // ordinary inventory-question phrasing beats the generic low-stock/expiry/
  // summary tools below — it answers with the same low/out-of-stock/expiring
  // breakdown, just scoped to that category instead of the whole practice.
  const matchedCategoryPhrase = CATEGORY_PHRASES.find((phrase) => text.includes(phrase));
  if (matchedCategoryPhrase && (isInventory || hasLowStockLanguage || hasExpiryLanguage || includesAny(text, CATEGORY_QUESTION_WORDS))) {
    return { toolId: 'inventory.categoryLookup', input: { category: matchedCategoryPhrase, days: extractNumberOfDays(text, 60) }, language: { normalised: text } };
  }

  if ((isInventory && hasLowStockLanguage) || includesAny(text, ['anything need ordering', 'anything needs ordering', 'what needs ordering', 'what is low', 'what is running low', 'below minimum'])) {
    return { toolId: 'inventory.lowStock', input: {}, language: { normalised: text } };
  }
  if ((isInventory && hasExpiryLanguage) || includesAny(text, ['out of date', 'what is expiry', 'what expires', 'expiry soon', 'short dated'])) {
    return { toolId: 'inventory.expiring', input: { days: extractNumberOfDays(text, 60) }, language: { normalised: text } };
  }
  if (includesAny(text, SUMMARY_WORDS) || (isInventory && includesAny(text, ['overview', 'summary', 'how many', 'total stock', 'all items']))) {
    return { toolId: 'inventory.summary', input: {}, language: { normalised: text } };
  }

  if (includesAny(text, ['where is', 'where was', 'last seen', 'locate', 'location of', 'find'])
    && includesAny(text, ['ecg', 'machine', 'equipment', 'doppler', 'nebuliser', 'wheelchair', 'defibrillator', 'asset', 'ultrasound', 'dermatoscope', 'scanner', 'monitor'])) {
    const equipment = extractSearchSubject(text, ['where is', 'where was', 'last seen', 'locate', 'location of', 'find', 'the', 'equipment', 'machine', 'asset']);
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

  if (SAR_WORD_PATTERN.test(text) || includesAny(text, SAR_PHRASES)) {
    return { toolId: 'governance.sarLookup', input: extractCaseIdentifier(text), language: { normalised: text } };
  }

  if (includesAny(text, CONCERN_WORDS)) {
    return { toolId: 'governance.concernLookup', input: extractCaseIdentifier(text), language: { normalised: text } };
  }

  const hasSearchPrefix = includesAny(text, SEARCH_PREFIXES);
  if (isInventory && (hasSearchPrefix || !includesAny(text, [...LOW_WORDS, ...EXPIRY_WORDS]))) {
    const query = extractSearchSubject(text, [...SEARCH_PREFIXES, ...INVENTORY_WORDS, 'what is', 'what are', 'show me']);
    if (!query) return { toolId: 'inventory.summary', input: {}, language: { normalised: text } };
    return { toolId: 'inventory.search', input: { query }, language: { normalised: text } };
  }

  // A search-shaped phrase ("do we have paracetamol", "is there any calpol")
  // implies a stock query even without a generic word like "stock"/
  // "inventory" — covers naming a specific product we have no keyword for,
  // which matters most for voice queries that name a product directly.
  if (!isInventory && hasSearchPrefix) {
    const query = extractSearchSubject(text, [...SEARCH_PREFIXES, ...INVENTORY_WORDS, 'what is', 'what are', 'show me']);
    if (query) return { toolId: 'inventory.search', input: { query }, language: { normalised: text } };
  }

  // Last resort before giving up: does this match something someone taught
  // Orb directly (practice policy, "who do I call for X", etc)? Tried after
  // every structured tool above so a taught FAQ never shadows a real,
  // higher-confidence data lookup.
  const knowledgeMatch = orbKnowledgeStore.findBestMatch(text);
  if (knowledgeMatch) {
    return { toolId: 'knowledge.faqLookup', input: { entryId: knowledgeMatch.id }, language: { normalised: text } };
  }

  return clinical?.score >= ORB_CLARIFY_THRESHOLD
    ? { toolId: null, input: {}, language: { normalised: text, confidence: clinical.score, needsClarification: true, candidates: clinicalCandidates.slice(0, 3).map(({ intent, score }) => ({ id: intent.id, score })) } }
    : null;
}
