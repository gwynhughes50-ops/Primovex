// Covers the rota review (src/modules/rota/rotaReview.js): what it finds, in what order, and that the AI only ever gets letters in place of names.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DAYS, DEFAULT_SETTINGS, DEFAULT_SHIFTS, newPerson } from "../src/modules/rota/rotaModel.js";
import { generateWeeks } from "../src/modules/rota/rotaEngine.js";
import { setPlace, withNames } from "../src/modules/rota/rotaWeek.js";
import { anonymise, restoreNames, reviewRota } from "../src/modules/rota/rotaReview.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const person = (uid, name, extra = {}) => ({ ...newPerson(uid, name), ...extra });
const LATEST = Object.fromEntries(DAYS.map((d) => [d, "18:30"]));
const rules = {
  shifts: DEFAULT_SHIFTS.map((s) => ({ ...s })),
  settings: { ...DEFAULT_SETTINGS },
  people: [
    person("dave", "Dave", { mode: "usual", shift: "desk", coverShifts: ["early1", "early2", "mid", "late"], cannotDo: ["tyelan"] }),
    person("jack", "Jack", { mode: "fixed", shift: "admin2" }),
    person("helen", "Helen", { earliest: { mon: "09:00", tue: "08:00", wed: "08:00", thu: "09:00", fri: "09:00" }, latest: LATEST, maxPerWeek: { late: 1 } }),
    person("emily", "Emily"), person("kim", "Kim"), person("lewis", "Lewis"), person("libby", "Libby"), person("lucy", "Lucy"),
    person("karenl", "Karen L", { dayRules: { wed: { shift: "group:early", until: "12:00" } } }),
    person("karenb", "Karen B", { mode: "only", onlyShifts: ["desk2"], days: ["wed", "thu", "fri"] }),
    person("debbie", "Debbie", { mode: "only", onlyShifts: ["desk2"], days: ["tue", "wed", "thu"] }),
  ],
};
const FIRST = "2026-11-16";
const build = (weeksN, absences = []) => Object.fromEntries(generateWeeks({ rules, firstMonday: FIRST, weeks: weeksN, absences }).map((w) => [w.mondayIso, { ...withNames(w, rules), edited: {} }]));
const review = (weeks, absences = [], extra = {}) => reviewRota({ rules, weeks, absences, fromMonday: FIRST, horizon: 4, ...extra });
const kinds = (r) => r.findings.map((f) => f.kind);

t("a normal, well-built rota has nothing to fix, and its findings are in order: fix, then watch, then info", () => {
  const r = review(build(4));
  assert.equal(r.stats.fix, 0, JSON.stringify(r.findings.filter((f) => f.severity === "fix")));
  assert.equal(r.stats.weeksChecked, 4);
  const order = { fix: 0, watch: 1, info: 2 };
  const sev = r.findings.map((f) => order[f.severity]);
  assert.deepEqual(sev, [...sev].sort((a, b) => a - b));
  assert.ok(!kinds(r).includes("gap"));
  assert.ok(!kinds(r).includes("part-shift"), "Karen L until 12 every Wednesday is a standing arrangement, not something to watch each week");
});

t("people whose own rules narrow what they can be given are not held up against the others on fairness (Helen's hours mean more Admin 1 and fewer Early)", () => {
  const r = review(build(6), [], { horizon: 6 });
  assert.ok(!r.findings.some((f) => f.kind.startsWith("fairness") && f.uids?.some((u) => ["helen", "karenl"].includes(u))), JSON.stringify(r.findings.filter((f) => f.kind.startsWith("fairness"))));
});

t("an essential shift with nobody on it is something to fix, with a suggestion", () => {
  const weeks = build(2);
  weeks[FIRST] = setPlace(weeks[FIRST], rules, "tue", "tyelan", "");
  const r = review(weeks);
  const gap = r.findings.find((f) => f.kind === "gap");
  assert.equal(gap.severity, "fix");
  assert.equal(gap.day, "tue");
  assert.match(gap.detail, /nobody is on Ty Elan/);
  assert.match(gap.suggestion, /Change the place by hand/);
});

