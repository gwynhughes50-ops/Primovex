import { HELP_ARTICLES, HELP_CHECKED } from "./helpArticles";

// Finds the how-to article that fits a question, and words the answer. Pure (no Firebase,
// no React) so it can be tested with real phrasings.

// Words that carry no meaning for matching ("how do I ...").
const FILLER = new Set([
  "a", "an", "and", "are", "about", "can", "could", "do", "does", "did", "for", "get", "go", "have", "help", "how", "i", "in", "is", "it",
  "me", "my", "need", "of", "on", "our", "please", "should", "show", "steps", "tell", "that", "the", "this", "to", "up", "want", "way", "we",
  "what", "where", "with", "would", "you", "your", "let", "us", "some", "any", "do", "ive", "im", "make", "set",
]);

// A forgiving stem so "adding", "added", "adds" and "add" meet; "received" and "receive" meet.
export function stem(word) {
  let w = String(word).toLowerCase();
  if (w.length <= 3) return w;
  w = w.replace(/ies$/, "y");
  w = w.replace(/([^s])s$/, "$1"); // plural
  if (w.length > 4) w = w.replace(/(?:ing|ed|es)$/, "");
  w = w.replace(/e$/, "");
  if (w.length > 3) w = w.replace(/([^aeiouls])\1$/, "$1"); // scann -> scan, dropp -> drop
  return w;
}

export function tokens(text) {
  return [...new Set(String(text || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/'s\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .map(stem))];
}

const dice = (a, b) => {
  if (!a.length || !b.length) return 0;
  const set = new Set(b);
  const shared = a.filter((t) => set.has(t)).length;
  return (2 * shared) / (a.length + b.length);
};

// Pre-computed token sets for every article.
const INDEX = HELP_ARTICLES.map((article) => ({
  article,
  asks: [article.title, ...article.asks].map(tokens),
  keywords: new Set(article.keywords.map(stem)),
}));

export const MIN_SCORE = 0.42;
const CLOSE = 0.06;

// How well each article fits the question, best first.
export function rankHelp(question) {
  const q = tokens(question);
  if (!q.length) return [];
  return INDEX.map(({ article, asks, keywords }) => {
    const best = Math.max(...asks.map((a) => dice(q, a)));
    const hits = q.filter((t) => keywords.has(t)).length;
    const keyword = hits / q.length;
    return { article, score: Math.min(1, 0.8 * best + 0.2 * keyword), best, keyword };
  }).sort((a, b) => b.score - a.score);
}

// { match, alternatives } where match is the article to show (or null), and alternatives
// are other articles close enough that the person should be offered the choice.
export function findHelp(question) {
  const ranked = rankHelp(question);
  const top = ranked[0];
  if (!top || top.score < MIN_SCORE) return { match: null, alternatives: [] };
  const close = ranked.slice(1, 3).filter((r) => r.score >= MIN_SCORE && top.score - r.score < CLOSE);
  if (close.length && top.best < 0.95) return { match: null, alternatives: [top.article, ...close.map((r) => r.article)] };
  return { match: top.article, alternatives: [] };
}

// Does the question ask how to do something? ("where is the ECG?" is not one.)
const HOW_TO = /\b(how (?:do|can|could|would|should|does|to)\b|how'?s? (?:i|we)\b|where (?:do|can|would) (?:i|we)\b|steps? (?:to|for)\b|show me how|guide me|walk me through|what(?:'s| is) the (?:process|procedure|way) (?:to|for)|i need help (?:with|to)|help me (?:to|with))/i;
export const isHowToQuestion = (text) => HOW_TO.test(String(text || ""));

// ---- the answer ---------------------------------------------------------------------------------

const PHONE = /^(android|mobile-web)$/;

// platform: 'desktop' | 'android' | 'mobile-web' (the app's own client marker).
// capabilityLabel(id) -> a readable permission name.
export function formatHelpAnswer(article, { capabilities = [], platform = "desktop", hasCapability = () => true, capabilityLabel = (id) => id } = {}) {
  const onPhone = PHONE.test(platform);
  const lines = [];
  if (article.where === "desktop" && onPhone) lines.push("This is done on a computer, in the Primovex desktop app.");
  if (article.where === "phone" && !onPhone) lines.push("This is done on the phone, in the Primovex app.");
  lines.push(`How to: ${article.title}`);
  article.steps.forEach((step, i) => lines.push(article.steps.length === 1 ? `• ${step}` : `${i + 1}. ${step}`));
  if (article.tip) lines.push(`Tip: ${article.tip}`);
  if (article.needs && !hasCapability(capabilities, article.needs)) {
    lines.push(`You'll need the "${capabilityLabel(article.needs)}" permission to do this. If you can't see the button, ask an administrator.`);
  }
  return lines.join("\n");
}

// The questions to offer as buttons under an answer: its related articles.
export function relatedQuestions(article) {
  return (article.related || [])
    .map((id) => HELP_ARTICLES.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => a.asks[0])
    .slice(0, 3);
}

export function describeSource() {
  return { title: "Primovex help", detail: `Written for this version of Primovex and checked ${HELP_CHECKED.split("-").reverse().join("/")}`, type: "system" };
}

// "How do I..." questions people can ask, for the "what can you help with" case.
export function sampleQuestions(count = 4) {
  const picks = ["add-stock-item", "check-kit-phone", "log-temperature", "add-user", "move-stock-to-kit", "print-org-chart"];
  return picks.map((id) => HELP_ARTICLES.find((a) => a.id === id)?.asks[0]).filter(Boolean).slice(0, count);
}
