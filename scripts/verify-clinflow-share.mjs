import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOMBSTONE_DAYS, createSharedStore, isDone } from "../src/modules/clinflow/clinflowShare.js";
import { listsToLoad, syncSharedLists } from "../src/modules/clinflow/clinflowSharedLists.js";
import { createInboxRunner } from "../src/modules/clinflow/scanInboxRunner.js";

// Several computers sharing letters through one folder: a letter read on one appears on the others with everyone's decisions, a stale save is refused rather than overwriting
// someone's work, and a finished, filed letter leaves only a note with no patient details. Two or three "computers" work on one pretend shared folder here.
let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const DAY = 24 * 60 * 60 * 1000;

const sharedFolder = () => {
  const letters = new Map(); // id -> { files: Map(name -> { bytes, ms }) }
  let clock = 1_700_000_000_000;
  const tick = () => { clock += 1000; return clock; };
  const dir = (id) => { if (!letters.has(id)) letters.set(id, new Map()); return letters.get(id); };
  const api = {
    letters, failReads: new Set(),
    list: async () => [...letters.entries()].map(([id, files]) => ({ id, docMs: files.get("document.json")?.ms || 0, docSize: files.get("document.json")?.bytes.length || 0, pdfSize: files.get("letter.pdf")?.bytes.length || 0, finishedMs: files.get("finished.json")?.ms || 0 })),
    read: async (id, file) => { if (api.failReads.has(`${id}/${file}`)) throw new Error("still syncing"); const found = letters.get(id)?.get(file); if (!found) throw new Error("not there"); return found.bytes; },
    write: async (id, file, bytes) => { dir(id).set(file, { bytes: new Uint8Array(bytes), ms: tick() }); },
    finish: async (id, note) => { const files = dir(id); files.set("finished.json", { bytes: new Uint8Array(note), ms: tick() }); files.delete("document.json"); files.delete("letter.pdf"); },
    forget: async (id) => { letters.delete(id); },
    advance: (ms) => { clock += ms; },
    now: () => clock,
  };
  return api;
};
const computer = (api, name) => createSharedStore({ api, who: { uid: `uid-${name}`, name }, now: api.now });
const pdf = () => new Blob([new TextEncoder().encode("%PDF-1.4 a scan")], { type: "application/pdf" });
const letter = (extra = {}) => ({ id: "cf-azure-abc123", dataMode: "synthetic", title: "Respiratory letter", status: "awaiting_review", syntheticOcr: { content: "Mr Hall...", fileName: "scan.pdf", sourceFile: pdf() }, clinflowAnalysis: { triage: { decision: "workflow_required" } }, ...extra });
const parse = (api, id, file) => JSON.parse(new TextDecoder().decode(api.letters.get(id).get(file).bytes));

await t("a letter saved on one computer appears on another with its scan, and a computer does not take its own save back", async () => {
  const api = sharedFolder(); const a = computer(api, "Ann"); const b = computer(api, "Bea");
  assert.deepEqual(await a.push(letter()), { ok: true, rev: 1 });
  assert.ok(api.letters.get("cf-azure-abc123").get("letter.pdf"), "the scan is kept");
  assert.equal(parse(api, "cf-azure-abc123", "document.json").sharedBy, "Ann");
  const mine = await a.pull();
  assert.deepEqual([mine.upserts.length, mine.count], [0, 1], "Ann does not get her own save back");
  const theirs = await b.pull();
  assert.equal(theirs.upserts.length, 1);
  assert.equal(theirs.upserts[0].document.title, "Respiratory letter");
  assert.ok(theirs.upserts[0].pdf instanceof Blob, "Bea receives the scan too");
  assert.equal((await b.pull()).upserts.length, 0, "and only once");
  assert.ok(!("sourceFile" in parse(api, "cf-azure-abc123", "document.json").syntheticOcr) || parse(api, "cf-azure-abc123", "document.json").syntheticOcr.sourceFile === undefined, "the scan is a separate file, not inside the letter's details");
});

await t("one computer's change reaches the other; a stale save is refused with the newer letter loaded, and nothing is lost silently", async () => {
  const api = sharedFolder(); const a = computer(api, "Ann"); const b = computer(api, "Bea");
  await a.push(letter());
  await b.pull();
  assert.equal((await b.push(letter({ status: "in_review", claimedByUid: "uid-Bea" }))).rev, 2);
  const stale = await a.push(letter({ priority: "high" })); // Ann has not looked since Bea's change
  assert.equal(stale.conflict, true);
  assert.equal(parse(api, "cf-azure-abc123", "document.json").status, "in_review", "Bea's work is still there");
  const caught = await a.pull();
  assert.equal(caught.upserts[0].document.claimedByUid, "uid-Bea");
  assert.equal((await a.push(letter({ priority: "high", claimedByUid: "uid-Bea" }))).rev, 3, "after looking, Ann can save");
});

