import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codingAuditMeta, termVersions, terminologyEvent } from "../src/modules/clinflow/clinflowAuditMeta.js";
import { decide, reviewCandidates } from "../src/modules/clinflow/clinflowCodeReview.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const BLOCKED = new RegExp(/BLOCKED_METADATA_KEY = \/(.*)\/i;/.exec(read("functions/services/governedAuditService.js"))[1], "i");

t("every code decision and filing records which terminology was in use", () => {
  assert.deepEqual(termVersions({ snomed: "UK SNOMED CT release 14 Oct 2026 · 100 codes", medicines: "", abbreviations: "" }), {
    snomedList: "UK SNOMED CT release 14 Oct 2026 · 100 codes", medicinesList: "not loaded", abbreviationList: "built-in list",
  });
  const source = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.match(source, /\{ \.\.\.metadata, \.\.\.versionsInUse\(\), automatedTransmission: false \}/, "code review events carry the versions");
  assert.match(source, /"clinflow\.summary\.download"[^\n]*\.\.\.codingOf\(selected\), \.\.\.versionsInUse\(\)/, "the Docman download records where the coding stood");
  assert.match(source, /"clinflow\.finished\.pack_created"[^\n]*\.\.\.codingOf\(updated\), \.\.\.versionsInUse\(\)/, "finishing records where the coding stood");
  assert.match(source, /calculated: candidate\.calculated\?\.kind/, "a worked-out value is marked as such when it is accepted");
});

t("the audit shows how much of the coding was checked when the letter was filed", () => {
  const analysis = { terminologyCandidates: [{ sourceLabel: "Diagnosis", sourceValue: "asthma", searchTerm: "asthma", conceptId: "195967001", preferredTerm: "Asthma" }, { sourceLabel: "Diagnosis", sourceValue: "quantum flux", searchTerm: "quantum flux" }, { sourceLabel: "Diagnosis", sourceValue: "angina", searchTerm: "angina" }], medicationCandidates: [] };
  const candidates = reviewCandidates(analysis, "Weight 82 kg, height 175 cm.");
  assert.equal(candidates.filter((c) => c.calculated).length, 1);
  let review = decide(null, candidates[0], "accepted", { uid: "u", name: "Dr Example", pick: { conceptId: "195967001", term: "Asthma", descriptionId: "301001" } });
  review = decide(review, candidates[1], "removed", { uid: "u", name: "Dr Example" });
  review = decide(review, candidates[3], "accepted", { uid: "u", name: "Dr Example", pick: { conceptId: "60621009", term: "Body mass index", descriptionId: "304001" } });
  assert.deepEqual(codingAuditMeta(candidates, review), { codesAccepted: 2, codesRemoved: 1, codesAdded: 0, codesWaiting: 1, codesCalculated: 1 });
  assert.deepEqual(codingAuditMeta(candidates, null), { codesAccepted: 0, codesRemoved: 0, codesAdded: 0, codesWaiting: 4, codesCalculated: 0 }, "nothing checked is said, not left out");
});

