// Finds SNOMED codes in the loaded UK list for what a letter says. Pure (no screens, no storage), and it never invents a code: every answer is a
// concept in the list, with the description ID of the term shown. Words are matched, not guessed at, so a clinician sees why each one came up.

const STOP = new Set(["the", "a", "an", "of", "and", "or", "with", "for", "to", "in", "on", "at", "is", "was", "has", "had", "due", "mr", "mrs", "dr"]);

// On a tie, what a letter usually means comes first: a disorder or finding before a situation ("history of", "no"), a procedure or a therapy.
const TAG_BIAS = { disorder: 2, finding: 2, "observable entity": 1, "medicinal product": 1, product: 0, "medicinal product form": 0, procedure: -1, "regime/therapy": -2, situation: -3 };

const UNLESS_ASKED = new Set(["fetal", "foetal", "neonatal", "congenital", "paediatric", "pediatric", "juvenile", "maternal", "antenatal", "postnatal", "perinatal"]);

// The start of a word that a different ending still shares ("fibrillating" / "fibrillation"). Short words must match closely, so a brand name
// ("cardicor") does not find a different one that happens to start the same ("cardioace").
const stemOf = (w) => w.slice(0, w.length >= 9 ? w.length - 3 : Math.max(5, w.length - 2));

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

  // ---- spelling: a word the list does not have is read as the nearest word it does have (one slip in a short word, two in a long one) ----
  const byFirst = new Map();
  for (const w of sortedWords) if (/^[a-z]{4,}$/.test(w)) { if (!byFirst.has(w[0])) byFirst.set(w[0], []); byFirst.get(w[0]).push(w); }
  const fixes = new Map();
  function distance(a, b, max) { // letters added, left out, changed, or two next to each other swapped
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null; let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
      const row = [i]; let low = i;
      for (let j = 1; j <= b.length; j += 1) {
        let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        row.push(v); if (v < low) low = v;
      }
      if (low > max) return max + 1;
      prev2 = prev; prev = row;
    }
    return prev[b.length];
  }
  function nearest(w) {
    if (!/^[a-z]{4,}$/.test(w)) return null; // numbers, strengths and short words are never "corrected"
    if (fixes.has(w)) return fixes.get(w);
    const max = w.length <= 7 ? 1 : 2;
    let best = null;
    for (const c of byFirst.get(w[0]) || []) {
      if (Math.abs(c.length - w.length) > max) continue;
      const d = distance(w, c, max);
      if (d > max) continue;
      const n = postings.get(c).length;
      if (!best || d < best.d || (d === best.d && n > best.n)) best = { word: c, d, n };
    }
    const found = best ? best.word : null;
    fixes.set(w, found);
    return found;
  }

  // codes with a word starting with `w` (for words long enough that a different ending is likely: "fibrillating" / "fibrillation")
  function withPrefix(w) {
    if (w.length < 6) return postings.get(w) || [];
    const stem = stemOf(w);
    let lo = 0; let hi = sortedWords.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedWords[mid] < stem) lo = mid + 1; else hi = mid; }
    const out = new Set(postings.get(w) || []);
    for (let i = lo; i < sortedWords.length && sortedWords[i].startsWith(stem); i += 1) for (const c of postings.get(sortedWords[i])) out.add(c);
    return [...out];
  }

  function scoreConcept(i, queryTokens, exact) {
    let best = 0;
    let matched = terms[i][0][0];
    // a term written "COPD - Chronic obstructive pulmonary disease" is also the name after the dash: the abbreviation is not part of what it is called
    const named = (t) => { const m = /^[A-Za-z0-9&]{2,8} - (.+)$/.exec(terms[i][t][0]); return m ? tokens(m[1]) : null; };
    const variants = [];
    words[i].forEach((termWords, t) => { variants.push([termWords, t, 0]); const after = named(t); if (after?.length) variants.push([after, t, 1]); });
    variants.forEach(([termWords, t, penalty]) => {
      const has = queryTokens.filter((q) => termWords.includes(q) || termWords.some((w) => w.length > 5 && q.length > 5 && (w.startsWith(stemOf(q)) || q.startsWith(stemOf(w))))).length;
      if (!has) return;
      const coverage = has / queryTokens.length;
      const tidy = termWords.length ? Math.min(1, queryTokens.length / termWords.length) : 0;
      const isExact = termWords.length === queryTokens.length && has === queryTokens.length && termWords.join(" ") === queryTokens.join(" ");
      const score = isExact ? 100 : coverage === 1 ? 60 + 35 * tidy : 40 * coverage * (0.5 + 0.5 * tidy);
      const bonus = (t === 0 ? 3 : 0) - penalty;
      if (score + bonus > best) { best = score + bonus; matched = terms[i][t][0]; }
    });
    // a code for an unborn or newborn baby, a child or a pregnancy is not what a letter means unless it says so
    const flagged = (words[i][0] || []).some((w) => UNLESS_ASKED.has(w)) && !queryTokens.some((q) => UNLESS_ASKED.has(q)) ? -8 : 0;
    return { score: best ? best + (TAG_BIAS[index.tags[concepts[i][3]]] || 0) + flagged : 0, matched };
  }

  return {
    size: concepts.length,
    // the codes that best match some words: [{ conceptId, term, descriptionId, tag, matched, score }]
    search(query, { limit = 6, tags = null, minScore = 30 } = {}) {
      const said = tokens(query);
      if (!said.length) return [];
      // a word that is in no code is read as the nearest word that is, and the correction is reported with every answer
      const corrected = [];
      const q = said.map((w) => {
        if (postings.has(w)) return w;
        const fix = nearest(w);
        if (fix) { corrected.push({ from: w, to: fix }); return fix; }
        return w;
      });
      const lists = q.map((w) => withPrefix(w));
      let pool;
      if (lists.every((l) => l.length)) { const sets = lists.map((l) => new Set(l)); pool = [...sets[0]].filter((i) => sets.every((s) => s.has(i))); }
      if (!pool || !pool.length) { const seen = new Set(); pool = lists.flat().filter((i) => !seen.has(i) && seen.add(i)); }
      if (pool.length > 4000) pool = pool.slice(0, 4000);
      const allowed = tags ? new Set(tags.map((t) => (index.tags || []).indexOf(t))) : null;
      return pool
        .filter((i) => !allowed || allowed.has(concepts[i][3]))
        .map((i) => { const r = scoreConcept(i, q); return { i, ...r, score: r.score ? r.score - 5 * corrected.length : 0 }; })
        .filter((r) => r.score >= minScore)
        .sort((a, b) => b.score - a.score || concepts[a.i][1].length - concepts[b.i][1].length)
        .slice(0, limit)
        .map(({ i, score, matched }) => ({ conceptId: concepts[i][0], term: concepts[i][1], descriptionId: concepts[i][2], tag: index.tags[concepts[i][3]] || "", matched, score: Math.round(score), ...(corrected.length ? { corrected } : {}) }));
    },
    // one code by its ID, or null
    byConcept(id) {
      const i = byId.get(String(id));
      return i === undefined ? null : { conceptId: concepts[i][0], term: concepts[i][1], descriptionId: concepts[i][2], tag: index.tags[concepts[i][3]] || "" };
    },
  };
}