await t("a finished letter that has been filed in Docman is deleted from the folder, a note with no patient details is left, and others drop it", async () => {
  const api = sharedFolder(); const a = computer(api, "Ann"); const b = computer(api, "Bea");
  await a.push(letter()); await b.pull();
  const finishedNotFiled = letter({ status: "completed" });
  assert.equal(isDone(finishedNotFiled), false, "finished is not enough: it must also have been filed");
  assert.equal((await b.push(finishedNotFiled)).ok, true);
  assert.ok(api.letters.get("cf-azure-abc123").get("letter.pdf"), "still there");
  const done = letter({ status: "completed", triageReview: { savedFolder: "nfw" } });
  assert.deepEqual(await b.push(done), { ok: true, finished: true });
  const files = [...api.letters.get("cf-azure-abc123").keys()];
  assert.deepEqual(files, ["finished.json"], "the letter and its scan are gone");
  const note = JSON.parse(new TextDecoder().decode(api.letters.get("cf-azure-abc123").get("finished.json").bytes));
  assert.deepEqual(Object.keys(note).sort(), ["at", "byUid", "id", "reason"], "no patient details in the note");
  assert.deepEqual((await a.pull()).finishedIds, ["cf-azure-abc123"]);
  assert.equal((await a.pull()).finishedIds.length, 0, "told once");
  assert.deepEqual(await a.push(letter()), { skipped: "finished" }, "a finished letter is never put back");
  assert.deepEqual(await b.push(done), { skipped: "finished" });
});

await t("a computer that joins late, holding a letter someone has since finished, learns that first and does not put it back", async () => {
  const api = sharedFolder(); const a = computer(api, "Ann"); const late = computer(api, "Cal");
  await a.push(letter());
  await a.push(letter({ status: "completed", triageReview: { savedFolder: "action" } }));
  assert.equal(late.knows("cf-azure-abc123"), false);
  await late.pull();
  assert.equal(late.knows("cf-azure-abc123"), true, "after looking it knows the letter is finished");
  assert.deepEqual(await late.push(letter()), { skipped: "finished" });
  assert.ok(!api.letters.get("cf-azure-abc123").has("document.json"));
});

await t("a letter that has not finished syncing is tried again next time, not skipped; real-patient letters are never shared", async () => {
  const api = sharedFolder(); const a = computer(api, "Ann"); const b = computer(api, "Bea");
  await a.push(letter());
  api.failReads.add("cf-azure-abc123/document.json");
  const first = await b.pull();
  assert.deepEqual([first.upserts.length, first.problems.length], [0, 1]);
  api.failReads.clear();
  assert.equal((await b.pull()).upserts.length, 1, "picked up on the next look");
  assert.deepEqual(await a.push(letter({ id: "cf-live-letter-9", dataMode: "live" })), { skipped: "not shared" });
  assert.equal(api.letters.has("cf-live-letter-9"), false);
});

await t("old finished notes are tidied away after a month, and not before", async () => {
  const api = sharedFolder(); const a = computer(api, "Ann"); const b = computer(api, "Bea");
  await a.push(letter()); await a.push(letter({ status: "completed", triageReview: { savedFolder: "nfw" } }));
  await b.pull();
  assert.ok(api.letters.has("cf-azure-abc123"));
  api.advance((TOMBSTONE_DAYS + 1) * DAY);
  await computer(api, "Dee").pull();
  assert.equal(api.letters.has("cf-azure-abc123"), false);
});

await t("a scan is deleted from the Incoming folder only when every letter from it is stored in the shared folder; otherwise it is moved to 'done'", async () => {
  const folder = (calls) => ({ list: async () => [{ name: "s.pdf", size: 10, modifiedMs: 1 }], read: async () => new Uint8Array(10), finish: async (...a) => calls.push(["finish", ...a]), finishStored: async (...a) => calls.push(["stored", ...a]) });
  const run = async (onLetter, extra = {}) => { const calls = []; const runner = createInboxRunner({ folder: { ...folder(calls), ...extra }, analyse: async (f) => ({ fileName: f.name }), onLetter, now: () => 10_000_000, sleep: async () => {}, settleMs: 0 }); await runner.tick(); await runner.tick(); return calls; };
  assert.deepEqual(await run(async () => ({ storedId: "cf-azure-1" })), [["stored", "s.pdf", ["cf-azure-1"]]]);
  assert.deepEqual(await run(async () => null), [["finish", "s.pdf", "done"]], "not stored: kept");
  assert.deepEqual(await run(async () => ({ storedId: "cf-azure-1" }), { finishStored: async () => { throw new Error("The stored copy does not match"); } }), [["finish", "s.pdf", "done"]], "the desktop app refused: the scan is kept");
});

