// Portable appliance testing (PAT), the pure side: what kinds of appliance there are and how often each is retested, whether
// an appliance is due, what a test said and whether it passed, and the record a test leaves. No Firestore and no screens, so it
// can be tested. The caretaker works through it on his phone one appliance at a time (src/mobile/pat/PatWizard.jsx).
//
// The test itself is done with his own tester; he reads the result off its display and enters it here. A pass sets the date
// the appliance is next due, from its kind; a fail takes it out of use and is raised as an incident.

const DAY = 86400000;
export const DUE_SOON_DAYS = 30;

// Kinds of appliance and how many months between tests. These are starting points: the practice sets its own intervals once
// (stored in pat_settings/main), because the HSE leaves the interval to a risk assessment rather than fixing one.
export const PAT_CATEGORIES = [
  { key: "it", label: "Computers and IT equipment", months: 24, examples: "PC, monitor, printer, phone charger", defaultClass: "I" },
  { key: "handheld", label: "Hand-held and portable", months: 12, examples: "Kettle, hairdryer, vacuum, fan", defaultClass: "I" },
  { key: "extension", label: "Extension leads and adaptors", months: 12, examples: "Multi-socket lead, cable reel", defaultClass: "I" },
  { key: "fixed", label: "Fixed and stationary", months: 24, examples: "Fridge, microwave, water boiler", defaultClass: "I" },
  { key: "clinical", label: "Clinical and medical electrical", months: 12, examples: "ECG, couch, examination lamp", defaultClass: "I" },
  { key: "other", label: "Other", months: 12, examples: "Anything else", defaultClass: "I" },
];

export const categoryOf = (key) => PAT_CATEGORIES.find((c) => c.key === key) || PAT_CATEGORIES.at(-1);

// the months between tests for a kind: the practice's own setting when it has one, else the starting point
export function intervalFor(categoryKey, settings = {}) {
  const own = Number(settings?.intervals?.[categoryKey]);
  return Number.isFinite(own) && own >= 1 && own <= 120 ? Math.round(own) : categoryOf(categoryKey).months;
}

// ---- dates (plain yyyy-mm-dd, which is a calendar day at the practice and has no timezone to get wrong) ----

const pad = (n) => String(n).padStart(2, "0");
export const dateKeyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) || date.getMonth() !== Number(m[2]) - 1 ? null : date;
}

// a date plus whole months, the day kept where the month is long enough and cut back to the month's last day where not
export function addMonthsKey(key, months) {
  const date = parseKey(key);
  if (!date) return "";
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + Number(months || 0), 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return dateKeyOf(target);
}

export function daysUntil(key, now = new Date()) {
  const date = parseKey(key);
  if (!date) return null;
  return Math.round((date.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / DAY);
}

export const ukDate = (key) => (parseKey(key) ? key.split("-").reverse().join("/") : "");

// ---- is an appliance due ----

// "out-of-use" (failed and not put right), "never" (not tested yet), "overdue", "due-soon" (within 30 days) or "ok"
export function patStatus(asset = {}, now = new Date()) {
  if (asset.outOfUse === true) return { state: "out-of-use", days: null };
  const days = daysUntil(asset.nextDueOn, now);
  if (days === null) return { state: "never", days: null };
  if (days < 0) return { state: "overdue", days };
  return { state: days <= DUE_SOON_DAYS ? "due-soon" : "ok", days };
}

const ORDER = { "out-of-use": 0, overdue: 1, never: 2, "due-soon": 3, ok: 4 };

// the appliances in use, most urgent first, with their state, and the counts for the top of a screen
export function dueSummary(assets = [], now = new Date()) {
  const rows = assets
    .filter((a) => a && a.active !== false)
    .map((asset) => ({ asset, ...patStatus(asset, now) }))
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.days ?? 0) - (b.days ?? 0) || String(a.asset.tag || "").localeCompare(String(b.asset.tag || ""), undefined, { numeric: true }));
  const count = (state) => rows.filter((r) => r.state === state).length;
  const counts = { total: rows.length, overdue: count("overdue"), never: count("never"), dueSoon: count("due-soon"), outOfUse: count("out-of-use"), ok: count("ok") };
  return { rows, counts, needsAttention: counts.overdue + counts.never + counts.dueSoon + counts.outOfUse };
}

// ---- the test ----

export const FUSE_RATINGS = ["3A", "5A", "10A", "13A", "Not fitted / not applicable"];
export const PAT_FAIL_REASONS = [
  { key: "visual", label: "Damaged plug, flex or body" },
  { key: "earth", label: "Earth continuity failed" },
  { key: "insulation", label: "Insulation resistance failed" },
  { key: "fuse", label: "Wrong or faulty fuse" },
  { key: "other", label: "Something else (add a note)" },
];

const result = (value) => (value === "pass" || value === "fail" || value === "na" ? value : "");

