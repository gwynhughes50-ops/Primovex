// The coder's part of a ClinFlow letter: each suggested SNOMED code is shown with the words in the letter that led to it, and the clinician
// accepts it, removes it, or adds one the reader missed. Pure (no screens, no storage) so it can be tested.
//
// Every change is kept, with who and when, and the counts (suggested, accepted, removed, added) are the measure of how good the reader is:
// codes the coder removes were wrong, codes they add were missed.

const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const STOP = new Set(["the", "a", "an", "of", "and", "or", "with", "for", "to", "in", "on", "at", "is", "was", "has", "had", "his", "her", "their", "mr", "mrs", "miss", "dr", "no", "not"]);
const words = (value) => text(value).toLowerCase().replace(/[^a-z0-9\s./%-]/g, " ").split(" ").filter((w) => w && !STOP.has(w));

// A stable key for a suggested code, so a decision stays with the same suggestion
// (it does not include the code itself: a code found later from the SNOMED list must not lose the decision already made)
export const candidateKey = (c) => [text(c?.sourceLabel), text(c?.searchTerm || c?.sourceValue), c?.component || ""].join("|").toLowerCase();

// ---- the codes the loaded SNOMED list offers for a finding ----
// search: a createSearch() of the loaded list, or null when none is loaded. A code the reader already knew comes first, then the best matches.
// What a letter says about a finding is often more than the finding: "Bisoprolol 5 mg once daily", "Blood pressure 132/84 mmHg", "Repeat U&Es in 2
// weeks", "mild left ventricular dysfunction". Doses, numbers, timings and the words around them are taken off, so what is looked up is the thing itself.
// Only numbers that are doses, readings or durations go ("5 mg", "132/84", "97%", "in 2 weeks"); a number that is part of a name stays ("type 2 diabetes").
const NOISE = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|micrograms?|g|ml|mmhg|kg|bpm|mmol\/l|hours?|minutes?|weeks?|days?|months?|years?)\b|\b\d+(?:\.\d+)?\s*%|\b\d+\s*\/\s*\d+\b|\b(?:mmhg|mg|mcg|micrograms?|ml|kg|bpm|once|twice|three times|daily|weekly|monthly|bd|od|tds|qds|nocte|mane|prn|today|tomorrow|repeat|review|continue|increase|decrease|reduce|start|stop|restart|check|please|arrange|book|in|within|for)\b|[^a-z0-9\s-]/gi;
const QUALIFIERS = /\b(?:mild|mildly|moderate|moderately|severe|severely|slight|slightly|minor|marked|borderline|known|likely|possible|probable|suspected|new|ongoing)\b/gi;
// Abbreviations a letter uses, written out so the list can find them (the list knows some, not all)
const ABBREVIATIONS = [
  [/\bu\s*&\s*es?\b/gi, "urea and electrolytes"], [/\bfbc\b/gi, "full blood count"], [/\blfts?\b/gi, "liver function test"], [/\btfts?\b/gi, "thyroid function test"],
  [/\bcxr\b/gi, "chest x-ray"], [/\bcrp\b/gi, "c-reactive protein"], [/\bhba1c\b/gi, "haemoglobin a1c"], [/\bsob\b/gi, "shortness of breath"], [/\bbp\b/gi, "blood pressure"],
  [/\baf\b/gi, "atrial fibrillation"], [/\bmi\b/gi, "myocardial infarction"], [/\bhf\b/gi, "heart failure"], [/\bcopd\b/gi, "chronic obstructive pulmonary disease"],
  [/\bckd\b/gi, "chronic kidney disease"], [/\bt2dm\b/gi, "type 2 diabetes mellitus"], [/\bt1dm\b/gi, "type 1 diabetes mellitus"], [/\buti\b/gi, "urinary tract infection"],
  [/\bdvt\b/gi, "deep vein thrombosis"], [/\bpe\b/gi, "pulmonary embolism"], [/\btia\b/gi, "transient ischaemic attack"], [/\bcva\b/gi, "cerebrovascular accident"],
  [/\bgord\b|\bgerd\b/gi, "gastro-oesophageal reflux disease"], [/\bbmi\b/gi, "body mass index"], [/\becg\b/gi, "electrocardiogram"], [/\becho\b/gi, "echocardiogram"],
];
export const lookupText = (value) => text(ABBREVIATIONS.reduce((s, [pattern, full]) => s.replace(pattern, ` ${full} `), String(value ?? "")).replace(NOISE, " "));
export const withoutQualifiers = (value) => text(String(value ?? "").replace(QUALIFIERS, " "));