t("time off entered after the week was built shows as someone on a shift who is off, to rebuild", () => {
  const weeks = build(2);
  const who = weeks[FIRST].days.wed.slots.mid.uid;
  const r = review(weeks, [{ uid: who, from: "2026-11-18", to: "2026-11-18", reason: "other" }]);
  const f = r.findings.find((x) => x.kind === "off-but-on");
  assert.equal(f.severity, "fix");
  assert.match(f.suggestion, /Rebuild the week/);
});

t("a week with one more person off than spare is flagged as thin cover, before it becomes a gap", () => {
  const absences = [{ uid: "kim", from: "2026-11-17", to: "2026-11-17", reason: "leave" }];
  const weeks = build(2, absences);
  const r = review(weeks, absences);
  const thin = r.findings.find((f) => f.kind === "thin");
  assert.ok(thin, kinds(r).join(","));
  assert.equal(thin.severity, "watch");
  assert.match(thin.detail, /Tuesday/);
  assert.match(thin.detail, /one more person being off would leave a shift uncovered/);
  assert.ok(!review(build(2)).findings.some((f) => f.kind === "thin"), "a normal week is not thin");
});

t("three people off on one day is flagged, with who", () => {
  const absences = ["kim", "lucy", "emily"].map((uid) => ({ uid, from: "2026-11-24", to: "2026-11-24", reason: "leave" }));
  const r = review(build(3, absences), absences);
  const f = r.findings.find((x) => x.kind === "many-off");
  assert.equal(f.severity, "watch");
  assert.match(f.detail, /Kim, Lucy, Emily|Emily, Kim, Lucy|Kim, Emily, Lucy/);
  assert.equal(f.day, "tue");
});

t("a half-covered essential shift (someone finishing early) is something to watch", () => {
  const absences = [{ uid: "kim", from: "2026-11-16", to: "2026-11-16", fromTime: "12:00", reason: "other" }];
  const r = review(build(2, absences), absences);
  const f = r.findings.find((x) => x.kind === "part-shift");
  assert.equal(f.severity, "watch");
  assert.match(f.detail, /Kim is on Early [12] until 12 only/);
});

t("weeks not built: time already entered for one is a watch, a plain next week is just information", () => {
  const weeks = build(1);
  const absences = [{ uid: "kim", from: "2026-11-24", to: "2026-11-24", reason: "leave" }];
  const r = review(weeks, absences);
  assert.ok(r.findings.some((f) => f.kind === "unbuilt-off" && f.severity === "watch" && f.weekIso === "2026-11-23"));
  const plain = review(weeks, []);
  assert.ok(plain.findings.some((f) => f.kind === "unbuilt" && f.severity === "info"));
  assert.ok(!plain.findings.some((f) => f.kind === "unbuilt-off"));
});

t("unfair sharing is noticed from the built weeks: one person with far more lates than the others", () => {
  let weeks = build(6);
  for (const monday of Object.keys(weeks)) for (const day of DAYS) weeks[monday] = setPlace(weeks[monday], rules, day, "late", "kim");
  const r = review(weeks, [], { horizon: 6 });
  const f = r.findings.find((x) => x.kind === "fairness-high" && /Late/.test(x.title));
  assert.ok(f, kinds(r).join(","));
  assert.match(f.detail, /Kim has done 30 Late shifts in the last 6 weeks/);
  assert.deepEqual(f.uids, ["kim"]);
  assert.ok(!review(build(6), [], { horizon: 6 }).findings.some((x) => x.kind === "fairness-high"), "the built rota itself is fair enough");
});

t("the Friday late not rolling is noticed", () => {
  const weeks = build(6);
  for (const monday of Object.keys(weeks)) weeks[monday] = setPlace(weeks[monday], rules, "fri", "late", "kim");
  const f = review(weeks, [], { horizon: 6 }).findings.find((x) => x.kind === "friday-late");
  assert.equal(f.severity, "watch");
  assert.match(f.detail, /Kim has had the Friday late 6 times in 6 weeks while .* not had it/);
  assert.ok(!review(build(6), [], { horizon: 6 }).findings.some((x) => x.kind === "friday-late"), "the built rota rolls it round");
});

t("fairness says nothing with too few built weeks to compare", () => {
  const weeks = build(2);
  for (const monday of Object.keys(weeks)) for (const day of DAYS) weeks[monday] = setPlace(weeks[monday], rules, day, "late", "kim");
  assert.ok(!review(weeks).findings.some((f) => f.kind.startsWith("fairness")));
});

