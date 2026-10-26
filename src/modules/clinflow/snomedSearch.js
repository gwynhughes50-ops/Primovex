// Finds SNOMED codes in the loaded UK list for what a letter says. Pure (no screens, no storage), and it never invents a code: every answer is a
// concept in the list, with the description ID of the term shown. Words are matched, not guessed at, so a clinician sees why each one came up.

const STOP = new Set(["the", "a", "an", "of", "and", "or", "with", "for", "to", "in", "on", "at", "is", "was", "has", "had", "due", "mr", "mrs", "dr"]);

// On a tie, what a letter usually means comes first: a disorder or finding before a situation ("history of", "no"), a procedure or a therapy.
const TAG_BIAS = { disorder: 2, finding: 2, "observable entity": 1, "medicinal product": 1, product: 0, "medicinal product form": 0, procedure: -1, "regime/therapy": -2, situation: -3 };

export const tokens = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));

// Turns a loaded list into something quick to search: each word points at the codes whose terms contain it
export function createSearch(index) {
  const concepts = index?.concepts || [];
  const postings = new Map();
  const terms = concepts.map((c) => [[c[1], c[2]], ...(c[4] || [])]);
  const words = terms.map((list) => list.map(([term]) => tokens(term)));
  words.forEach((perTerm, i) => {
    const seen = new Set();
    for (const list of perTerm) for (const w of list) if (!seen.has(w)) { seen.add(w); if (!postings.has(w)) postings.set(w, []); postings.get(w).push(i); }
  });
  const sortedWords = [...postings.keys()].sort();
  const byId = new Map(concepts.map((c, i) => [c[0], i]));

  // codes with a word starting with `w` (for words long enough that a different ending is likely: "fibrillating" / "fibrillation")
  function withPrefix(w) {
    if (w.length < 5) return postings.get(w) || [];
    const stem = w.slice(0, Math.max(5, w.length - 3));
    let lo = 0; let hi = sortedWords.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedWords[mid] < stem) lo = mid + 1; else hi = mid; }
    const out = new Set(postings.get(w) || []);
    for (let i = lo; i < sortedWords.length && sortedWords[i].startsWith(stem); i += 1) for (const c of postings.get(sortedWords[i])) out.add(c);
    return [...out];
  }

  function scoreConcept(i, queryTokens, exact) {
    let best = 0;
    let matched = terms[i][0][0];
    words[i].forEach((termWords, t) => {
      const has = queryTokens.filter((q) => termWords.includes(q) || termWords.some((w) => w.length > 4 && q.length > 4 && (w.startsWith(q.slice(0, Math.max(5, q.length - 3))) || q.startsWith(w.slice(0, Math.max(5, w.length - 3)))))).length;
      if (!has) return;
      const coverage = has / queryTokens.length;
      const tidy = termWords.length ? Math.min(1, queryTokens.length / termWords.length) : 0;
      const isExact = termWords.length === queryTokens.length && has === queryTokens.length && termWords.join(" ") === queryTokens.join(" ");
      const score = isExact ? 100 : coverage === 1 ? 60 + 35 * tidy : 40 * coverage * (0.5 + 0.5 * tidy);
      const bonus = t === 0 ? 3 : 0;
      if (score + bonus > best) { best = score + bonus; matched = terms[i][t][0]; }
    });
    return { score: best ? best + (TAG_BIAS[index.tags[concepts[i][3]]] || 0) : 0, matched };
  }

  return {
    size: concepts.length,
    // the codes that best match some words: [{ conceptId, term, descriptionId, tag, matched, score }]
    search(query, { limit = 6, tags = null, minScore = 30 } = {}) {
      const q = tokens(query);
      if (!q.length) return [];
      const lists = q.map((w) => withPrefix(w));
      let pool;
      if (lists.every((l) => l.length)) { const sets = lists.map((l) => new Set(l)); pool = [...sets[0]].filter((i) => sets.every((s) => s.has(i))); }
      if (!pool || !pool.length) { const seen = new Set(); pool = lists.flat().filter((i) => !seen.has(i) && seen.add(i)); }
      if (pool.length > 4000) pool = pool.slice(0, 4000);
      const allowed = tags ? new Set(tags.map((t) => (index.tags || []).indexOf(t))) : null;
      return pool
        .filter((i) => !allowed || allowed.has(concepts[i][3]))
        .map((i) => ({ i, ...scoreConcept(i, q) }))
        .filter((r) => r.score >= minScore)
        .sort((a, b) => b.score - a.score || concepts[a.i][1].length - concepts[b.i][1].length)
        .slice(0, limit)
        .map(({ i, score, matched }) => ({ conceptId: concepts[i][0], term: concepts[i][1], descriptionId: concepts[i][2], tag: index.tags[concepts[i][3]] || "", matched, score: Math.round(score) }));
    },
    // one code by its ID, or null
    byConcept(id) {
      const i = byId.get(String(id));
      return i === undefined ? null : { conceptId: concepts[i][0], term: concepts[i][1], descriptionId: concepts[i][2], tag: index.tags[concepts[i][3]] || "" };
    },
  };
}
