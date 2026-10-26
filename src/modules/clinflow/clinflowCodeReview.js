// The coder's part of a ClinFlow letter: each suggested SNOMED code is shown with the words in the letter that led to it, and the clinician
// accepts it, removes it, or adds one the reader missed. Pure (no screens, no storage) so it can be tested.
//
// Every change is kept, with who and when, and the counts (suggested, accepted, removed, added) are the measure of how good the reader is:
// codes the coder removes were wrong, codes they add were missed.

const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const STOP = new Set(["the", "a", "an", "of", "and", "or", "with", "for", "to", "in", "on", "at", "is", "was", "has", "had", "his", "her", "their", "mr", "mrs", "miss", "dr", "no", "not"]);
const words = (value) => text(value).toLowerCase().replace(/[^a-z0-9\s./%-]/g, " ").split(" ").filter((w) => w && !STOP.has(w));

// A stable key for a suggested code, so a decision stays with the same suggestion
export const candidateKey = (c) => [c?.conceptId || "", text(c?.sourceLabel), text(c?.searchTerm || c?.sourceValue), c?.component || ""].join("|").toLowerCase();

// ---- the words in the letter behind a suggestion ----

// Splits the letter into sentences and lines. Each keeps its place so the quote is always a stretch of the letter itself.
export function letterSentences(letter) {
  const out = [];
  const body = String(letter ?? "");
  const pattern = /[^\n.!?;]+[.!?;]?/g;
  let m;
  while ((m = pattern.exec(body))) {
    const sentence = text(m[0]);
    if (sentence.length >= 3) out.push({ text: sentence, start: m.index });
  }
  return out;
}

// The sentence of the letter that best matches a finding. `found` is false when the letter has no sentence containing most of the finding's words,
// so a suggestion with nothing behind it is shown as such, never given a made-up reason. The quote is always copied from the letter.
export function findEvidence(letter, finding) {
  const wanted = words(finding);
  if (!wanted.length) return { found: false, quote: "" };
  let best = null;
  for (const sentence of letterSentences(letter)) {
    const have = new Set(words(sentence.text));
    const hits = wanted.filter((w) => have.has(w) || [...have].some((h) => h.length > 4 && w.length > 4 && (h.startsWith(w) || w.startsWith(h)))).length;
    const score = hits / wanted.length;
    if (!best || score > best.score || (score === best.score && sentence.text.length < best.text.length)) best = { ...sentence, score };
  }
  if (!best || best.score < (wanted.length === 1 ? 1 : 0.6)) return { found: false, quote: "" };
  return { found: true, quote: best.text.length > 260 ? `${best.text.slice(0, 257)}...` : best.text };
}

// ---- SNOMED identifiers: the check digit catches a mistyped code ----

const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
function verhoeffValid(id) {
  let c = 0;
  [...String(id)].reverse().forEach((ch, i) => { c = D[c][P[i % 8][Number(ch)]]; });
  return c === 0;
}

// kind: "concept" or "description". Returns "" when the identifier could be right, else what is wrong with it.
export function snomedIdProblem(value, kind = "concept") {
  const id = String(value ?? "").trim();
  if (!id) return "";
  if (!/^\d{6,18}$/.test(id)) return `A SNOMED ${kind} ID is six to eighteen digits, with nothing else in it.`;
  if (id.startsWith("0")) return `A SNOMED ${kind} ID does not start with 0.`;
  if (!verhoeffValid(id)) return `That is not a valid SNOMED ${kind} ID (its check digit is wrong), so it has probably been mistyped.`;
  const partition = id.slice(-3, -1);
  if (kind === "concept" && !["00", "10"].includes(partition)) return "That looks like a description or relationship ID, not a concept ID.";
  if (kind === "description" && !["01", "11"].includes(partition)) return "That looks like a concept ID, not a description ID.";
  return "";
}

// ---- the review itself ----
// review = { decisions: { [key]: { decision: "accepted" | "removed", byUid, byName, at } }, added: [{ id, term, conceptId, descriptionId, byUid, byName, at }], log: [...] }

export const emptyReview = () => ({ decisions: {}, added: [], log: [] });
const stamp = (now) => (now instanceof Date ? now : new Date(now)).toISOString();

export function decide(review, candidate, decision, { uid = "", name = "", now = new Date() } = {}) {
  if (!["accepted", "removed", "suggested"].includes(decision)) throw new Error("A code can be accepted, removed or put back as a suggestion.");
  const key = candidateKey(candidate);
  const base = review || emptyReview();
  const decisions = { ...base.decisions };
  if (decision === "suggested") delete decisions[key]; else decisions[key] = { decision, byUid: uid, byName: name, at: stamp(now) };
  return { ...base, decisions, log: [...(base.log || []), { at: stamp(now), byUid: uid, byName: name, action: decision, key, term: text(candidate.preferredTerm || candidate.searchTerm || candidate.sourceValue) }] };
}

