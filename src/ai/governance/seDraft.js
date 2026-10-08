import { createProposal } from "../../orb/actionProposals";
import { SE_CATEGORIES, SE_HARM_LEVELS, friendly, validateReport } from "../../modules/governance/seModel";

// Helping someone report a significant event by talking to the Orb. The Orb works out what it can
// from the sentence (what happened, when, where, the kind of event, the harm, an EMIS number if
// there is one), says what it understood on a card, and reports it only when the person presses
// the button. It never guesses the harm, and it refuses anything that looks like a person's name.
// Pure, so it can be tested.

const VERB = "(?:report|log|raise|submit|record|file|write up|add|put in)";
const THING = "(?:significant events?|near miss(?:es)?|incident|se)";

// "report a significant event: ...", "log a near miss", "I need to report an incident ..."
export function looksLikeSeReport(text) {
  const t = String(text || "").toLowerCase();
  if (/^\s*(?:significant event|near miss|se)\s*[:\-]/.test(t)) return true;
  return new RegExp(`\\b${VERB}\\b[^.:]{0,40}\\b${THING}\\b`).test(t);
}

// A person's name in the text: a title followed by a name, or "called/named X". Not exhaustive:
// the panel also tells people never to type names.
export function containsName(text) {
  const t = String(text || "");
  return /\b(?:Mr|Mrs|Ms|Miss|Master|Dr|Prof)\.?\s+[A-Z][a-z]{2,}/.test(t)
    || /\b(?:called|named|name is|known as)\s+[A-Z][a-z]{2,}/.test(t);
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// When it happened. Returns { date: "YYYY-MM-DD", assumed } and never a future date.
export function parseEventDate(text, now = new Date()) {
  const t = String(text || "").toLowerCase();
  const day = (offset) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset); return iso(d); };
  if (/\byesterday\b/.test(t)) return { date: day(1), assumed: false };
  if (/\b(today|this morning|this afternoon|this evening|earlier today|just now)\b/.test(t)) return { date: day(0), assumed: false };
  const dm = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join("|")})(?:\\s+(\\d{4}))?\\b`));
  if (dm) {
    const year = Number(dm[3] || now.getFullYear());
    let d = new Date(year, MONTHS.indexOf(dm[2]), Number(dm[1]));
    if (!dm[3] && d.getTime() > now.getTime()) d = new Date(year - 1, d.getMonth(), d.getDate());
    return { date: iso(d), assumed: false };
  }
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    let year = slash[3] ? Number(slash[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    let d = new Date(year, Number(slash[2]) - 1, Number(slash[1]));
    if (!slash[3] && d.getTime() > now.getTime()) d = new Date(year - 1, d.getMonth(), d.getDate());
    if (!Number.isNaN(d.getTime())) return { date: iso(d), assumed: false };
  }
  const wd = t.match(new RegExp(`\\b(?:on|last)\\s+(${WEEKDAYS.join("|")})\\b`));
  if (wd) {
    const back = (now.getDay() - WEEKDAYS.indexOf(wd[1]) + 7) % 7 || 7;
    return { date: day(back), assumed: false };
  }
  return { date: day(0), assumed: true };
}

// Only what the person actually said: no harm is ever guessed.
export function parseHarm(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(severe|serious|permanent)\s+harm\b|\bdied\b|\bdeath\b|\bfatal/.test(t)) return "severe";
  if (/\bmoderate\s+harm\b/.test(t)) return "moderate";
  if (/\b(low|minor|slight)\s+harm\b/.test(t)) return "low";
  if (/\bno\s+harm\b|\bnear\s+miss\b|\bnobody\s+(?:was\s+)?(?:harmed|hurt)\b|\bno\s+one\s+(?:was\s+)?(?:harmed|hurt)\b|\bno\s+patient\s+harm\b/.test(t)) return "none";
  return null;
}

const CATEGORY_WORDS = [
  ["medication", ["vaccine", "vaccin", "medication", "medicine", "drug", "prescription", "dose", "dosage", "tablet", "injection", "script"]],
  ["diagnosis_or_results", ["result", "blood test", "test result", "x-ray", "scan", "diagnos", "missed diagnosis", "referral"]],
  ["information_governance", ["confidential", "data breach", "wrong patient", "wrong email", "emailed", "records", "gdpr", "privacy", "letter went"]],
  ["safeguarding", ["safeguard", "abuse", "neglect", "vulnerable"]],
  ["infection_control", ["infection", "needlestick", "sharps", "spillage", "contaminat", "hygiene"]],
  ["equipment_or_premises", ["fridge", "freezer", "equipment", "leak", "broken", "premises", "door", "lift", "alarm", "power", "temperature"]],
  ["access_or_appointments", ["appointment", "waiting", "access", "booking", "triage"]],
  ["communication", ["communicat", "message", "told", "handover", "rude", "phone call", "letter"]],
  ["staffing", ["staffing", "short staffed", "absence", "rota"]],
  ["clinical_care", ["clinical", "treatment", "examination", "fall", "collapsed", "wound", "care"]],
];

export function guessCategory(text) {
  const t = String(text || "").toLowerCase();
  for (const [category, words] of CATEGORY_WORDS) if (words.some((w) => t.includes(w))) return category;
  return "other";
}

const EMIS = /\bemis\s*(?:number|no\.?|#)?\s*[:#]?\s*(\d{4,})\b|\b(\d{6,})\b/i;

// The whole phrase to swap for "the patient": "patient EMIS number 1234" or a bare long number.
const EMIS_PHRASE = /(?:\bthe\s+)?(?:\bpatient\s+)?(?:\bemis\s*(?:number|no\.?|#)?\s*[:#]?\s*\d{4,}\b|\b\d{6,}\b)/i;

const LEAD_IN = new RegExp(`^\\s*(?:please\\s+|can you\\s+|could you\\s+|i(?:'d| would) like to\\s+|i need to\\s+|i want to\\s+|help me\\s+)*${VERB}\\s+(?:a\\s+|an\\s+|the\\s+|this\\s+)?${THING}\\s*(?:please\\s*)?(?:for me\\s*)?(?:please\\s*)?(?:[:\\-]|that|about|where|when|which|involving)?\\s*`, "i");

// The "what happened" part of the sentence.
export function extractDescription(text) {
  let t = String(text || "").trim();
  const colon = t.indexOf(":");
  if (colon > -1 && colon < 80) t = t.slice(colon + 1);
  else t = t.replace(LEAD_IN, "");
  return t.replace(/^\s*[-:,]\s*/, "").trim();
}

function titleFrom(description) {
  const first = description.split(/[.;\n]/)[0].replace(/\s+/g, " ").trim();
  const cut = first.length > 80 ? `${first.slice(0, 77).replace(/\s+\S*$/, "")}…` : first;
  return cut ? cut.charAt(0).toUpperCase() + cut.slice(1) : "";
}

// spaces: [{ id, name }] from the practice's own registry. The longest name found in the sentence wins.
export function findSpace(text, spaces = []) {
  const t = String(text || "").toLowerCase();
  const hits = spaces.filter((s) => s.name && t.includes(String(s.name).toLowerCase())).sort((a, b) => b.name.length - a.name.length);
  return hits[0] || null;
}

// What the Orb understood from a sentence, plus what is missing.
export function parseSeReport(text, { spaces = [], now = new Date() } = {}) {
  const original = String(text || "");
  const emisMatch = original.match(EMIS);
  const emisNumber = emisMatch ? (emisMatch[1] || emisMatch[2]) : "";
  const withoutEmis = emisNumber ? original.replace(EMIS_PHRASE, "the patient") : original;
  // A harm level tapped or typed at the end is kept in its own field, not repeated in the description.
  const description = extractDescription(withoutEmis).replace(/[,;]?\s*(?:no|low|minor|moderate|severe|serious)\s+harm\.?\s*$/i, "").trim();
  const harmSource = extractDescription(withoutEmis);
  const when = parseEventDate(description, now);
  const space = findSpace(description, spaces);
  return {
    description,
    title: titleFrom(description),
    eventDate: when.date,
    dateAssumed: when.assumed,
    category: guessCategory(description),
    harm: parseHarm(harmSource),
    locationId: space?.id || "",
    locationName: space?.name || "",
    patientInvolved: Boolean(emisNumber),
    emisNumber,
  };
}

const ask = (...items) => items.filter(Boolean);
const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

export function buildSeReportDraft(question, { spaces = [], now = new Date() } = {}) {
  if (containsName(question)) {
    return { text: "That looks like it has a person's name in it. Please don't type names into the Orb. Say it again using roles (the nurse, a receptionist) and, for a patient, their EMIS number only.", followUps: [] };
  }
  const parsed = parseSeReport(question, { spaces, now });
  if (parsed.description.length < 12) {
    return {
      text: "Tell me what happened, in a sentence or two, and I'll set it up for you to confirm. For example: \"Report a significant event: the wrong vaccine was drawn up in Treatment Room 1 yesterday, no harm.\" No names please, and use an EMIS number for any patient.",
      followUps: [],
    };
  }
  // Never guess how much harm was caused: ask, with the answers as one-tap replies.
  if (!parsed.harm) {
    const base = String(question).trim().replace(/[.\s]+$/, "");
    // A traffic light of choices (green to red). Each carries the whole sentence plus the harm level.
    const chips = base.length <= 400 ? SE_HARM_LEVELS.map((h) => ({ label: h.label, hint: h.hint, color: h.color, ask: `${base}, ${h.label.toLowerCase()}` })) : [];
    return { text: "How much harm did it cause? Tap one. A near miss is \"no harm\".", followUps: chips };
  }
  const form = {
    title: parsed.title,
    description: parsed.description,
    immediateAction: "",
    eventDate: parsed.eventDate,
    category: SE_CATEGORIES.includes(parsed.category) ? parsed.category : "other",
    harm: parsed.harm,
    locationId: parsed.locationId,
    locationName: parsed.locationName,
    patientInvolved: parsed.patientInvolved,
    emisNumber: parsed.emisNumber,
    patientInitials: "",
    dateOfBirth: "",
  };
  const problem = validateReport(form);
  if (problem) return { text: problem, followUps: [] };

  const harmLabel = SE_HARM_LEVELS.find((h) => h.key === form.harm)?.label || form.harm;
  const proposal = createProposal({
    kind: "significant-event",
    title: "Report this significant event",
    lines: [
      `What happened: ${clip(form.description, 220)}`,
      `When: ${new Date(`${form.eventDate}T12:00:00`).toLocaleDateString("en-GB")}${parsed.dateAssumed ? " (assumed today; say 'yesterday' or a date if not)" : ""}`,
      `Where: ${form.locationName || "Not in a room, or not named"}`,
      `Kind: ${friendly(form.category)}`,
      `Harm: ${harmLabel}`,
      form.patientInvolved ? `Patient: EMIS ${form.emisNumber}` : "Patient: none given",
      "No names. If anyone is named above, cancel and say it again without.",
    ],
    requiredCapability: null,
    confirmLabel: "Report event",
    params: { form },
  });
  return {
    text: "I've set this up as a significant event for you to check. Nothing has been reported yet. You can add more detail later on the Significant events page.",
    proposal,
    followUps: ask(),
  };
}