await t("the desktop commands for the shared folder are narrow: ids and three file names only, no path from the page, checked content, deletes only what a finished letter owns", () => {
  const rust = read("src-tauri/src/lib.rs");
  const shared = rust.slice(rust.indexOf("fn shared_dir"), rust.indexOf("// Downloads a practice document"));
  assert.match(shared, /fn letter_id\(id: &str\)[\s\S]{0,200}is_ascii_alphanumeric\(\) \|\| c == '-' \|\| c == '_'/);
  assert.match(shared, /"document\.json" => Ok\("document\.json"\)[\s\S]{0,80}"letter\.pdf" => Ok\("letter\.pdf"\)[\s\S]{0,80}"finished\.json" => Ok\("finished\.json"\)/);
  assert.ok(!/remove_dir_all/.test(rust), "no command deletes a folder and everything in it");
  const removals = shared.match(/remove_file|remove_dir\b/g) || [];
  assert.ok(removals.length > 0 && removals.length <= 4, "deleting happens only when a letter is finished or its note is tidied");
  assert.match(shared, /fn shared_forget[\s\S]{0,700}still holds the letter, so it was not removed/);
  assert.match(shared, /b"%PDF-"/);
  const stored = rust.slice(rust.indexOf('if outcome == "stored"'), rust.indexOf("let sub = match outcome.as_str()"));
  assert.match(stored, /byte for byte|does not match the scan, so the scan was kept/);
  assert.match(stored, /not in the shared folder yet, so the scan was kept/);
});

