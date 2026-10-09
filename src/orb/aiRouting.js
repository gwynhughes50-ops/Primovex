// How the Orb decides to ask the language assistant for help. Pure (no Firebase), so
// it can be tested.
//
// The rules engine runs first and answers anything it recognises, instantly and for
// free. Only a question it did NOT understand goes to the language assistant, which
// only picks one of the approved read-only lookups (it never sees practice data).
// If the assistant is off, slow, over its limit or unsure, the Orb carries on exactly
// as it did before: ask the person what they meant.

export const AI_ROUTE_TIMEOUT_MS = 6000;
export const MIN_QUESTION_CHARS = 4;

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(() => resolve(null), ms)),
]);

// The rules sometimes land on a catch-all rather than understanding: a whole sentence squeezed into a
// stock search ("I've nearly finished the green needles in the nurses room" -> look up a product
// called "nearly finished green needles nurses room"). That isn't understanding, so the language
// assistant gets a go at it too. If it has nothing better, the rules' answer stands.
export function isWeakRoute(classified, input) {
  if (classified?.toolId !== "inventory.search") return false;
  const queryWords = String(classified.input?.query || "").trim().split(/\s+/).filter(Boolean).length;
  const statement = /\b(?:(?:i|we)(?:'ve|\s+have)?|ive|weve)\s+(?:(?:just|also|nearly|now|already)\s+)*(?:finished|used|taken|took|removed|opened|ran|run|need|needed|forgot|forgotten|left)\b|\b(?:nearly|just)\s+(?:finished|ran|run)\b/i.test(String(input || ""));
  // a long "product name", or a short one inside a statement about what someone did or needs
  return queryWords >= 4 || (queryWords >= 2 && statement);
}

// Returns { classified, aiRouted }: the rules engine's answer, or, when it found no
// lookup and the assistant found one, the assistant's.
export async function applyAiRouting({ classified, input, context = {}, router, timeoutMs = AI_ROUTE_TIMEOUT_MS }) {
  const text = String(input || "").trim();
  if ((classified?.toolId && !isWeakRoute(classified, text)) || !router || !context.userId || text.length < MIN_QUESTION_CHARS || context.forcedIntent) {
    return { classified, aiRouted: false };
  }
  let routed = null;
  try {
    routed = await withTimeout(router.route({ question: text }), timeoutMs);
  } catch {
    routed = null;
  }
  if (!routed?.toolId) return { classified, aiRouted: false };
  return {
    aiRouted: true,
    classified: {
      id: routed.toolId,
      toolId: routed.toolId,
      input: routed.input || {},
      language: { aiRouted: true },
      confidence: Number(routed.confidence) || 0.8,
    },
  };
}

// Says so on the answer, so nobody is left wondering how the Orb understood them.
export function markAiRouted(response) {
  const note = { title: "Orb language assistant", detail: "Worked out what you meant; the lookup itself ran with your own permissions", type: "system" };
  return { ...response, sources: [...(response.sources || []), note] };
}

// ---- the connection --------------------------------------------------------------

const OFF_CACHE_MS = 10 * 60 * 1000;
const FAIL_CACHE_MS = 60 * 1000;

// Asks the server which lookup fits. Never throws: any problem is "no answer", and
// the Orb carries on with its own rules. Remembers when the assistant is switched
// off, or has just failed, so an off switch costs nothing and a faulty service isn't
// hammered. `call` does the actual request (injected so this can be tested).
export class AiRouter {
  constructor({ call, callPhrase = null, now = () => Date.now() }) {
    this.call = call;
    this.callPhrase = callPhrase;
    this.now = now;
    this.pausedUntil = 0;
    this.phrasePausedUntil = 0;
  }

  async route({ question }) {
    if (this.now() < this.pausedUntil) return null;
    try {
      const result = await this.call({ question });
      if (!result || result.enabled === false) {
        this.pausedUntil = this.now() + OFF_CACHE_MS;
        return null;
      }
      return result.toolId ? result : null;
    } catch (error) {
      // Over the limit, offline, not signed in, service down: all just "no answer".
      this.pausedUntil = this.now() + (error?.code === "functions/resource-exhausted" ? FAIL_CACHE_MS * 5 : FAIL_CACHE_MS);
      return null;
    }
  }

  // Reworded text for an answer, or null (off, rejected, unavailable).
  async phrase({ toolId, question, facts }) {
    if (!this.callPhrase || this.now() < this.phrasePausedUntil) return null;
    try {
      const result = await this.callPhrase({ toolId, question, facts });
      if (!result || result.enabled === false) {
        this.phrasePausedUntil = this.now() + OFF_CACHE_MS;
        return null;
      }
      return typeof result.text === 'string' && result.text ? result.text : null;
    } catch (error) {
      this.phrasePausedUntil = this.now() + (error?.code === 'functions/resource-exhausted' ? FAIL_CACHE_MS * 5 : FAIL_CACHE_MS);
      return null;
    }
  }

  // Called when an administrator changes a switch, so it takes effect at once.
  reset() { this.pausedUntil = 0; this.phrasePausedUntil = 0; }
}

// ---- wording ---------------------------------------------------------------------

export const AI_PHRASE_TIMEOUT_MS = 5000;

// The lookups whose answers may be reworded (the server enforces this too). Nothing
// with staff-typed text, staff names or patient references.
export const PHRASABLE_TOOLS = new Set([
  'emergency.readiness', 'anaphylaxis.readiness', 'operations.summary', 'inventory.summary', 'inventory.search', 'inventory.lowStock',
  'inventory.expiring', 'inventory.categoryLookup', 'facilities.cleaningStatus', 'coldChain.unitStatus', 'coldChain.latestStatus',
  'spaces.summary', 'compliance.summary', 'alerts.summary',
]);

// Puts an answer into friendlier words, when an administrator has allowed it. Never
// throws and never delays more than the timeout: anything short of a good reworded
// answer returns the original untouched. The facts and numbers cannot change (the
// server throws away any reply that does), and a check or an all-clear is not reworded
// when the evidence is incomplete.
export async function applyAiPhrasing({ raw, toolId, question, context = {}, router, timeoutMs = AI_PHRASE_TIMEOUT_MS }) {
  if (!router?.phrase || !context.userId || !raw?.answer || !PHRASABLE_TOOLS.has(toolId)) return raw;
  if (raw.denied || raw.data?.proposal) return raw;
  if (raw.knownState && raw.knownState !== 'known') return raw;
  if (raw.answer.length > 1400) return raw;
  let text = null;
  try {
    text = await withTimeout(router.phrase({ toolId, question, facts: raw.answer }), timeoutMs);
  } catch {
    text = null;
  }
  if (!text || typeof text !== 'string') return raw;
  return {
    ...raw,
    answer: text,
    sources: [...(raw.sources || []), { title: 'Orb language assistant', detail: 'Reworded in plainer language; the facts are the same as the lookup found', type: 'system' }],
  };
}
