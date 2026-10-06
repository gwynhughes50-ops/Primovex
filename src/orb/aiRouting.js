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

// Returns { classified, aiRouted }: the rules engine's answer, or, when it found no
// lookup and the assistant found one, the assistant's.
export async function applyAiRouting({ classified, input, context = {}, router, timeoutMs = AI_ROUTE_TIMEOUT_MS }) {
  const text = String(input || "").trim();
  if (classified?.toolId || !router || !context.userId || text.length < MIN_QUESTION_CHARS || context.forcedIntent) {
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
  constructor({ call, now = () => Date.now() }) {
    this.call = call;
    this.now = now;
    this.pausedUntil = 0;
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

  // Called when an administrator changes the switch, so it takes effect at once.
  reset() { this.pausedUntil = 0; }
}