await t("on the screen: sharing is off until a person confirms test letters and switches it on, and the saves, archives and deletes all reach the shared folder", () => {
  const ui = read("src/modules/clinflow/ScanInbox.jsx");
  assert.match(ui, /disabled=\{!folders\.shared \|\| !attested \|\| !canRun\}/);
  assert.match(ui, /setClinFlowMirror\(async \(docs\)/);
  assert.match(ui, /return \(\) => \{ stopped = true; clearInterval\(timer\); clearInterval\(listTimer\); setClinFlowMirror\(null\)/, "switching it off stops it");
  assert.match(ui, /await cycle\(\); \/\/ first learn what the shared folder holds, including letters already finished/);
  const cache = read("src/modules/clinflow/clinflowDocumentCache.js");
  assert.match(cache, /if \(mirrored && mirror\) Promise\.resolve\(mirror\(documents\)\)\.catch/, "a shared folder fault never fails a save");
  const ws = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.match(ws, /activeShare\.current\?\.finish\(selected, "archived"\)/);
  assert.match(ws, /activeShare\.current\?\.finish\(selected, "deleted"\)/);
  assert.match(ws, /cacheClinFlowDocuments\(incoming, \{ mirrored: false \}\)/, "what comes in is not sent straight back out");
  assert.match(ws, /onShared=\{applySharedChanges\}/);
});

await t("the three lists are loaded from the shared folder once, again only when the shared file changes or this computer has lost its copy, and a file still syncing is tried again", async () => {
  const files = { "snomed-uk-index.json.gz": new Uint8Array(5_000_000).fill(7), "dmd-index.json.gz": new Uint8Array(1200).fill(3), "abbreviations.csv": new TextEncoder().encode("AF,atrial fibrillation\nHTN,hypertension\n") };
  const mtimes = { "snomed-uk-index.json.gz": 100, "dmd-index.json.gz": 200, "abbreviations.csv": 300 };
  const failing = new Set(); const reads = [];
  const api = {
    listsStatus: async () => Object.keys(files).map((name) => ({ name, size: files[name].length, modifiedMs: mtimes[name] })),
    readListChunk: async (name, offset, length) => { if (failing.has(name)) throw new Error("still syncing"); reads.push([name, offset, length]); return files[name].slice(offset, offset + length); },
  };
  const loaded = []; const loaders = Object.fromEntries(["snomed", "dmd", "abbreviations"].map((kind) => [kind, async (file) => { loaded.push([kind, file.name, file.size]); }]));
  const memory = {}; const stamps = { get: (name) => memory[name] || "", set: (name, stamp) => { memory[name] = stamp; } };
  const first = await syncSharedLists({ api, loaders, stamps, have: {} });
  assert.deepEqual(first.results.map((r) => [r.kind, r.ok]), [["snomed", true], ["dmd", true], ["abbreviations", true]]);
  assert.deepEqual(loaded.map((l) => l[2]), [5_000_000, 1200, files["abbreviations.csv"].length], "whole files, put back together");
  assert.ok(reads.filter((r) => r[0] === "snomed-uk-index.json.gz").every((r) => r[2] <= 2 * 1024 * 1024), "read in pieces of at most 2 MB");
  loaded.length = 0;
  assert.equal((await syncSharedLists({ api, loaders, stamps, have: { snomed: true, dmd: true } })).results.length, 0, "nothing changed: nothing loaded");
  assert.equal((await syncSharedLists({ api, loaders, stamps, have: { snomed: undefined, dmd: undefined } })).results.length, 0, "still opening its own copy: waits");
  mtimes["dmd-index.json.gz"] = 999;
  assert.deepEqual((await syncSharedLists({ api, loaders, stamps, have: { snomed: true, dmd: true } })).results.map((r) => r.kind), ["dmd"], "a changed file is loaded again");
  assert.deepEqual((await syncSharedLists({ api, loaders, stamps, have: { snomed: false, dmd: true } })).results.map((r) => r.kind), ["snomed"], "a computer that has lost its copy gets it back");
  mtimes["abbreviations.csv"] = 5; failing.add("abbreviations.csv");
  const stuck = await syncSharedLists({ api, loaders, stamps, have: { snomed: true, dmd: true } });
  assert.deepEqual([stuck.results[0].ok, stuck.results[0].error], [false, "still syncing"]);
  failing.clear();
  assert.deepEqual((await syncSharedLists({ api, loaders, stamps, have: { snomed: true, dmd: true } })).results.map((r) => [r.kind, r.ok]), [["abbreviations", true]], "tried again and loaded");
  assert.deepEqual(listsToLoad({ status: [{ name: "other.txt", size: 1, modifiedMs: 1 }], stamps: {}, have: {} }), [], "only the three lists");
});

await t("the lists are loaded through the screen's own audited loaders, only while sharing is on, and the desktop commands name only the three files", () => {
  const ui = read("src/modules/clinflow/ScanInbox.jsx");
  assert.match(ui, /syncSharedLists\(\{ api: sharedLetters, loaders: latest\.current\.lists\.loaders/);
  assert.match(ui, /clearInterval\(listTimer\)/, "stops when sharing stops");
  const ws = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.match(ws, /snomed: auditedList\(snomedList, "snomed"\)\.load, dmd: auditedList\(medicinesList, "dmd"\)\.load, abbreviations: auditedAbbreviations\.load/);
  assert.match(ws, /snomed: snomedList\.loading \? undefined : Boolean\(snomedList\.search\)/, "no needless fetch while this computer is still opening its own copy");
  const rust = read("src-tauri/src/lib.rs");
  assert.match(rust, /"snomed-uk-index\.json\.gz" => Ok\("snomed-uk-index\.json\.gz"\)[\s\S]{0,120}"dmd-index\.json\.gz" => Ok[\s\S]{0,120}"abbreviations\.csv" => Ok/);
  assert.match(rust, /length\.min\(2 \* 1024 \* 1024\)/, "a piece is never more than 2 MB");
  assert.ok(!/fn shared_lists_[a-z]+[\s\S]{0,600}remove_file/.test(rust), "reading the lists never deletes anything");
});

t("the shared folder can be checked from the screen, and a OneDrive placeholder folder is still counted as a folder", () => {
  const rust = read("src-tauri/src/lib.rs");
  assert.match(rust, /fn entry_is_folder\(entry: &fs::DirEntry\) -> bool \{\s*entry\.file_type\(\)\.map\(\|t\| t\.is_dir\(\)\)\.unwrap_or\(false\) \|\| entry\.path\(\)\.is_dir\(\)/);
  const list = rust.slice(rust.indexOf("fn shared_list("), rust.indexOf("fn shared_read("));
  assert.match(list, /!entry_is_folder\(&entry\)/, "the listing uses it");
  assert.ok(!/entry\.metadata\(\)/.test(list), "the listing no longer trusts the entry's own metadata alone");
  const probe = rust.slice(rust.indexOf("fn shared_probe("), rust.indexOf("// Every letter folder:"));
  assert.ok(!/remove_|write\(|create_dir/.test(probe), "checking the folder only looks");
  assert.match(rust, /      shared_probe,\n/, "the command is registered");
  assert.match(read("src/modules/clinflow/docmanFolders.js"), /probe: \(\) => call\("shared_probe"\)/);
  const screen = read("src/modules/clinflow/ScanInbox.jsx");
  assert.match(screen, />Check the folder</);
  assert.match(screen, /Letter folders found: <b>\{probe\.letters\}<\/b>/);
  assert.match(screen, /shareStatus\.count === 0 && !shareStatus\.error/, "an empty result points at the button");
});

console.log(`\n${n} passed`);
