// Things a letter can be that need more than filing: a complaint or concern, a legal or ombudsman letter, an incident, a safeguarding worry, a referral the
// practice is asked to make, a suspected-cancer pathway, a letter sent to the wrong practice, a death, a change of registration. And the patient checks: a
// common name, missing identifiers, a number that fails its check digit, several people named in one letter. Pure (no screens).
//
// Everything here only looks at the words of the letter and the identifiers ClinFlow found, and only ever SUGGESTS: it tells the person what to check and
// who to pass the letter to. Matching a patient against the practice record is not possible yet (there is no link to the clinical system); the hook for it is
// `matchPatient` below, so that when there is one the checks can say "found in the record" instead of "check by hand".
import { nhsNumberValid } from "./docmanPayload.js";

const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export const OWNERS = { admin: "Admin", gp: "GP", manager: "Practice manager", safeguarding: "Safeguarding lead" };

// "no safeguarding concerns", "denies self-harm": a mention that is ruled out is not a signal
const NEGATION = /\b(?:no|not|nil|denies|denied|without|negative for|free of|excluded|ruled out|nothing to suggest)\b[^.;\n]{0,30}$/i;
function find(source, regex) {
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  for (const m of source.matchAll(re)) {
    if (NEGATION.test(source.slice(Math.max(0, m.index - 40), m.index))) continue;
    const from = Math.max(0, m.index - 45); const to = Math.min(source.length, m.index + m[0].length + 60);
    return { match: text(m[0]), quote: `${from > 0 ? "…" : ""}${text(source.slice(from, to))}${to < source.length ? "…" : ""}` };
  }
  return null;
}