// A code the reader missed, added by the coder. A concept ID is optional (a term alone is kept as a note); when given it is checked.
export function addProblem(input) {
  const term = text(input?.term);
  if (term.length < 3) return "Say what the code is for (a few words at least).";
  if (term.length > 200) return "That is too long: keep it under 200 letters.";
  return snomedIdProblem(input?.conceptId, "concept") || snomedIdProblem(input?.descriptionId, "description")
    || (text(input?.descriptionId) && !text(input?.conceptId) ? "A description ID needs the concept ID with it." : "");
}

export function addCode(review, input, { uid = "", name = "", now = new Date() } = {}) {
  const problem = addProblem(input);
  if (problem) throw new Error(problem);
  const base = review || emptyReview();
  const entry = { id: `added-${(base.added || []).length + 1}-${Date.parse(stamp(now)) || 0}`, term: text(input.term), conceptId: text(input.conceptId), descriptionId: text(input.descriptionId), byUid: uid, byName: name, at: stamp(now) };
  return { ...base, added: [...(base.added || []), entry], log: [...(base.log || []), { at: stamp(now), byUid: uid, byName: name, action: "added", key: entry.id, term: entry.term }] };
}

export function removeAdded(review, id, { uid = "", name = "", now = new Date() } = {}) {
  const base = review || emptyReview();
  const entry = (base.added || []).find((a) => a.id === id);
  if (!entry) return base;
  return { ...base, added: base.added.filter((a) => a.id !== id), log: [...(base.log || []), { at: stamp(now), byUid: uid, byName: name, action: "took out an added code", key: id, term: entry.term }] };
}

// Each suggestion with the words behind it and where the coder has got to: [{ key, candidate, term, evidence, state, by, at }]
export function reviewRows(candidates = [], letter = "", review = null) {
  return candidates.map((candidate) => {
    const key = candidateKey(candidate);
    const decision = review?.decisions?.[key];
    const evidence = findEvidence(letter, candidate.sourceValue || candidate.searchTerm || candidate.preferredTerm);
    return {
      key, candidate, term: text(candidate.preferredTerm || candidate.searchTerm || candidate.sourceValue), label: text(candidate.sourceLabel), conceptId: candidate.conceptId || "",
      evidence, state: decision?.decision || "suggested", by: decision?.byName || "", at: decision?.at || "",
    };
  });
}

// What the coder has left: the suggestions they accepted (marked as accepted by them) and the codes they added, ready for the Docman record.
// Suggestions they removed are gone, and ones nobody has looked at yet stay unaccepted.
export function codesAfterReview(candidates = [], review = null) {
  const out = [];
  for (const c of candidates) {
    const decision = review?.decisions?.[candidateKey(c)];
    if (decision?.decision === "removed") continue;
    out.push(decision?.decision === "accepted" ? { ...c, acceptedByUid: decision.byUid || "unknown", acceptedByName: decision.byName, acceptedAt: decision.at } : c);
  }
  for (const a of review?.added || []) {
    out.push({ sourceLabel: "Added by the coder", sourceValue: a.term, searchTerm: a.term, conceptId: a.conceptId || null, descriptionId: a.descriptionId || null, preferredTerm: a.term, assertion: "present", scheme: 2, codeSystem: "SNOMED CT UK Edition", status: "added_by_clinician", acceptedByUid: a.byUid || "unknown", acceptedByName: a.byName, acceptedAt: a.at, addedByCoder: true });
  }
  return out;
}

// The figures that say how good the reader is on real use
export function reviewStats(candidates = [], review = null) {
  const keys = candidates.map(candidateKey);
  const decisions = keys.map((k) => review?.decisions?.[k]?.decision);
  const accepted = decisions.filter((d) => d === "accepted").length;
  const removed = decisions.filter((d) => d === "removed").length;
  const added = (review?.added || []).length;
  const decided = accepted + removed;
  return { suggested: candidates.length, accepted, removed, added, waiting: candidates.length - decided, right: decided ? Math.round((accepted / decided) * 100) : null, missed: added };
}

export const statsLine = (s) => `${s.suggested} suggested: ${s.accepted} accepted, ${s.removed} removed, ${s.waiting} waiting; ${s.added} added by the coder.`;
