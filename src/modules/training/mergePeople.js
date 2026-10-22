// The same person can end up on the training matrix twice under two names (Nicola and Nicky, Elizabeth and Liz): a spreadsheet that
// calls them one thing, another that calls them the other. This finds likely pairs and works out how to join them. Pure (no Firestore,
// no screens) so it can be tested with made-up people.
//
// Nothing is merged without somebody choosing to: a pair is only ever suggested. Joining keeps the person chosen, takes the later
// date for each course from the two of them, keeps "not required" and "away" marks, remembers the other name so an import of the
// same spreadsheet does not bring them back, and removes the duplicate.

const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const letters = (text) => clean(text).toLowerCase().replace(/[^a-z\s'-]/g, "").trim();
export const nameKey = (text) => clean(text).toLowerCase().replace(/[^a-z0-9]+/g, "");
const words = (name) => letters(name).split(/\s+/).filter(Boolean);
const first = (name) => words(name)[0] || "";
const last = (name) => { const w = words(name); return w.length > 1 ? w[w.length - 1] : ""; };

// first names that are the same name in a different form
const SAME_NAME = [
  ["nicola", "nicky", "nicki", "nikki", "nicole", "nic"], ["elizabeth", "liz", "lizzie", "beth", "betty", "eliza"], ["katherine", "catherine", "kate", "katy", "katie", "kathy", "kath", "cathy", "kathryn", "kathlyn"],
  ["margaret", "maggie", "meg", "peggy", "marge"], ["jennifer", "jenny", "jen"], ["susan", "sue", "suzie", "susie"], ["deborah", "debbie", "debra", "deb"], ["patricia", "pat", "patty", "trish"],
  ["christine", "chris", "christina", "tina"], ["rebecca", "becky", "becca"], ["alexandra", "alex", "alexandria"], ["victoria", "vicky", "vicki", "tori"], ["samantha", "sam"],
  ["jacqueline", "jackie", "jacqui"], ["michael", "mike", "mick", "mickey"], ["william", "will", "bill", "billy"], ["robert", "rob", "bob", "bobby"], ["richard", "rich", "rick"],
  ["james", "jim", "jimmy", "jamie"], ["thomas", "tom", "tommy"], ["david", "dave", "davy"], ["jonathan", "jon", "jonny"], ["daniel", "dan", "danny"], ["matthew", "matt"],
  ["anthony", "tony"], ["stephen", "steven", "steve"], ["andrew", "andy", "drew"], ["joanne", "joann", "joanna", "jo"], ["gwyneth", "gwen"], ["kimberley", "kimberly", "kim"],
];
const sameFirstName = (a, b) => a === b || SAME_NAME.some((group) => group.includes(a) && group.includes(b));

// Why two people might be one: the same surname and a first name that is the same name in another form, or one that starts like the
// other (Nic...). Returns "" when there is no reason to think so.
export function whyPossiblySame(a, b) {
  const fa = first(a.name); const fb = first(b.name);
  const la = last(a.name); const lb = last(b.name);
  if (!fa || !fb || !la || la !== lb) return "";
  if (fa === fb) return "the same name";
  if (sameFirstName(fa, fb)) return "the same name in a different form";
  if (fa.length >= 3 && fb.length >= 3 && fa.slice(0, 3) === fb.slice(0, 3)) return "first names that start the same";
  return "";
}

// pairs worth looking at, nearest first. A pair already joined (the other's name is a remembered name) is not suggested again.
export function possibleDuplicates(people = []) {
  const known = (a, b) => [...(a.aliases || [])].some((x) => nameKey(x) === nameKey(b.name)) || [...(b.aliases || [])].some((x) => nameKey(x) === nameKey(a.name));
  const pairs = [];
  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      const why = whyPossiblySame(people[i], people[j]);
      if (why && !known(people[i], people[j])) pairs.push({ a: people[i], b: people[j], why });
    }
  }
  const rank = { "the same name": 0, "the same name in a different form": 1, "first names that start the same": 2 };
  return pairs.sort((x, y) => rank[x.why] - rank[y.why]);
}

const dateOf = (r) => r?.dueOn || r?.completedOn || "";
const away = (r) => r?.status === "not-required" || r?.status === "on-leave";

// How to join `other` into `keep`. records: every training record (only these two people's are looked at).
//   writes:  records to set under the kept person (a date later than theirs, or a course they had nothing for)
//   deletes: ids of the other person's records (all of them go with the person)
//   person:  what the kept person is saved with
//   counts:  { kept, taken, onlyOther, same } for the confirmation
export function planMerge(keep, other, records = []) {
  if (!keep?.id || !other?.id) throw new Error("Choose two people.");
  if (keep.id === other.id) throw new Error("Choose two different people.");
  const mine = new Map(records.filter((r) => r.personId === keep.id).map((r) => [r.courseId, r]));
  const theirs = new Map(records.filter((r) => r.personId === other.id).map((r) => [r.courseId, r]));
  const writes = [];
  const counts = { kept: 0, taken: 0, onlyOther: 0, same: 0 };
  for (const [courseId, theirRecord] of theirs) {
    const mineRecord = mine.get(courseId);
    let winner = null;
    if (!mineRecord) { winner = theirRecord; counts.onlyOther += 1; }
    else if (away(mineRecord)) { counts.kept += 1; } // a "not required" or "away" mark on the kept person is never replaced
    else if (away(theirRecord) && !dateOf(mineRecord)) { winner = theirRecord; counts.taken += 1; }
    else if (dateOf(theirRecord) > dateOf(mineRecord)) { winner = theirRecord; counts.taken += 1; }
    else if (dateOf(theirRecord) === dateOf(mineRecord)) counts.same += 1;
    else counts.kept += 1;
    if (winner) writes.push({ personId: keep.id, courseId, group: keep.group, ownerUid: keep.uid || other.uid || "", completedOn: winner.completedOn || "", dueOn: winner.dueOn || "", status: winner.status || "" });
  }
  const aliases = [...new Set([...(keep.aliases || []), clean(other.name), ...(other.aliases || [])].filter((a) => a && nameKey(a) !== nameKey(keep.name)))];
  const uid = keep.uid || other.uid || null;
  return {
    writes,
    deletes: records.filter((r) => r.personId === other.id).map((r) => r.id),
    deletePersonId: other.id,
    person: { ...keep, aliases, uid, active: keep.active !== false || other.active !== false },
    // when the kept person gains an account they did not have, their older records follow it
    relink: !keep.uid && other.uid ? { ownerUid: other.uid, courseIds: [...mine.keys()] } : null,
    counts,
  };
}

// existing people by every name they are known by, to match a spreadsheet's names to them
export function nameIndex(people = []) {
  const index = new Map();
  for (const p of people) for (const name of [p.name, ...(p.aliases || [])]) if (nameKey(name) && !index.has(nameKey(name))) index.set(nameKey(name), p);
  return index;
}