// What the answers say. { result: "pass" | "fail" | "", reasons: [keys], missing: ["what is still needed"] }
//   visualOk: true or false; earth and insulation: "pass", "fail" or "na" (earth is not tested on a Class II item).
export function evaluateTest(answers = {}) {
  const cls = answers.cls === "II" ? "II" : "I";
  const earth = result(answers.earth);
  const insulation = result(answers.insulation);
  const missing = [];
  if (typeof answers.visualOk !== "boolean") missing.push("the visual inspection");
  if (cls === "I" && !earth) missing.push("the earth continuity result");
  if (!insulation) missing.push("the insulation result");
  const reasons = [];
  if (answers.visualOk === false) reasons.push("visual");
  if (cls === "I" && earth === "fail") reasons.push("earth");
  if (insulation === "fail") reasons.push("insulation");
  if (reasons.length) return { result: "fail", reasons, missing: [] };
  if (missing.length) return { result: "", reasons: [], missing };
  // a Class I item cannot pass with its earth test marked not applicable
  if (cls === "I" && earth === "na") return { result: "", reasons: [], missing: ["the earth continuity result (a Class I item has to be earth tested)"] };
  if (insulation === "na") return { result: "", reasons: [], missing: ["the insulation result"] };
  return { result: "pass", reasons: [], missing: [] };
}

const text = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const reading = (value) => {
  const clean = String(value ?? "").trim().replace(",", ".");
  return clean !== "" && /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : null;
};

// The record a test leaves. `final` is "pass" or "fail": the person's decision, which cannot be a pass when the answers say fail,
// nor a pass with something missing. Throws a sentence for the person when it cannot be recorded.
export function buildPatTest({ asset, answers = {}, final, actor = {}, settings = {}, now = new Date() } = {}) {
  if (!asset?.id) throw new Error("Choose the appliance first.");
  const verdict = evaluateTest(answers);
  if (final !== "pass" && final !== "fail") throw new Error("Choose pass or fail.");
  if (final === "pass" && verdict.result !== "pass") throw new Error(verdict.result === "fail" ? "It cannot pass: a test failed." : `Say ${verdict.missing[0]} first.`);
  const reasons = final === "fail" ? [...new Set([...verdict.reasons, ...(Array.isArray(answers.failReasons) ? answers.failReasons : [])])].filter((r) => PAT_FAIL_REASONS.some((x) => x.key === r)) : [];
  if (final === "fail" && !reasons.length) throw new Error("Say why it failed.");
  if (final === "fail" && reasons.includes("other") && !text(answers.notes, 200)) throw new Error("Add a note to say what was wrong.");
  const category = asset.category || "other";
  const months = intervalFor(category, settings);
  const testedOn = dateKeyOf(now);
  const cls = answers.cls === "II" ? "II" : "I";
  return {
    assetId: asset.id,
    tag: text(asset.tag, 40),
    name: text(asset.name, 120),
    location: text(asset.location, 120),
    category,
    cls,
    siteId: asset.siteId || "",
    testedOn,
    visualOk: answers.visualOk === true,
    earth: cls === "II" ? "na" : result(answers.earth),
    earthOhms: cls === "II" ? null : reading(answers.earthOhms),
    insulation: result(answers.insulation),
    insulationMohms: reading(answers.insulationMohms),
    fuseRating: text(answers.fuseRating, 40),
    result: final,
    failReasons: reasons,
    notes: text(answers.notes, 200),
    intervalMonths: months,
    nextDueOn: final === "pass" ? addMonthsKey(testedOn, months) : "",
    testerUid: actor.uid || "",
    testerName: text(actor.displayName || actor.name || actor.email, 80) || "Unknown",
  };
}

// What a test changes on the appliance: when it was last tested, how it did, when it is next due, and whether it is out of use
export function assetPatchAfterTest(test) {
  return {
    lastTestedOn: test.testedOn,
    lastResult: test.result,
    lastTestedByName: test.testerName,
    nextDueOn: test.result === "pass" ? test.nextDueOn : "",
    outOfUse: test.result === "fail",
    cls: test.cls,
    ...(test.fuseRating ? { fuseRating: test.fuseRating } : {}),
  };
}

// ---- finding the appliance ----

const norm = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// The appliance a typed or scanned tag names: its tag ("R-12", "r 12"), its id, or a Primovex link to it. null when none.
export function findAppliance(assets = [], typed) {
  const wanted = String(typed ?? "").trim();
  if (!wanted) return null;
  const link = /\/sense\/open\/pat\/([^/?#]+)/i.exec(wanted);
  const id = link ? decodeURIComponent(link[1]) : wanted;
  const key = norm(id);
  const live = assets.filter((a) => a && a.active !== false);
  return live.find((a) => a.id === id) || live.find((a) => key && norm(a.tag) === key) || null;
}

// the appliances whose tag starts with what has been typed so far, for a search box
export function searchAppliances(assets = [], typed, max = 8) {
  const key = norm(typed);
  if (!key) return [];
  return assets.filter((a) => a && a.active !== false && (norm(a.tag).includes(key) || norm(a.name).includes(key))).slice(0, max);
}

// appliances grouped by room, rooms with something due first (each room's rows are already most-urgent-first)
const NO_ROOM = "No room given";
export function byRoom(assets = [], now = new Date()) {
  const { rows } = dueSummary(assets, now);
  const rooms = new Map();
  for (const row of rows) {
    const room = row.asset.location || NO_ROOM;
    rooms.set(room, [...(rooms.get(room) || []), row]);
  }
  return [...rooms.entries()]
    .map(([room, list]) => ({ room, rows: list, attention: list.filter((r) => r.state !== "ok").length }))
    .sort((a, b) => b.attention - a.attention || Number(a.room === NO_ROOM) - Number(b.room === NO_ROOM) || a.room.localeCompare(b.room, undefined, { numeric: true }));
}

// a short line for a round that has just been done
export function roundSummary(tests = []) {
  const passed = tests.filter((t) => t.result === "pass").length;
  const failed = tests.filter((t) => t.result === "fail").length;
  return { tested: tests.length, passed, failed };
}
