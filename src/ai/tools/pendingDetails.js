import { looksLikeInDetails, mergeInSentence } from "@/ai/stock/stockIn";
import { looksLikeCountItems, mergeCountSentence } from "@/ai/stock/stockCount";

// Some requests need a second answer ("what's the batch number and expiry date?"). The tool says so by
// returning data.pending = { toolId, sentence }, which the message keeps. If the next thing said looks like
// the answer, it is joined to the sentence so far and sent back to the same tool, instead of being treated
// as a brand new question. Nothing is remembered anywhere else: it is read back from the conversation.

const HANDLERS = {
  "stock.inDraft": { accepts: looksLikeInDetails, merge: mergeInSentence },
  // a count keeps its card on screen while more items are added; each answer rebuilds the card
  "stock.countDraft": { accepts: looksLikeCountItems, merge: mergeCountSentence, keepsCard: true },
};

export function routePendingDetails(prompt, conversation = []) {
  const last = [...(Array.isArray(conversation) ? conversation : [])].reverse().find((message) => message?.role === "assistant");
  const pending = last?.pending;
  const handler = pending && HANDLERS[pending.toolId];
  if (!handler || (last.proposal && !(handler.keepsCard && last.proposal.status === "proposed"))) return null;
  if (!handler.accepts(prompt)) return null;
  return { toolId: pending.toolId, input: { question: handler.merge(pending.sentence, prompt) } };
}
