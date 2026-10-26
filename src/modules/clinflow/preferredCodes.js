// The practice's own choice of code for findings that SNOMED has several codes for. When a finding is one of these, its preferred code comes first
// (if it is in the loaded list), marked as the preferred code; the other matches are still offered, so the coder can always choose differently.
//
// Add a line here to make a code the first choice for some words. `words` are the ways a letter writes it (lower case, no punctuation); the finding
// matches when it is one of them, or starts with one followed by more words ("CRP 4 mg/L", "C-reactive protein was 4"). `conceptId` is the SNOMED code.

export const PREFERRED_CODES = [
  { words: ["crp", "c reactive protein", "c-reactive protein", "c reactive protein level", "c reactive protein measurement"], conceptId: "55235003", name: "C-reactive protein measurement" },
];

const plain = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// the preferred code for a finding's words, or null
export function preferredFor(lookup, table = PREFERRED_CODES) {
  const said = plain(lookup);
  if (!said) return null;
  for (const entry of table) {
    for (const w of entry.words) {
      const phrase = plain(w);
      if (said === phrase || said.startsWith(`${phrase} `)) return entry;
    }
  }
  return null;
}