// ---- what the letter is about ----
const COMPLAINT = /\b(?:formal(?:ly)? complain\w*|written complaint|make a complaint|lodge a complaint|raise a complaint|wish to complain|writing to complain|i(?:'m| am) complaining|my complaint|this complaint|complaint (?:about|against|regarding|re\b|letter|procedure|handling)|concerns? (?:about|regarding|over) (?:the |my |his |her |their )?(?:care|treatment|service|conduct|behaviour|attitude|doctor|nurse|gp|staff|practice|surgery|receptionist|appointment)|not happy with|unhappy with|dissatisfied|unacceptable|appalled|disgusted|poor (?:care|service|treatment)|let down|putting things right|\bpals\b|patient advice and liaison)\b/i;
const LEGAL = /\b(?:solicitors?|legal action|legal claim|clinical negligence|medical negligence|negligen(?:ce|t)|compensation claim|claim for compensation|ombudsman|\bphso\b|\bpsow\b|coroner|inquest|healthcare inspectorate|\bhiw\b|\bcqc\b|general medical council|\bgmc\b|subject access request)\b/i;
const INCIDENT = /\b(?:serious incident|never event|datix|significant event|duty of candour|adverse event|incident report|medication error|prescribing error|wrong (?:patient|drug|dose|medication|medicine|side|result)|incorrectly (?:given|prescribed|administered|recorded|filed)|given in error|mistake was made|an error (?:was|has been) made|near miss)\b/i;
const SAFEGUARDING = /\b(?:safeguarding|child protection|domestic (?:abuse|violence)|vulnerable adult|adult at risk|\bmarac\b|non[\s-]accidental|neglect\w*|abuse\w*|self[\s-]harm\w*|suicid\w*|overdose|risk to (?:self|others|children))\b/i;
const CANCER = /\b(?:2ww|two[\s-]week[\s-]wait|suspected cancer|urgent suspected cancer|\busc\b|cancer pathway|2 week wait)\b/i;
const MISDIRECTED = /\b(?:sent in error|misdirected|wrongly (?:addressed|sent)|incorrectly addressed|not (?:one of )?your patients?|wrong (?:practice|surgery|gp)|please disregard|not registered (?:with|at) (?:your|this)|not known to (?:your |this )?(?:practice|surgery)|apologies? for the error)\b/i;
const DEATH = /\b(?:has died|passed away|deceased|date of death|death certificate|died (?:on|at|in|peacefully|suddenly)|death of (?:mr|mrs|ms|miss|the patient)|late (?:mr|mrs|ms|miss))\b/i;
const REGISTRATION = /\b(?:has moved|moved (?:to|away)|changed address|no longer (?:registered|lives)|de-?registered|transferred to|left the practice|new address)\b/i;
// a referral someone is being asked to make ("please refer", "GP to refer", "would benefit from referral"), and one already made ("we have referred")
const REFERRAL_NEEDED = /\b(?:please (?:could you )?(?:refer|consider (?:a )?referr\w*|arrange (?:a )?referral)|(?:gp|practice|you|surgery) (?:to|should|could|may wish to|will need to|need to) (?:please )?refer|recommend(?:ed)? (?:a )?(?:onward )?referral|would benefit from (?:a )?(?:onward )?referral|needs? (?:an? )?(?:onward )?referral|requires? (?:an? )?(?:onward )?referral|should be referred|suggest (?:a )?(?:onward )?referral|consider (?:a )?(?:onward )?referral|onward referral|ask (?:the )?gp to refer)\b/i;
const REFERRAL_MADE = /\b(?:(?:we|i|the (?:team|clinic|department)) (?:have|has) (?:now )?(?:made a )?referr\w*|has (?:now )?been referred|have been referred|was referred|referral (?:has been|was) (?:made|sent|completed)|i have (?:made|sent) (?:a )?referral)\b/i;
const REFER_TO = /\brefer(?:red|ral)?\s+(?:[A-Za-z.'-]+\s+){0,3}?to (?:the |a |an )?([A-Za-z][A-Za-z /&-]{2,60}?)(?=[.,;:]| for | as | with | urgently| and |$)/i;

// What the letter says it needs, as steps: [{ id, rank, owner, tone, title, detail, because }]. Lower rank comes first; 0 is "do this now".
export function letterSignals(letter) {
  const s = String(letter ?? "");
  if (!s.trim()) return [];
  const out = [];
  const add = (id, rank, owner, tone, title, detail, hit) => out.push({ id, rank, owner, tone, title, detail, because: hit?.quote || "", matched: hit?.match || "" });

  const misdirected = find(s, MISDIRECTED);
  if (misdirected) add("misdirected", 0.5, OWNERS.manager, "gp", "This letter may not be for this practice: stop and tell the practice manager", "It says it was sent in error or is about someone who is not your patient. Do not read it further, file it, or add anything to a record. The practice manager decides how to report it: it may be a data breach.", misdirected);

  const safeguarding = find(s, SAFEGUARDING);
  if (safeguarding) add("safeguarding", 1.1, OWNERS.safeguarding, "gp", "Safeguarding or safety worry: pass to a clinician today", "The letter mentions a safeguarding or safety concern. Do not wait for the queue and do not decide anything yourself: give it to a GP or the practice safeguarding lead today.", safeguarding);

  const legal = find(s, LEGAL);
  const complaint = find(s, COMPLAINT);
  if (legal) add("legal", 1.2, OWNERS.manager, "gp", "Legal or ombudsman letter: pass to the practice manager today", "Do not reply or file it as routine post. The practice manager decides what to do, and whether the practice's indemnity provider or the Health Board must be told.", legal);
  if (complaint) add("complaint", 1.25, OWNERS.manager, "gp", "This letter may contain a concern or complaint", "Do not file it as routine correspondence. Pass it to the practice manager today so that it can be logged as a concern and acknowledged on time under the practice's complaints policy. Do not reply to it yourself.", complaint);

  const incident = find(s, INCIDENT);
  if (incident) add("incident", 1.3, OWNERS.manager, "gp", "Possible incident or error: tell the practice manager", "The letter describes something that may have gone wrong. Pass it to the practice manager and a GP so that it can be looked at as a significant event. Do not change any record yourself.", incident);

  const cancer = find(s, CANCER);
  if (cancer) add("cancer", 1.4, OWNERS.gp, "gp", "Suspected-cancer pathway: pass to a GP today", "The letter refers to a suspected-cancer (two-week-wait) pathway. A GP must see it today so that nothing is missed or delayed.", cancer);

  const needed = find(s, REFERRAL_NEEDED);
  const made = find(s, REFERRAL_MADE);
  if (needed) {
    const to = REFER_TO.exec(s);
    add("referral-needed", 2.1, OWNERS.gp, "gp", `Onward referral needed${to ? `: ${text(to[1])}` : ""}`, "The letter asks for a referral to be made, or says one is needed. Only a GP can decide and make it. Put it in the GP's tasks, marked as a referral, so it is not lost.", needed);
  } else if (made) {
    add("referral-made", 3.1, OWNERS.admin, "admin", "A referral has already been made", "The letter says the referral has been made by the sender. Nothing to arrange: put a note on the record, and tell a GP if the patient has not heard about an appointment within a few weeks.", made);
  }

  const death = find(s, DEATH);
  if (death) add("death", 2.5, OWNERS.gp, "gp", "The letter says the patient has died: pass to a GP", "Check this is the right patient before anything is changed. Then pass it to a GP and to whoever updates registrations so that recalls, repeat prescriptions and appointments are stopped. Be careful: a family may not know yet.", death);

  const registration = find(s, REGISTRATION);
  if (registration) add("registration", 3.2, OWNERS.admin, "admin", "The patient may have moved or left: check their registration", "Check the patient's address and registration on the record. If they have left the practice, follow the practice's process for transfers.", registration);

  return out.sort((a, b) => a.rank - b.rank);
}

// ---- who the letter is about ----
// The commonest surnames in Wales and England, and commonest forenames: a letter about "David Jones" or "Mary Williams" is easily confused with another patient
const SURNAMES = new Set(["jones", "williams", "davies", "evans", "thomas", "roberts", "hughes", "lewis", "morgan", "griffiths", "edwards", "owen", "owens", "price", "jenkins", "phillips", "parry", "powell", "rees", "lloyd", "james", "harris", "pugh", "morris", "bevan", "howells", "hopkins", "watkins", "rowlands", "ellis", "davis", "john", "richards", "jackson", "wright", "walker", "smith", "taylor", "brown", "wilson", "johnson", "robinson", "thompson", "white", "hall", "green", "wood", "harrison", "clarke", "clark", "martin", "turner", "cooper", "ward", "baker", "moore", "king", "scott", "young", "allen", "mitchell", "carter", "anderson", "bennett", "cook", "bell", "kelly", "murphy", "patel", "khan", "ali", "singh", "begum", "ahmed", "hussain", "shah"]);
const FORENAMES = new Set(["david", "john", "mary", "margaret", "susan", "sarah", "james", "michael", "robert", "william", "elizabeth", "patricia", "jennifer", "christine", "peter", "paul", "richard", "thomas", "jane", "ann", "anne", "gwyn", "gareth", "dafydd", "ceri", "sian", "karen", "linda", "barbara", "carol", "janet", "helen", "brian", "kevin", "andrew", "mark", "stephen", "steven", "alan", "ian", "gary", "philip", "anthony", "daniel", "emma", "sharon", "julie", "joan", "dorothy", "gwen", "gwyneth", "eirian", "megan", "rhys", "owen", "huw", "emyr", "ieuan", "idris", "glyn", "dilys", "olwen", "mair", "nia", "lowri", "catherine", "kathleen", "irene", "ruth", "joyce", "pauline", "denise"]);
export const isCommonSurname = (value) => SURNAMES.has(text(value).toLowerCase().replace(/[^a-z'-]/g, ""));
export const isCommonForename = (value) => FORENAMES.has(text(value).split(" ")[0].toLowerCase().replace(/[^a-z'-]/g, ""));

// The hook for a link to the clinical system: when there is one, this returns the matching patients found in the record. There is none yet.
export const matchPatient = null;

const TITLED = /\b(?:Mr|Mrs|Ms|Miss|Master|Dr)\.?\s+([A-Z][a-zA-Z'-]+)(?:\s+([A-Z][a-zA-Z'-]+))?/g;
const ageAt = (birthDate, onDate) => {
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDate ?? "")); const o = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(onDate ?? "")) || /^(\d{4})-(\d{2})-(\d{2})/.exec(new Date().toISOString());
  if (!b || !o) return null;
  let age = Number(o[1]) - Number(b[1]);
  if (Number(o[2]) < Number(b[2]) || (Number(o[2]) === Number(b[2]) && Number(o[3]) < Number(b[3]))) age -= 1;
  return age;
};

// The checks to make before a letter is filed on a patient. identity: { givenNames, familyName, nhsNumber, birthDate, letterDate }.
// Returns { level: "high" | "check", reasons: [string], commonName: boolean }. "high" means take particular care.
export function identityChecks(identity = {}, letter = "") {
  const given = text(identity.givenNames); const family = text(identity.familyName);
  const reasons = []; let high = false; let commonName = false;
  const commonFamily = family && isCommonSurname(family); const commonGiven = given && isCommonForename(given);
  if (commonFamily && commonGiven) { reasons.push(`“${given} ${family}” is a very common name: there may be several patients with this name. Check the date of birth and address as well as the NHS number.`); high = true; commonName = true; }
  else if (commonFamily) { reasons.push(`“${family}” is one of the commonest surnames: there may be other patients with the same surname and similar first names. Check the full name and date of birth.`); high = true; commonName = true; }
  else if (commonGiven && family) { reasons.push(`“${given}” is a very common first name: check the date of birth as well as the surname.`); commonName = true; }
  if (!family) { reasons.push("No surname could be read from the letter."); high = true; }
  if (!given) { reasons.push("No first name could be read from the letter: do not file it on a name alone."); high = true; }
  else if (/^[A-Za-z]\.?$/.test(given) || /^(?:[A-Za-z]\.?\s*){1,3}$/.test(given)) { reasons.push("Only initials are given for the first name: it is easy to pick the wrong patient."); high = true; }
  const nhs = String(identity.nhsNumber ?? "").replace(/\s+/g, "");
  if (!nhs) { reasons.push("There is no NHS number on the letter: match on full name, date of birth and address instead."); high = true; }
  else if (!nhsNumberValid(nhs)) { reasons.push("The NHS number does not pass its check digit: it may have been misread or mistyped. Check it against the original."); high = true; }
  if (!text(identity.birthDate)) { reasons.push("There is no date of birth on the letter."); high = true; }
  else {
    const stated = /\b(?:aged?|age:)\s*(\d{1,3})\b|\b(\d{1,3})[\s-]*(?:year|yr)s?[\s-]*old\b/i.exec(String(letter));
    const age = ageAt(identity.birthDate, identity.letterDate);
    const said = stated ? Number(stated[1] || stated[2]) : null;
    if (said !== null && age !== null && Math.abs(said - age) > 1) { reasons.push(`The letter says the patient is ${said}, but the date of birth makes them ${age}. One of them may be wrong, or the letter may be about someone else.`); high = true; }
  }
  // more than one person named in the letter
  const surnames = new Set(); let m;
  const titled = new RegExp(TITLED.source, "g");
  while ((m = titled.exec(String(letter))) !== null) if (!/^Dr$/i.test(m[0].split(/\s+/)[0].replace(".", ""))) surnames.add(m[1].toLowerCase());
  if (surnames.size > 1) { reasons.push(`The letter names more than one person (${[...surnames].map((x) => x[0].toUpperCase() + x.slice(1)).join(", ")}). Make sure you are filing it on the right one.`); high = true; }
  if (typeof matchPatient === "function") { /* a match in the record would be reported here */ }
  else reasons.push("ClinFlow cannot match the patient to the practice record yet. Open their record and check the name, date of birth, NHS number and address against the letter before filing.");
  return { level: high ? "high" : "check", reasons, commonName };
}
