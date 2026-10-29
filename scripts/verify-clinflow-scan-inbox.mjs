import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { MAX_LETTER_BYTES, SETTLE_MS, createInboxRunner } from "../src/modules/clinflow/scanInboxRunner.js";
import { blankPages, pageContents, segmentsOf, splitAtBlankPages } from "../src/modules/clinflow/scanSplit.js";

// The Incoming scans folder: the reader waits for a scan to settle, reads one letter at a time, never reads a letter twice, gives up only after trying again, never deletes,
// and a stack scanned as one file can be split at blank pages without losing a page.
let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ---- a pretend Incoming folder, clock and reader ----
const pretend = ({ files = [], failTimes = 0, analyseFails = {} } = {}) => {
  const clock = { t: 1_000_000 };
  const folder = {
    files: files.map((f) => ({ modifiedMs: clock.t - 60_000, bytes: new Uint8Array(f.size || 1000), ...f, size: f.size ?? 1000 })),
    moved: [], reads: [],
    list: async () => folder.files.map(({ name, size, modifiedMs }) => ({ name, size, modifiedMs })),
    read: async (name) => { folder.reads.push(name); return folder.files.find((f) => f.name === name).bytes; },
    finish: async (name, outcome) => { folder.moved.push([name, outcome]); folder.files = folder.files.filter((f) => f.name !== name); },
  };
  const letters = []; const calls = [];
  const analyse = async (file) => { calls.push(file.name); if (analyseFails[file.name]?.length) throw new Error(analyseFails[file.name].shift()); return { analysisId: `a-${calls.length}`, fileName: file.name }; };
  const make = (extra = {}) => createInboxRunner({ folder, analyse, onLetter: (item) => letters.push(item), now: () => clock.t, sleep: async () => {}, ...extra });
  return { clock, folder, letters, calls, make };
};

await t("a scan is not read the first time it is seen, only once it has stopped growing and is old enough; then it is read once and moved to done", async () => {
  const p = pretend({ files: [{ name: "letter.pdf" }] });
  const runner = p.make();
  await runner.tick();
  assert.deepEqual(p.calls, [], "first look: only noted");
  await runner.tick();
  assert.deepEqual(p.calls, ["letter.pdf"]);
  assert.deepEqual(p.folder.moved, [["letter.pdf", "done"]]);
  assert.equal(p.letters.length, 1);
  assert.equal(p.letters[0].response.sourceFile.name, "letter.pdf", "the original file travels with the result");
  await runner.tick();
  assert.equal(p.calls.length, 1, "never read again");
});

await t("a scan still being written (growing, or saved a moment ago) is left alone", async () => {
  const p = pretend({ files: [{ name: "growing.pdf", size: 1000 }, { name: "fresh.pdf", modifiedMs: 1_000_000 - 1000 }] });
  const runner = p.make();
  await runner.tick();
  p.folder.files[0].size = 2000; // the scanner is still writing it
  await runner.tick();
  assert.deepEqual(p.calls, [], "neither is read");
  p.clock.t += SETTLE_MS + 1000;
  await runner.tick();
  assert.deepEqual([...p.calls].sort(), ["fresh.pdf", "growing.pdf"], "both are read once they have settled");
});

await t("several scans are read one at a time, oldest first, and a second look that starts while one is running does nothing", async () => {
  const p = pretend({ files: [{ name: "b.pdf", modifiedMs: 900_000 }, { name: "a.pdf", modifiedMs: 800_000 }] });
  const runner = p.make();
  await runner.tick();
  await Promise.all([runner.tick(), runner.tick()]);
  assert.deepEqual(p.calls, ["b.pdf", "a.pdf"], "the reader keeps the order the folder lists them in (oldest first)");
  assert.equal(p.calls.length, 2, "each exactly once, though two looks overlapped");
});

await t("a temporary fault is tried again: one failure then success reads the letter once; three failures move it to problems with the reason", async () => {
  const one = pretend({ files: [{ name: "slow.pdf" }], analyseFails: { "slow.pdf": ["The reader is busy (429)."] } });
  const r1 = one.make();
  await r1.tick(); await r1.tick();
  assert.deepEqual(one.folder.moved, [], "left in the folder after the first failure");
  await r1.tick();
  assert.deepEqual(one.folder.moved, [["slow.pdf", "done"]]);
  assert.equal(one.letters.filter((l) => !l.problem).length, 1, "delivered once");

  const bad = pretend({ files: [{ name: "bad.pdf" }], analyseFails: { "bad.pdf": ["boom 1", "boom 2", "boom 3"] } });
  const r2 = bad.make();
  await r2.tick(); await r2.tick(); await r2.tick(); await r2.tick();
  assert.deepEqual(bad.folder.moved, [["bad.pdf", "problem"]]);
  assert.match(bad.letters.find((l) => l.problem).reason, /could not be read after 3 tries/);
  assert.equal(r2.status().problems, 1);
});

