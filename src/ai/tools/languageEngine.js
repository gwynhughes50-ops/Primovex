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
  [/\brecess\s+(?:trolley|box|cart)\b/g, ' resus trolley '],
  [/\bresuscitation\s+(?:trolley|box|cart)\b/g, ' resus trolley '],
  [/\bcrash\s+(?:cart|box)\b/g, ' crash trolley '],
  [/\bemergency\s+(?:medications|medicines)\b/g, ' emergency drugs '],
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

export function levenshteinDistance(left = '', right = '') {
  const a = String(left); const b = String(right);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

export function phraseSimilarity(left, right) {
  const a = normalisePracticeLanguage(left); const b = normalisePracticeLanguage(right);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return Math.min(1, 0.88 + (Math.min(a.length, b.length) / Math.max(a.length, b.length)) * 0.12);
  const edit = 1 - (levenshteinDistance(a, b) / Math.max(a.length, b.length));
  const aTokens = new Set(a.split(' ').filter((token) => !STOP_WORDS.has(token)));
  const bTokens = new Set(b.split(' ').filter((token) => !STOP_WORDS.has(token)));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  return Math.max(0, Math.min(1, edit * 0.55 + (overlap / union) * 0.45));
}
