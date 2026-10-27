import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FOLDER_WORDS, NFW_WRONG_REASONS, SPOT_CHECK_EVERY, canSpotCheck, docmanFileName, folderKindFor, needsSpotCheck, nfwStats, pickableSentences } from "../src/modules/clinflow/clinflowNfwf.js";
import { buildScorecard, scorecardCsv } from "../src/modules/clinflow/clinflowScorecard.js";
import { createDocmanPackZip } from "../src/modules/clinflow/clinflowZipService.js";

let n = 0;
const t = (name, fn) => Promise.resolve(fn()).then(() => { n += 1; console.log(`ok  ${name}`); });
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

await t("a letter goes in the NFW folder only once a person has confirmed it as no action needed; everything else goes in Action needed", () => {
  assert.equal(folderKindFor(undefined), null);
  assert.equal(folderKindFor({ status: "pending", confirmedDecision: "no_workflow" }), null, "a suggestion alone does not choose a folder");
  assert.equal(folderKindFor({ status: "human_confirmed", confirmedDecision: "no_workflow" }), "nfw");
  for (const decision of ["workflow_required", "urgent", "review_required"]) assert.equal(folderKindFor({ status: "human_confirmed", confirmedDecision: decision }), "action");
  assert.equal(FOLDER_WORDS.nfw, "NFW (no action needed)");
});

await t("a downloaded file says which folder it belongs in, and its name is safe", () => {
  assert.equal(docmanFileName("nfw", "Respiratory letter.pdf"), "NFW - Respiratory letter.pdf");
  assert.equal(docmanFileName("action", "a/b\\c:d?.pdf"), "ACTION - a_b_c_d_.pdf");
  assert.equal(docmanFileName("action", ""), "ACTION - letter.pdf");
});

await t("the person ticks the letter's own sentences; short fragments, the greeting and repeats are left out", () => {
  const list = pickableSentences("Dear Dr Other\nRe: Mr Hall\nNo further action is needed from the hospital. Please could the GP repeat his sodium in two weeks. Please could the GP repeat his sodium in two weeks. Yours sincerely. Thanks.");
  assert.deepEqual(list, ["No further action is needed from the hospital.", "Please could the GP repeat his sodium in two weeks."]);
  assert.deepEqual(pickableSentences(""), []);
  assert.equal(pickableSentences("A sentence that is long enough. ".repeat(50)).length, 1, "repeats are one");
});

await t("a clinician spot-check: one in ten, always the 'possible' ones, the same answer every time, and never the person who confirmed it", () => {
  assert.equal(needsSpotCheck({ id: "x", category: "Possible NFWF - spot check" }), true);
  const picked = Array.from({ length: 2000 }, (_, i) => `doc-${i}`).filter((id) => needsSpotCheck({ id, category: "Information only" }));
  assert.ok(picked.length > 120 && picked.length < 290, `about one in ${SPOT_CHECK_EVERY} (got ${picked.length} of 2000)`);
  assert.equal(needsSpotCheck({ id: "doc-7", category: "Information only" }), needsSpotCheck({ id: "doc-7", category: "Information only" }));
  assert.equal(canSpotCheck({ checkerUid: "a", confirmedByUid: "a" }), false);
  assert.equal(canSpotCheck({ checkerUid: "b", confirmedByUid: "a" }), true);
  assert.equal(canSpotCheck({ checkerUid: "", confirmedByUid: "a" }), false);
});

const rec = (over) => ({ id: Math.random().toString(16), createdAt: "2026-10-27T10:00:00Z", suggestedDecision: "no_workflow", confirmedDecision: "no_workflow", source: "triage", reasonSentences: [], ...over });
const teaching = [
  rec({}), rec({}), rec({}),
  rec({ confirmedDecision: "workflow_required", reasonCode: "asks", reasonSentences: ["Please could the GP repeat his sodium in two weeks."] }),
  rec({ source: "spot_check" }), rec({ source: "spot_check", confirmedDecision: "workflow_required", reasonCode: "medicine", reasonSentences: ["Please could the GP repeat his sodium in two weeks."] }),
  rec({ suggestedDecision: "workflow_required", confirmedDecision: "workflow_required" }),
];