t("the AI is given letters, not names: every name is replaced, nothing else about a person goes, and the letters turn back into names", () => {
  const absences = [{ uid: "kim", from: "2026-11-16", to: "2026-11-16", fromTime: "12:00", reason: "other" }];
  const r = review(build(3, absences), absences);
  const { payload, map } = anonymise(r.findings, rules);
  const json = JSON.stringify(payload);
  for (const p of rules.people) assert.ok(!new RegExp(`\\b${p.name}\\b`).test(json), `${p.name} is in what the AI is given`);
  assert.ok(/Person [A-K]\b/.test(json), "letters instead");
  assert.deepEqual(Object.keys(payload), ["findings", "people"]);
  for (const f of payload.findings) assert.deepEqual(Object.keys(f).sort(), ["day", "detail", "severity", "suggestion", "title", "week"]);
  assert.equal(Object.keys(map).length, 11);
  const text = payload.findings.find((f) => /until 12 only/.test(f.detail)).detail;
  const back = restoreNames(text, map);
  assert.match(back, /Kim is on Early [12] until 12 only/);
  assert.equal(restoreNames("Person A's Tuesday and Person ZZ", { A: "Kim" }), "Kim's Tuesday and Person ZZ", "an unknown letter is left alone");
});

t("names are replaced as whole words only, longest first, and there are letters for a big team", () => {
  const people = [{ uid: "a", name: "Dan" }, { uid: "b", name: "Daniel" }, { uid: "c", name: "Karen L" }, { uid: "d", name: "Karen" }];
  const { payload } = anonymise([{ severity: "fix", kind: "x", title: "Danger for Dan and Daniel", detail: "Karen L and Karen", suggestion: "", weekIso: "", day: "" }], { people });
  assert.equal(payload.findings[0].title, "Danger for Person A and Person B");
  assert.equal(payload.findings[0].detail, "Person C and Person D");
  const many = Array.from({ length: 30 }, (_, i) => ({ uid: `u${String(i).padStart(2, "0")}`, name: `Name${i}` }));
  const { map } = anonymise([], { people: many });
  assert.equal(map.Z, "Name25");
  assert.equal(map.AA, "Name26");
  assert.equal(Object.keys(map).length, 30);
});

t("it is wired in: the check shows on the Rota tab, the summary only goes out as letters through the server function, and the administrator has its own switch", () => {
  const week = readFileSync(new URL("../src/components/rota/RotaWeekPanel.jsx", import.meta.url), "utf8");
  assert.match(week, /<RotaReviewPanel rules=\{rules\} weeks=\{weeks\} absences=\{absences\} startMonday=\{startMonday\} canManage=\{canManage\}/);
  const service = readFileSync(new URL("../src/modules/rota/rotaReviewService.js", import.meta.url), "utf8");
  assert.match(service, /const \{ payload, map \} = anonymise\(findings, rules\);/);
  assert.match(service, /httpsCallable\(functions, "rotaReviewSummary"/);
  assert.match(service, /restoreNames\(result\.headline, map\)/);
  assert.match(service, /isSafeSyntheticMode\(\)\) return \{ enabled: false, demo: true \}/, "demo mode never calls the server");
  const panel = readFileSync(new URL("../src/components/rota/RotaReviewPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /canManage && findings\.length > 0/, "only the person who builds the rota is offered the summary");
  assert.match(panel, /can be wrong: check it against the rota/);
  const server = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  const fn = server.slice(server.indexOf("exports.rotaReviewSummary"), server.indexOf("exports.rotaReviewSummary") + 2200);
  assert.match(fn, /reviewSummary\(\{/);
  assert.match(fn, /action: "rota\.ai\.review"/);
  assert.match(fn, /metadata: \{ findings: result\.count \|\| 0/, "audited by counts only");
  assert.doesNotMatch(fn, /metadata:[^\n]*(summary|headline|priorities)/, "never the words");
  const admin = readFileSync(new URL("../src/components/admin/OrbAiSettings.jsx", import.meta.url), "utf8");
  assert.match(admin, /settings\?\.aiRotaReview === true/);
  assert.match(admin, /r_all_\$\{day\}/);
});

console.log(`\n${n} passed`);
