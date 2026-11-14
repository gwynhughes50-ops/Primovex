// The patient-identity guard for everything that goes to an AI. Primovex names a patient by EMIS number, date of birth and initials only,
// never by name, and the same rule holds for Ask Primovex: if text looks like it carries a person's name (or another way of identifying a patient:
// an NHS number, phone number, email address, postcode or street address), it is refused before it goes anywhere, and the person is told why.
//
// Pure (no React, no Firestore) so the app and the server use exactly the same rules: the server's copy is generated from this file
// (scripts/build-patient-guard.mjs -> functions/services/patientGuard.cjs).
//
// It is a safety net, not a guarantee: a name detector cannot be perfect (an unusual name typed in lower case can slip through, and a harmless word
// is sometimes taken for a name). So it leans towards refusing, never stores or logs the text it refused, and sits on top of the staff guidance.
// Staff names are fine (colleagues are messaged and looked up by name): pass them in `allow`.

// ---- words that are never taken for a name ----------------------------------------------------------
const NOT_NAMES = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december", "primovex", "emis", "nhs", "gp", "gmpi", "heiw", "hiw", "cqc", "pat", "coshh", "sar", "sars", "ok", "ai", "orb",
  "surgery", "hospital", "clinic", "practice", "health", "board", "wales", "welsh", "english", "england", "cardiff", "swansea", "newport", "wrexham", "bangor",
  "reception", "nurse", "nurses", "doctor", "manager", "partner", "fridge", "freezer", "room", "store", "cupboard", "early", "mid", "late", "admin", "desk", "phones",
  "amoxicillin", "paracetamol", "ibuprofen", "warfarin", "insulin", "salbutamol", "adrenaline", "epipen", "chlorphenamine", "hydrocortisone", "glucagon", "naloxone",
  "bd", "blue", "green", "red", "amber", "yellow", "orange",
]);

// first names that are also ordinary words or months: only counted with a title, an introducer ("patient Mark") or a surname after them
const AMBIGUOUS = new Set([
  "mark", "will", "may", "june", "april", "august", "rose", "grace", "hope", "faith", "joy", "summer", "bill", "pat", "sue", "ray", "frank", "art", "don", "kit", "jean",
  "bob", "jack", "dawn", "daisy", "holly", "ivy", "lily", "violet", "amber", "ruby", "pearl", "jade", "robin", "wendy", "sandy", "chase", "christian", "justice", "major",
  "bay", "ross", "glen", "dean", "guy", "lee", "ben", "sam", "max", "ian", "alan", "mo", "lou", "jo", "jan", "val", "mac", "mel", "gay", "rob", "tom", "tim", "tony",
]);

const FIRST = `aaron abigail adam adrian aisha alan albert alex alexander alfie alice alison amanda amber amelia amy andrea andrew angela anita ann anna anne annie anthony arthur
ashley barbara barry beatrice becky ben benjamin bernard beryl beth bethan betty beverley billy brenda brian bridget bronwen bryn callum carl carol caroline catherine
cerys charlene charles charlie charlotte chloe christine christopher claire colin craig dafydd daniel darren dave david deborah debbie denise dennis derek diane dilys
dominic donald dorothy douglas dylan edith edward eileen elaine eleanor elizabeth ella ellie emily emma eric ethan eve evelyn fatima fiona florence francesca frederick
gareth gary gemma geoffrey george gerald gillian gladys glenys gordon gwen gwyn gwyneth hannah harold harriet harry hayley heather helen henry hilary howard hugh huw
idris imogen iris isaac isabel isabella jacqueline jake james jamie jane janet janice jasmine jason jayne jennifer jenny jeremy jessica jill joan joanne joe john jonathan
joseph josh joshua joyce judith julia julie justin karen kate katherine kathleen kathryn katie keith kelly kenneth kerry kevin kim kirsty laura lauren lawrence leah leanne
leon leonard leslie linda lisa liam lorraine louise lucy luke lynn lynne maggie malcolm margaret maria marian marie marilyn martin mary matthew maureen megan melanie
melissa michael michelle mohammed mohamed muhammad natalie nathan neil nicholas nicola nicole nigel norma olivia oliver owen paige pamela patricia patrick paul paula
pauline peter philip phillip phyllis rachel rebecca reginald rhian rhiannon rhys richard rita robert robin roger ronald rosemary roy russell ruth ryan sally samantha samuel
sandra sara sarah scott sean sharon sheila shirley simon sophie stanley stephanie stephen steven stuart susan suzanne sylvia tamsin teresa terence terry thomas tracey
tracy trevor valerie vanessa vera veronica victoria vincent walter wayne william yvonne zoe ahmed ali hassan hussain ibrahim omar priya raj sanjay sunita aisling siobhan
niamh declan connor kieran gethin ieuan iwan osian elin eirian nia sian lowri mair mererid ceri delyth eleri ffion tegan carys cadi seren`.split(/\s+/);

