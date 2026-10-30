// What the clean one-page ClinFlow summary says in fixed words, and the Docman Intellisense templates that recognise them. Docman's Intellisense (Settings > Filing > Intellisense templates)
// searches the text of a document for a template's keywords (not case sensitive, exact spelling and spacing, on one line) and, when they match, fills in the Filing Criteria and Filing
// Options of that template. A template's clinical code is one fixed code, so it cannot carry the codes for each letter: those stay on the summary page for the coder.
//
// The words below are the only ones the summary page promises never to change. Change them here, in the sheet, and in Docman together.

export const DOCMAN_HEADING = "CLINFLOW LETTER SUMMARY";
export const DOCMAN_ACTION_PREFIX = "PRACTICE ACTION: ";
export const DOCMAN_ACTION_YES = `${DOCMAN_ACTION_PREFIX}YES`;
export const DOCMAN_ACTION_NONE = `${DOCMAN_ACTION_PREFIX}NONE`;
export const DOCMAN_URGENT = "MARKED URGENT";

// The templates to create in Docman. keywords: what to type under Keywords; match: "Any" or "All". Nothing here picks a folder, an organisation, a department, a person or a clinical code:
// a letter's folder depends on the letter, and those fields stay for the person filing it to choose.
export const DOCMAN_INTELLISENSE = [
  {
    name: "ClinFlow: action needed",
    description: "A ClinFlow summary where the practice has something to do",
    keywords: [DOCMAN_ACTION_YES],
    match: "Any",
    options: { startCoding: true, emisLink: true },
    notes: "Starts clinical coding straight away, so the coder goes from filing to the codes on the summary page.",
  },
  {
    name: "ClinFlow: no action needed",
    description: "A ClinFlow summary where the person confirmed the practice has nothing to do",
    keywords: [DOCMAN_ACTION_NONE],
    match: "Any",
    options: { startCoding: false, emisLink: true },
    notes: "Does not start coding. A letter with nothing for the practice to do usually only needs filing.",
  },
];

// Phrases that must never be used as keywords, because they are on every summary or on ordinary letters
export const DOCMAN_AVOID = ["ACTION NEEDED", "SUMMARY", "URGENT", "MEDICINES", "CODES TO ADD"];
