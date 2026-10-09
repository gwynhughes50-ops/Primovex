// What a person says to the Orb that isn't a new question: "yes", "cancel", "that's all", "the second one",
// "low harm", "ending 4821". Said out loud (or typed) while the Orb is waiting for an answer, these are
// understood against what is on screen: the card waiting for a yes, or the choices it just offered.
// Pure, so it can be tested.

const clean = (text) => String(text || "")
  .toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim()
  .replace(/^(?:(?:orb|ok|okay|right|so|please|erm|um|uh|hmm|yes and)\s+)+/, "").trim();

const END = /^(?:that'?s all|that is all|that'?s it|that is it|that will be all|that'?s everything|thank you|thanks|thanks orb|thank you orb|cheers|goodbye|bye|stop|stop listening|finished|i'?m finished|i'?m done|all done|we'?re done|nothing else|no thanks|no thank you)$/;
const YES = /^(?:yes|yeah|yep|yup|yes please|confirm|confirmed|go ahead|do it|that'?s right|that is right|that'?s correct|correct|ok|okay|sure|please do|yes confirm|take it off|take them off|send it|report it)$/;
const NO = /^(?:no|nope|cancel|cancel that|never ?mind|scrap that|don'?t|do not|not that|forget it|no cancel)$/;

const ORDINALS = { first: 0, "1st": 0, one: 0, 1: 0, second: 1, "2nd": 1, two: 1, 2: 1, third: 2, "3rd": 2, three: 2, 3: 2, fourth: 3, "4th": 3, four: 3, 4: 3 };
const FILLER = new Set(["the", "a", "an", "one", "ones", "batch", "number", "ending", "ends", "end", "in", "with", "please", "it", "that", "this", "i", "want", "for", "is", "was", "its", "it's", "of", "from", "go", "choose", "pick", "select", "take", "use", "yes", "yeah", "and", "my"]);

const words = (text) => clean(text).split(" ").filter(Boolean);
const optionText = (option) => (typeof option === "string" ? option : `${option?.label || ""} ${option?.hint || ""}`);

// Which of the offered choices was meant (an index), or -1.
export function pickOption(spoken, options = []) {
  const c = clean(spoken);
  if (!c || !options.length) return -1;
  const ordinal = c.match(/^(?:the\s+)?(?:number\s+|option\s+)?(first|second|third|fourth|1st|2nd|3rd|4th|one|two|three|four|1|2|3|4)(?:\s+one)?$/);
  if (ordinal) { const i = ORDINALS[ordinal[1]]; return i < options.length ? i : -1; }
  const spokenWords = words(c).filter((w) => !FILLER.has(w));
  if (!spokenWords.length) return -1;
  // words in the choice's own label count double: "no harm" is the label of one choice, but "no" is also in another's description
  const scores = options.map((option) => {
    const label = new Set(words(typeof option === "string" ? option : option?.label));
    const more = words(typeof option === "string" ? "" : option?.hint);
    const hit = (w, list) => (list.has ? list.has(w) : list.includes(w)) || (/^\d{3,}$/.test(w) && [...list].some((h) => h.endsWith(w)));
    return spokenWords.reduce((sum, w) => sum + (hit(w, label) ? 2 : hit(w, more) ? 1 : 0), 0);
  });
  const best = Math.max(...scores);
  if (best < 1 || best < spokenWords.length) return -1;
  const winners = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  return winners.length === 1 ? winners[0] : -1;
}

// { type: 'choice', index } | 'confirm' | 'cancel' | 'end' | 'empty' | 'text'
export function interpretSpoken(text, { options = [], hasProposal = false } = {}) {
  const c = clean(text);
  if (!c) return { type: "empty" };
  if (options.length) {
    const index = pickOption(c, options);
    if (index >= 0) return { type: "choice", index };
  }
  if (hasProposal && NO.test(c)) return { type: "cancel" };
  if (hasProposal && YES.test(c)) return { type: "confirm" };
  if (END.test(c)) return { type: "end" };
  return { type: "text" };
}

// What the Orb says out loud for one of its replies: the answer, without the evidence line, kept short,
// plus what to say next when it is waiting for something. null if there is nothing to say.
export function spokenReply(message) {
  if (!message || message.role !== "assistant" || message.error) return null;
  const proposal = message.proposal;
  if (proposal && ["done", "failed", "cancelled"].includes(proposal.status) && proposal.result) return String(proposal.result).slice(0, 240);
  let text = String(message.content || "").split(/\n\s*\n?Evidence:/)[0].replace(/[•·]/g, ",").replace(/\s+/g, " ").trim();
  if (text.length > 220) text = `${text.slice(0, 220).replace(/\s+\S*$/, "")}...`;
  if (proposal?.status === "proposed") return `${text} Say yes to confirm, or cancel.`.trim();
  const choices = (message.followUps || []).filter((q) => typeof q === "object");
  if (choices.length) return `${text} ${choices.map((c) => c.label).join(", ")}?`.replace(/\s+/g, " ").trim();
  return text || null;
}