await t("the statistics count right and wrong suggestions, clinician checks, the reasons and the wording ClinFlow missed", () => {
  const s = nfwStats(teaching);
  assert.deepEqual([s.suggested, s.right, s.wrong, s.rightPct], [4, 3, 1, 75]);
  assert.deepEqual([s.checked, s.checkedAgreed, s.checkedDisagreed, s.checkedPct], [2, 1, 1, 50]);
  assert.deepEqual(s.reasons.map((r) => [r.code, r.count]), [["asks", 1], ["medicine", 1]]);
  assert.deepEqual(s.missedWording, [{ sentence: "Please could the GP repeat his sodium in two weeks.", count: 2 }]);
  assert.equal(nfwStats([]).rightPct, null);
  assert.ok(NFW_WRONG_REASONS.every(([code, label]) => code && label));
});

await t("the scorecard does not count a clinician's second look as another triage decision, and the CSV carries the reasons and the wording", () => {
  const card = buildScorecard({ teaching, documents: [] });
  assert.equal(card.triage.total, 5, "the two spot-checks are not extra triage decisions");
  assert.equal(card.nfw.wrong, 1);
  assert.ok(card.corrections.some((c) => c.checked && c.reasonWords === "A medicine needs changing or checking"), "a disagreeing spot-check is listed with its reason");
  const csv = scorecardCsv(card, teaching);
  assert.match(csv, /Source,Reason picked,Words that needed action/);
  assert.match(csv, /clinician spot-check/);
  assert.match(csv, /The letter asks something of the practice/);
  assert.match(csv, /Wording ClinFlow missed/);
});

await t("the bulk zip puts each finished letter in the NFW or Action needed folder", async () => {
  const pack = (id) => ({ title: "Letter", documentId: id, summaryBlob: new Blob(["%PDF-1.4 test"]) });
  const zip = await createDocmanPackZip([pack("a"), pack("b"), pack("c")], (p) => ({ a: "NFW", b: "Action needed" })[p.documentId] || "");
  const text = Buffer.from(await zip.arrayBuffer()).toString("latin1");
  assert.match(text, /NFW\/Letter-a\.pdf/);
  assert.match(text, /Action needed\/Letter-b\.pdf/);
  assert.match(text, /Letter-c\.pdf/);
  assert.ok(!/\/Letter-c\.pdf/.test(text), "no folder when the letter is not confirmed");
});

await t("the screen is wired: confirm yes/no with a picked reason, nothing is filed or finished until a person has confirmed, and the app only saves into folders it was told about", () => {
  const triage = read("src/modules/clinflow/TriageReview.jsx");
  assert.match(triage, /<NfwConfirm/);
  assert.match(triage, /onDecision\("workflow_required"/, "No sends it to Action needed");
  assert.match(triage, /reasonCode, reasonSentences: sentences/);
  const confirm = read("src/modules/clinflow/NfwConfirm.jsx");
  assert.match(confirm, /disabled=\{disabled \|\| !reasonCode\}/, "a reason has to be picked");
  const ws = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.match(ws, /if \(!kind\) \{[\s\S]{0,120}synthetic-triage/, "filing needs a confirmed outcome");
  assert.match(ws, /requestFinishDocument\(\) \{[\s\S]{0,400}folderKindFor/, "finishing needs a confirmed outcome");
  assert.match(ws, /canSpotCheck\(\{ checkerUid: user\?\.uid, confirmedByUid: review\.confirmedByUid \}\)/, "a different person checks");
  assert.match(ws, /clinflow\.nfw\.spot_check/);
  assert.match(ws, /clinflow\.docman\.filed/);
  const rust = read("src-tauri/src/lib.rs");
  assert.match(rust, /fn save_docman_pdf\(app: tauri::AppHandle, kind: String/, "the page names a folder kind, never a path");
  assert.match(rust, /if kind != "nfw" && kind != "action"/);
  assert.match(rust, /create_new\(true\)/, "never overwrites a file");
  assert.match(rust, /b"%PDF-"/);
  assert.match(rust, /tauri_plugin_dialog::init\(\)/);
  assert.ok(!/localStorage/.test(read("src/modules/clinflow/docmanFolders.js")), "the folders are held by the app, not the web page");
});

console.log(`\n${n} passed`);