await t("a letter over the reader's 4 MB limit goes straight to problems without being sent, and says how to fix it", async () => {
  const big = pretend({ files: [{ name: "big.pdf", size: 5 * 1024 * 1024, bytes: new Uint8Array(5 * 1024 * 1024) }] });
  const runner = big.make();
  await runner.tick(); await runner.tick();
  assert.deepEqual(big.calls, []);
  assert.deepEqual(big.folder.moved, [["big.pdf", "problem"]]);
  assert.match(big.letters[0].reason, /too large \(5\.0 MB; the limit is 4 MB\)\. Scan at a lower resolution or in black and white/);
  assert.equal(MAX_LETTER_BYTES, 4 * 1024 * 1024);
});

await t("a stack split into letters is read as separate letters named for the scan, the original moves to done once, and a retry never reads a letter twice", async () => {
  const split = async () => ({ parts: [{ bytes: new Uint8Array(500) }, { bytes: new Uint8Array(600) }, { bytes: new Uint8Array(700) }] });
  const p = pretend({ files: [{ name: "stack.pdf" }], analyseFails: { "stack - letter 2 of 3.pdf": ["Reader busy."] } });
  const runner = p.make({ split });
  await runner.tick(); await runner.tick();
  assert.deepEqual(p.calls, ["stack - letter 1 of 3.pdf", "stack - letter 2 of 3.pdf"], "stopped at the letter that failed");
  assert.deepEqual(p.folder.moved, []);
  await runner.tick();
  assert.deepEqual(p.calls, ["stack - letter 1 of 3.pdf", "stack - letter 2 of 3.pdf", "stack - letter 2 of 3.pdf", "stack - letter 3 of 3.pdf"], "letter 1 is not read again");
  assert.deepEqual(p.folder.moved, [["stack.pdf", "done"]]);
  assert.equal(p.letters.filter((l) => !l.problem).length, 3);
});

await t("stopping stops: nothing more is read", async () => {
  const p = pretend({ files: [{ name: "x.pdf" }] });
  const runner = p.make();
  await runner.tick();
  runner.stop();
  await runner.tick();
  assert.deepEqual(p.calls, []);
});

// ---- splitting a stack at blank pages ----
const png = (width, height, pixel) => {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) raw[y * (width + 1) + 1 + x] = pixel(x, y);
  const crcTable = Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
};
let seed = 2463534242; // xorshift: a noisy page that does not compress, like a page of writing
const noise = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed & 255; };
const TEXT = () => png(300, 400, noise); // a page of writing: noisy, so it does not compress
const BLANK = () => png(300, 400, () => 255);
const SIGNATURE = () => png(300, 400, (x, y) => ((x * 7 + y * 13) % 41 === 0 ? noise() : 255)); // mostly white with a few marks
const stack = async (kinds) => {
  const pdf = await PDFDocument.create();
  for (const kind of kinds) {
    const page = pdf.addPage([300, 400]);
    if (kind === "vector") { page.drawText("A typed letter with a text layer", { x: 20, y: 300, font: await pdf.embedFont(StandardFonts.Helvetica), size: 12 }); continue; }
    const image = await pdf.embedPng({ text: TEXT, blank: BLANK, signature: SIGNATURE }[kind]());
    page.drawImage(image, { x: 0, y: 0, width: 300, height: 400 });
  }
  return pdf.save();
};

await t("a stack is split at the blank pages: leading, trailing and repeated blanks make no empty letters, and no written page is lost", async () => {
  const pdf = await PDFDocument.load(await stack(["blank", "text", "text", "blank", "text", "blank", "blank", "text", "text", "text", "blank"]));
  const blank = blankPages(pageContents(pdf));
  assert.deepEqual(blank, [true, false, false, true, false, true, true, false, false, false, true]);
  assert.deepEqual(segmentsOf(blank), [[1, 2], [4], [7, 8, 9]]);
  const result = await splitAtBlankPages(await stack(["text", "text", "blank", "text", "blank", "blank", "text", "text", "text"]));
  assert.deepEqual(result.parts.map((p) => p.pages), [[0, 1], [3], [6, 7, 8]]);
  assert.equal(result.blankPages, 3);
  const counts = await Promise.all(result.parts.map(async (p) => (await PDFDocument.load(p.bytes)).getPageCount()));
  assert.deepEqual(counts, [2, 1, 3]);
  assert.equal(counts.reduce((a, b) => a + b, 0) + result.blankPages, result.pageCount, "every page is in a letter or was a blank separator");
});

