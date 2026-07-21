export const ORB_CORE_VERSION = '2.0.0';

export const ORB_INPUT_TYPES = Object.freeze({
  TEXT: 'text',
  VOICE: 'voice',
  BARCODE: 'barcode',
  QR: 'qr',
  NFC: 'nfc',
  PHOTO: 'photo',
});

export const ORB_DISCLOSURE_LEVELS = Object.freeze({
  OPERATIONAL: 'operational',
  NAMED_OPERATIONAL: 'named-operational',
  RESTRICTED: 'restricted',
});

export const ORB_CONFIDENCE_BANDS = Object.freeze({
  VERY_HIGH: 'very-high',
  HIGH: 'high',
  CONFIRM: 'confirm',
  UNSAFE: 'unsafe',
});

export function createOrbRequest({ input, inputType = ORB_INPUT_TYPES.TEXT, context = {}, conversation = [] }) {
  return {
    id: globalThis.crypto?.randomUUID?.() || `orb-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    input: String(input || '').trim(),
    inputType,
    context,
    conversation,
    createdAt: new Date().toISOString(),
  };
}

export function createOrbResponse({
  answer,
  intent = 'general.unmatched',
  confidence = null,
  confidenceBand = null,
  sources = [],
  evidence = [],
  actions = [],
  warnings = [],
  modulesUsed = [],
  withheld = [],
  explanation = null,
  auditId = null,
  clarification = null,
  data = null,
  freshness = null,
  observedAt = null,
  knownState = 'known',
  disclosureLevel = ORB_DISCLOSURE_LEVELS.OPERATIONAL,
  domain = null,
}) {
  return {
    answer: String(answer || ''),
    intent,
    confidence,
    confidenceBand,
    sources,
    evidence,
    actions,
    warnings,
    modulesUsed,
    withheld,
    explanation,
    auditId,
    clarification,
    data,
    freshness,
    observedAt,
    knownState,
    disclosureLevel,
    domain,
  };
}