const LAST = `smith jones williams taylor davies brown evans wilson thomas johnson roberts robinson thompson wright walker white edwards hughes green hall lewis harris clarke
patel jackson wood turner martin cooper hill ward morris moore king watson baker harrison morgan allen james scott phillips lee griffiths bennett parker price rees
jenkins owen richards lloyd powell parry pritchard howells rowlands ellis cook bell murphy khan ahmed hussain ali shah singh begum anderson campbell stewart mitchell
kelly adams collins carter mills shaw marshall simpson foster gibson bailey chapman webb palmer fox hunt barnes fisher cole ford reid grant hamilton graham`.split(/\s+/);

const FIRST_NAMES = new Set(FIRST);
const SURNAMES = new Set(LAST);

const TITLE = /\b(mr|mrs|ms|miss|mx|master|dr|prof|professor|sir|dame|lady|lord)\.?\s+([a-z][a-z'’-]{1,})/gi;
const INTRODUCER = /\b(?:patient|pt|client|resident|complainant|called|named|name\s+is|name\s+was|their\s+name\s+is|known\s+as)\s+(?:is\s+|was\s+)?([a-z][a-z'’-]{1,})(?:\s+([a-z][a-z'’-]{1,}))?/gi;
const WORD = /[A-Za-z][A-Za-z'’-]*/g;

const lower = (value) => String(value || "").toLowerCase().replace(/[’]/g, "'");
const isCapitalised = (word) => /^[A-Z][a-z'’-]+$/.test(word);

// the lowercase words of the staff the person may name, split into their parts
function allowSet(allow = []) {
  const set = new Set();
  for (const name of allow) for (const part of lower(name).split(/[^a-z'-]+/)) if (part.length > 1) set.add(part);
  return set;
}

function nhsNumberValid(digits) {
  if (!/^\d{10}$/.test(digits)) return false;
  const sum = digits.slice(0, 9).split("").reduce((total, d, i) => total + Number(d) * (10 - i), 0);
  const check = 11 - (sum % 11);
  const expected = check === 11 ? 0 : check;
  return expected !== 10 && expected === Number(digits[9]);
}

const KINDS = {
  name: "a person's name",
  nhsNumber: "an NHS number",
  phone: "a phone number",
  email: "an email address",
  postcode: "a postcode",
  address: "a street address",
};

// What is wrong with the text, if anything: [{ kind, text }] (the words as typed, so the person can find and change them).
export function findIdentifiers(input, { allow = [], ignoreNames = false } = {}) {
  const text = String(input ?? "");
  const found = [];
  const add = (kind, value) => { if (value && !found.some((f) => f.kind === kind && f.text === value)) found.push({ kind, text: String(value).trim() }); };
  const ok = allowSet(allow);

  // ---- other ways of identifying someone ----
  for (const m of text.matchAll(/[^\s@]+@[^\s@]+\.[^\s@]+/g)) add("email", m[0]);
  for (const m of text.matchAll(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi)) add("postcode", m[0]);
  for (const m of text.matchAll(/\b\d{1,4}[a-z]?\s+(?:[A-Za-z']+\s+){0,3}(?:road|rd|street|avenue|ave|lane|close|drive|crescent|court|terrace|gardens|grove|walk|hill|view)\b/gi)) add("address", m[0]);
  for (const m of text.matchAll(/(?:\+44[\s-]?|\b0)(?:\d[\s-]?){9,10}\d\b/g)) { const digits = m[0].replace(/\D/g, ""); if (!nhsNumberValid(digits)) add("phone", m[0]); }
  for (const m of text.matchAll(/\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    const before = text.slice(Math.max(0, m.index - 14), m.index).toLowerCase();
    if (nhsNumberValid(digits) && !/emis/.test(before)) add("nhsNumber", m[0]);
  }

  // ---- names ----  (skipped for a command that is about a colleague by name, which only ever looks the colleague up)
  if (ignoreNames) return sorted(found);
  // "Mrs Jones", "Dr Patel": a name if what follows is capitalised or one we know ("miss the deadline" and "master list" are not)
  for (const m of text.matchAll(TITLE)) {
    const part = lower(m[2]);
    if (ok.has(part) || NOT_NAMES.has(part)) continue;
    if (isCapitalised(m[2]) || FIRST_NAMES.has(part) || SURNAMES.has(part)) add("name", m[0]);
  }
  for (const m of text.matchAll(INTRODUCER)) {
    const first = lower(m[1]);
    if (ok.has(first) || NOT_NAMES.has(first)) continue;
    // "patient called Mary", "named Jones": a name if it is one we know, or capitalised in what was typed
    const typed = m[1];
    if (FIRST_NAMES.has(first) || SURNAMES.has(first) || isCapitalised(typed)) add("name", [m[1], m[2] && (FIRST_NAMES.has(lower(m[2])) || SURNAMES.has(lower(m[2])) || isCapitalised(m[2])) ? m[2] : ""].join(" "));
  }
  const words = [...text.matchAll(WORD)].map((m) => ({ word: m[0], lower: lower(m[0]), index: m.index, end: m.index + m[0].length }));
  const sentenceStart = (i) => i === 0 || /[.!?:]\s*$/.test(text.slice(0, words[i].index));
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (NOT_NAMES.has(w.lower)) continue;
    const next = words[i + 1];
    const nextIsName = next && !ok.has(next.lower) && !NOT_NAMES.has(next.lower) && (FIRST_NAMES.has(next.lower) || SURNAMES.has(next.lower));
    // a first name followed by a surname, in any case ("margaret jones"), even when the first name is a colleague's: it is the surname that is not
    if (FIRST_NAMES.has(w.lower) && next && SURNAMES.has(next.lower) && !ok.has(next.lower) && !NOT_NAMES.has(next.lower)) { add("name", `${w.word} ${next.word}`); continue; }
    if (ok.has(w.lower)) continue;
    // a first name or surname typed as a name (capital letter) in the middle of a sentence
    if (isCapitalised(w.word) && !sentenceStart(i)) {
      if (FIRST_NAMES.has(w.lower) && !AMBIGUOUS.has(w.lower)) { add("name", nextIsName && isCapitalised(next.word) ? `${w.word} ${next.word}` : w.word); continue; }
      if (SURNAMES.has(w.lower) && words[i - 1] && isCapitalised(words[i - 1].word) && FIRST_NAMES.has(words[i - 1].lower) && !ok.has(words[i - 1].lower)) add("name", `${words[i - 1].word} ${w.word}`);
    }
  }
  return sorted(found);
}

// a name is the first thing to point out
const ORDER = ["name", "nhsNumber", "phone", "email", "postcode", "address"];
const sorted = (found) => found.map((f, i) => ({ f, i })).sort((x, y) => ORDER.indexOf(x.f.kind) - ORDER.indexOf(y.f.kind) || x.i - y.i).map(({ f }) => f);

// The text with what was found blanked out, so what stays on screen and in the conversation holds none of it
export function redactText(input, problems = []) {
  let text = String(input ?? "");
  for (const p of problems) text = text.split(p.text).join("[removed]");
  return text;
}

// { ok, problems, message }. `message` is what to tell the person: what was found, in their own words, and what to do instead.
export function checkText(input, options = {}) {
  const problems = findIdentifiers(input, options);
  if (!problems.length) return { ok: true, problems: [], message: "" };
  return { ok: false, problems, message: blockedMessage(problems) };
}

export function blockedMessage(problems) {
  const kinds = [...new Set(problems.map((p) => p.kind))];
  const what = kinds.map((k) => KINDS[k]).join(", ").replace(/, ([^,]*)$/, " and $1");
  const shown = problems.slice(0, 3).map((p) => `“${p.text}”`).join(", ");
  return `I can't process this because it looks like it contains ${what} (${shown}${problems.length > 3 ? " and more" : ""}). Primovex only uses an EMIS number, a date of birth and initials to identify a patient, never a name or other personal details. Please change it and try again.`;
}