await t("it is cautious: one letter, a page with only a signature, and typed pages with a text layer are never split or dropped", async () => {
  assert.equal(await splitAtBlankPages(await stack(["text", "text", "text"])), null, "one letter");
  assert.equal(await splitAtBlankPages(await stack(["text", "blank", "text"])) === null, false, "sanity: this one does split");
  const sig = await PDFDocument.load(await stack(["text", "text", "signature", "text"]));
  const contents = pageContents(sig);
  assert.ok(contents[2].imageBytes > 8000, `the signature page has ${contents[2].imageBytes} bytes of picture, more than a blank page`);
  assert.equal(blankPages(contents)[2], false, "a page with only a signature is kept");
  assert.equal(await splitAtBlankPages(await stack(["text", "signature", "text"])), null);
  assert.equal(await splitAtBlankPages(await stack(["vector", "vector", "vector"])), null, "typed text is never blank");
  assert.equal(await splitAtBlankPages(await stack(["blank", "blank"])), null, "nothing but blanks");
});

await t("the desktop commands are narrow: bare PDF names only, no deleting, moves into two folders inside the Incoming folder, and no clash between file names that differ only by capitals", () => {
  const rust = read("src-tauri/src/lib.rs");
  assert.match(rust, /fn bare_pdf_name\(name: &str\)/);
  assert.match(rust, /!name\.contains\('\/'\)[\s\S]{0,80}!name\.contains\('\\\\'\)[\s\S]{0,80}!name\.contains\("\.\."\)/);
  for (const command of ["list_incoming_scans", "read_incoming_scan", "finish_incoming_scan"]) assert.match(rust, new RegExp(`fn ${command}\\(`));
  const incoming = rust.slice(rust.indexOf("fn incoming_dir"), rust.indexOf("// The shared letters folder"));
  // a scan is deleted in exactly one case: its letter is verified to be stored in the shared folder (and for a single letter, byte for byte the same)
  assert.equal((incoming.match(/remove_file|remove_dir|fs::copy/g) || []).length, 1, "only one place deletes a scan");
  assert.ok(incoming.indexOf("remove_file") > incoming.indexOf('if outcome == "stored"') && incoming.indexOf("remove_file") < incoming.indexOf('let sub = match outcome.as_str()'), "and it is the verified 'stored' case");
  assert.match(incoming, /"ClinFlow done"/);
  assert.match(incoming, /"ClinFlow problems"/);
  assert.match(incoming, /25 \* 1024 \* 1024/);
  const names = readdirSync(new URL("../src/modules/clinflow/", import.meta.url)).map((f) => f.toLowerCase());
  assert.equal(new Set(names).size, names.length, "two files in the ClinFlow folder differ only by capital letters (a problem on Windows)");
});

await t("it is wired: test data only until a person confirms, switched on by a person, quiet when a letter arrives, and the reader can run three at once", () => {
  const ui = read("src/modules/clinflow/ScanInbox.jsx");
  assert.match(ui, /disabled=\{!folders\.incoming \|\| !attested \|\| !canRun\}/);
  assert.match(ui, /invented test letter/);
  assert.match(ui, /analyzeSyntheticDocument\(file, true\)/);
  assert.match(ui, /record\("clinflow\.inbox\.start"/);
  assert.ok(!/localStorage[^;]*attested|attested[^;]*localStorage/.test(ui), "the confirmation is asked for each time, never remembered");
  const ws = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.match(ws, /importAzureResults\(\[response\], \{ quiet: true, source: "Scanned in" \}\)/);
  assert.match(ws, /if \(!quiet\) \{ setSelectedId\(imported\[0\]\.id\); setActiveTab\("synthetic-document"\); \}/, "a background letter does not take over the screen");
  assert.match(read("functions/index.js"), /maxInstances: 3,\s+concurrency: 1,\s+secrets: \[AZURE_DOCUMENT_INTELLIGENCE_KEY/);
});

console.log(`\n${n} passed`);