t("loading or removing a terminology list is written to the audit trail with its release", () => {
  const load = terminologyEvent("snomed", "load", { info: "UK SNOMED CT Clinical Edition, release 14 Oct 2026 · 98,000 codes", fileLabel: "snomed-uk-index.json.gz" });
  assert.equal(load.action, "clinflow.terminology.load");
  assert.equal(load.metadata.kind, "snomed");
  assert.match(load.metadata.release, /14 Oct 2026/);
  assert.equal(terminologyEvent("dmd", "remove").action, "clinflow.terminology.remove");
  assert.match(terminologyEvent("abbreviations", "load").summary, /abbreviations list loaded/);
  const source = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.match(source, /terminologyEvent\("snomed", "load"/);
  assert.match(source, /terminologyEvent\("dmd", "load"/);
  assert.match(source, /terminologyEvent\("abbreviations", "load"/);
  assert.match(source, /terminologyEvent\(kind, "remove"\)/);
});

t("no key we add is one the audit service would silently drop, and none carries the letter's words", () => {
  const keys = new Set([
    ...Object.keys(termVersions()), ...Object.keys(codingAuditMeta([], null)), ...Object.keys(terminologyEvent("snomed", "load").metadata), "calculated", "decision", "conceptId",
  ]);
  for (const key of keys) assert.ok(!BLOCKED.test(key), `${key} would be dropped by the audit service`);
  assert.ok(Object.keys(codingAuditMeta([], null)).length + Object.keys(termVersions()).length + 4 <= 24, "within the 24 keys the service keeps");
  for (const value of Object.values(terminologyEvent("snomed", "load", { info: "x".repeat(400) }).metadata)) if (typeof value === "string") assert.ok(value.length <= 180, "strings fit the 180 the service keeps");
});

t("who opened a letter and what was copied out of it for Docman are on the record, without the values themselves", () => {
  const source = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.match(source, /"clinflow\.document\.view"/);
  assert.match(source, /viewedLetters\.current\.has\(selected\.id\)/, "once per letter per session");
  assert.match(source, /"clinflow\.docman\.copy"[^\n]*\{ field, automatedTransmission: false \}/, "only which detail was copied, never its value");
  const panel = read("src/modules/clinflow/DocmanReadiness.jsx");
  assert.match(panel, /onCopy\?\.\(key === "all"/);
  assert.ok(!/onCopy\?\.\([^)]*\bvalue\b/.test(panel), "the copied value is not passed on");
});

t("every move is on the record: what was opened, searched, copied, refused, finished or scored", () => {
  const source = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.equal((source.match(/if \(!can\("[^"]+"\)\) return notify\(/g) || []).length, 0, "no refusal goes unrecorded");
  assert.ok((source.match(/return denied\(/g) || []).length >= 12, "each refusal is written to the audit trail");
  assert.match(source, /action: "clinflow\.action\.denied"[^\n]*permissionDecision: "denied", outcome: "denied"/);
  for (const action of ["clinflow.tab.view", "clinflow.queue.filter", "clinflow.search", "clinflow.finish.open", "clinflow.teaching.open", "clinflow.scorecard.open", "clinflow.codes.copy", "clinflow.docman.copy", "clinflow.document.view", "clinflow.terminology.load"]) {
    assert.ok(source.includes(action) || read("src/modules/clinflow/clinflowAuditMeta.js").includes(action), `${action} is recorded`);
  }
  assert.match(source, /track\("clinflow\.search"[^\n]*\{ termLength: query\.trim\(\)\.length \}/, "a search records how long it was, never what was typed");
  assert.ok(!/track\("clinflow\.search"[^\n]*\bquery\b[^\n]*\bquery\b[^)]*\)\s*\}\)/.test(source), "the search words are not sent");
  const review = read("src/modules/clinflow/CodeReview.jsx");
  assert.match(review, /onCopy\?\.\("lookup details"\)/);
  assert.match(review, /onCopy\?\.\("words with no code"\)/);
});

t("the side panels fold away, the choice is remembered, and folding is on the record", () => {
  const source = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.match(source, /clinflow-shell--queue-collapsed/);
  assert.match(source, /track\("clinflow\.layout\.change"/);
  assert.match(source, /primovex\.clinflow\.queueCollapsed/);
  assert.match(source, /primovex\.clinflow\.panelCollapsed/);
  assert.match(source, /Give the letter the whole screen/);
  assert.match(source, /aria-label="Show the letters list"/, "a folded list can always be brought back");
  assert.match(source, /aria-label="Show the actions panel"/, "a folded actions panel can always be brought back");
  const css = read("src/modules/clinflow/clinflow-workspace.css");
  assert.match(css, /\.clinflow-shell--queue-collapsed\.clinflow-shell--panel-collapsed\{grid-template-columns:38px minmax\(0,1fr\) 38px\}/, "with both folded the letter takes everything between two thin strips");
});

t("notices above the letter can be put away with a small x, come back for the next letter, can be shown again, and each is on the record", () => {
  const source = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  for (const notice of ["identity", "risk", "brief"]) assert.match(source, new RegExp(`dismissNotice\\("${notice}"\\)`), `${notice} notice has its x`);
  assert.ok((source.match(/aria-label="Put this notice away"/g) || []).length === 3);
  assert.match(source, /track\("clinflow\.notice\.dismiss"/);
  assert.match(source, /track\("clinflow\.notice\.show"/);
  assert.match(source, /\[selected\.id\]: \[\.\.\.\(current\[selected\.id\] \|\| \[\]\)/, "put away per letter, so the next letter shows its own notices");
  assert.match(source, /Show \{noticesFor\(selected\.id\)\.length\} notice/, "they can be brought back");
  const state = source.indexOf("const [putAway, setPutAway]");
  assert.ok(state > 0 && state < source.indexOf("const selected = documents.find("), "the state exists before the screen uses it");
});

t("nothing that needs the selected letter is set up before it exists (this crashed the screen twice)", () => {
  const source = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  const selectedAt = source.indexOf("  const selected = documents.find(");
  assert.ok(selectedAt > 0);
  for (const marker of ["const identityNote = useMemo", "const viewedLetters = useRef", "viewedLetters.current.has(selected.id)"]) {
    assert.ok(source.indexOf(marker) > selectedAt, `${marker} must come after the selected letter is defined`);
  }
  for (const [marker, state] of [["const trackedTab = useRef(activeTab)", "const [activeTab,"], ["const trackedFilter = useRef(filter)", "const [filter,"], ["[query]); // eslint", "const [query,"]]) {
    assert.ok(source.indexOf(marker) > source.indexOf(state), `${marker} must come after ${state}`);
  }
  // the hooks are in the component's body, not after an early return
  const body = source.slice(source.indexOf("export default function ClinFlowWorkspace()"));
  assert.ok(body.indexOf("const identityNote = useMemo") < body.indexOf("return (\n    <section"), "hooks come before the screen is returned");
});

console.log(`\n${n} passed`);
