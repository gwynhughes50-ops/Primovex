const PHRASE_REPLACEMENTS = [
  [/\bwhat(?:'s| is)\b/g, ' what is '],
  [/\bwhats\b/g, ' what is '],
  [/\bwhere(?:'s| is)\b/g, ' where is '],
  [/\bhasn(?:'t|t)\b/g, ' has not '],
  [/\bhaven(?:'t|t)\b/g, ' have not '],
  [/\bcan(?:'t|t)\b/g, ' cannot '],
  [/\bpls\b|\bplz\b/g, ' please '],
  [/\bstk\b|\binv\b/g, ' inventory '],
  [/\bqty\b/g, ' quantity '],
  [/\bmin\b(?=\s+(?:level|stock|qty|quantity))/g, ' minimum '],
  [/\bood\b/g, ' out of date '],
  [/\bexp\b|\bexpiring\b/g, ' expiry '],
  [/\btemp\b|\btemps\b/g, ' temperature '],
  [/\bmaint\b/g, ' maintenance '],
  [/\btr\s*(\d+)\b/g, ' treatment room $1 '],
  [/\bcr\s*(\d+)\b/g, ' consulting room $1 '],
  [/\bmo\b/g, ' minor ops '],
  [/\baed\b/g, ' defibrillator '],
  [/\bdefib\b/g, ' defibrillator '],
  [/\becg\b/g, ' ecg '],
  [/\bfridges?\b/g, ' fridge '],
  [/\bcleaners?\b/g, ' cleaning '],
  [/\bhousekeeping\b/g, ' cleaning '],
  [/\bcaretakers?\b/g, ' caretaker '],
];

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'can', 'could', 'do', 'does', 'for', 'from', 'have', 'i', 'in', 'is',
  'it', 'me', 'of', 'on', 'our', 'please', 'show', 'tell', 'that', 'the', 'there', 'to', 'we',
  'what', 'which', 'with', 'you', 'got', 'any', 'all', 'currently', 'today',
]);

export function normalisePracticeLanguage(value) {
  let text = String(value || '').toLowerCase().replace(/[’‘]/g, "'");
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) text = text.replace(pattern, replacement);
  return text
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

export function extractNumberOfDays(text, fallback = 60) {
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

export function extractSearchSubject(text, removablePhrases = []) {
  let cleaned = text;
  const ordered = [...removablePhrases].sort((a, b) => b.length - a.length);
  for (const phrase of ordered) cleaned = cleaned.replaceAll(phrase, ' ');
  const tokens = cleaned.split(' ').filter((token) => token && !STOP_WORDS.has(token));
  return tokens.join(' ').trim();
}

export function getConversationContext(conversation = []) {
  const messages = Array.isArray(conversation) ? conversation : [];
  const lastAssistant = [...messages].reverse().find((message) => message?.role === 'assistant');
  const lastUser = [...messages].reverse().find((message) => message?.role === 'user');
  return {
    lastIntent: lastAssistant?.intent || null,
    lastAssistantContent: lastAssistant?.content || '',
    lastUserContent: lastUser?.content || '',
  };
}

export function isFollowUp(text) {
  return /^(show|list|which|what about|and|those|them|these|more|details|yes|please show|go on)\b/.test(text)
    || /\b(show|list) (?:me )?(?:those|them|the items|the rooms|the results)\b/.test(text);
}