// The codes the list offers for a finding, best first. Doses and timings are ignored; if nothing matches closely, the qualifiers ("mild", "suspected")
// are left off too and what that finds is added. A code the reader guessed at is offered only if it is really in the list.
export function optionsFor(candidate, search) {
  if (!search) return [];
  const known = candidate.conceptId ? search.byConcept(candidate.conceptId) : null;
  const query = lookupText(candidate.component ? candidate.preferredTerm : (candidate.sourceValue || candidate.searchTerm));
  let found = query ? search.search(query, { limit: 6 }) : [];
  if (query && (!found.length || found[0].score < 90)) {
    const plain = withoutQualifiers(query);
    if (plain && plain !== query) {
      const again = search.search(plain, { limit: 6 }).map((r) => ({ ...r, score: r.score - 8 }));
      const best = new Map();
      for (const r of [...found, ...again]) if (!best.has(r.conceptId) || best.get(r.conceptId).score < r.score) best.set(r.conceptId, r);
      found = [...best.values()].sort((a, b) => b.score - a.score);
    }
  }
  const list = known ? [...found.filter((f) => f.conceptId === known.conceptId), ...found.filter((f) => f.conceptId !== known.conceptId)] : found;
  return (known && !list.some((f) => f.conceptId === known.conceptId) ? [...list, known] : list).slice(0, 5);
}

// Medicines are coded from the NHS dm+d list (a different list), not from the clinical SNOMED list
export const isMedicine = (candidate) => /medic|drug|prescri/i.test(`${candidate?.sourceLabel || ""} ${candidate?.kind || ""}`);
const asPick = (o) => (o ? { conceptId: o.conceptId, term: o.term, descriptionId: o.descriptionId || "" } : null);

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

export const emptyReview = () => ({ decisions: {}, choices: {}, added: [], log: [] });
const stamp = (now) => (now instanceof Date ? now : new Date(now)).toISOString();

// `pick` is the code being accepted ({ conceptId, term, descriptionId }), from the loaded list or the reader's own; it is kept with the decision
export function decide(review, candidate, decision, { uid = "", name = "", now = new Date(), pick = null } = {}) {
  if (!["accepted", "removed", "suggested"].includes(decision)) throw new Error("A code can be accepted, removed or put back as a suggestion.");
  if (decision === "accepted" && pick && snomedIdProblem(pick.conceptId, "concept")) throw new Error(snomedIdProblem(pick.conceptId, "concept"));
  const key = candidateKey(candidate);
  const base = review || emptyReview();
  const decisions = { ...base.decisions };
  if (decision === "suggested") delete decisions[key]; else decisions[key] = { decision, byUid: uid, byName: name, at: stamp(now), ...(decision === "accepted" && pick ? { chosen: asPick(pick) } : {}) };
  const term = text(pick?.term || candidate.preferredTerm || candidate.searchTerm || candidate.sourceValue);
  return { ...base, decisions, log: [...(base.log || []), { at: stamp(now), byUid: uid, byName: name, action: decision, key, term, ...(pick?.conceptId ? { conceptId: String(pick.conceptId) } : {}) }] };
}

// The coder picks a different match from the list for a finding, before accepting it
export function choose(review, candidate, option, { uid = "", name = "", now = new Date() } = {}) {
  const base = review || emptyReview();
  const key = candidateKey(candidate);
  const choices = { ...(base.choices || {}) };
  if (option) choices[key] = asPick(option); else delete choices[key];
  return { ...base, choices, log: [...(base.log || []), { at: stamp(now), byUid: uid, byName: name, action: option ? "chose a different code" : "went back to the first match", key, term: text(option?.term || candidate.preferredTerm || candidate.searchTerm), ...(option?.conceptId ? { conceptId: String(option.conceptId) } : {}) }] };
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
// `search` (the loaded SNOMED list) is optional: with it each row also has the codes the list offers and the one that will be used if accepted.
export function reviewRows(candidates = [], letter = "", review = null, search = null) {
  return candidates.map((candidate) => {
    const key = candidateKey(candidate);
    const decision = review?.decisions?.[key];
    const evidence = findEvidence(letter, candidate.sourceValue || candidate.searchTerm || candidate.preferredTerm);
    const medicine = isMedicine(candidate);
    const options = medicine ? [] : optionsFor(candidate, search);
    // the reader's own first guess is only used when no list is loaded: with the list, a code that is not in it is not offered
    const own = !search && !medicine && candidate.conceptId ? { conceptId: candidate.conceptId, term: text(candidate.preferredTerm), descriptionId: candidate.descriptionId || "" } : null;
    // what accepting will use: the code chosen with the decision, else the coder's pick, else the first match, else the reader's own
    const pick = medicine ? null : decision?.chosen || review?.choices?.[key] || asPick(options[0]) || own;
    return {
      key, candidate, medicine, term: text(pick?.term || candidate.searchTerm || candidate.sourceValue || candidate.preferredTerm), label: text(candidate.sourceLabel), conceptId: pick?.conceptId || "",
      descriptionId: pick?.descriptionId || "", pick, options, evidence, state: decision?.decision || "suggested", by: decision?.byName || "", at: decision?.at || "",
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
    const chosen = decision?.decision === "accepted" ? decision.chosen : null;
    const code = chosen ? { ...c, conceptId: chosen.conceptId, preferredTerm: chosen.term, descriptionId: chosen.descriptionId || c.descriptionId || null, status: "code_chosen_from_uk_list" } : c;
    out.push(decision?.decision === "accepted" ? { ...code, acceptedByUid: decision.byUid || "unknown", acceptedByName: decision.byName, acceptedAt: decision.at } : c);
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
