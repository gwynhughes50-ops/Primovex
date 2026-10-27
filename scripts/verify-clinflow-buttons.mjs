import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const dir = new URL("../src/modules/clinflow/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".jsx"));

// every <button> and <ActionButton> tag in the ClinFlow screens, with the line it starts on
function tags(source) {
  const found = [];
  for (const m of source.matchAll(/<(button|ActionButton)\b/g)) {
    let depth = 0; let j = m.index + m[0].length;
    for (; j < source.length; j += 1) {
      const c = source[j];
      if (c === "{") depth += 1; else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0 && source[j - 1] !== "=") break;
    }
    found.push({ tag: source.slice(m.index, j + 1), line: source.slice(0, m.index).split("\n").length });
  }
  return found;
}

t("no button in ClinFlow is left without something to do", () => {
  const dead = [];
  for (const file of files) {
    for (const { tag, line } of tags(readFileSync(new URL(file, dir), "utf8"))) {
      if (!/\bonClick\b/.test(tag) && !/type="submit"/.test(tag)) dead.push(`${file}:${line} ${tag.slice(0, 90)}`);
    }
  }
  assert.deepEqual(dead, [], `buttons with no handler:\n${dead.join("\n")}`);
});

t("no button only pretends: a placeholder message instead of an action is not allowed", () => {
  const source = readFileSync(new URL("ClinFlowWorkspace.jsx", dir), "utf8");
  for (const phrase of ["will open here", "review opened\")", "coming soon", "not implemented"]) assert.ok(!source.toLowerCase().includes(phrase.toLowerCase()), `placeholder text: ${phrase}`);
  assert.match(source, /ClinFlow cannot open the patient record yet/, "the patient-record button says plainly why it cannot");
});

t("every copy button tells the person whether it worked", () => {
  for (const file of files) {
    const source = readFileSync(new URL(file, dir), "utf8");
    if (file === "SyntheticDocumentTestPanel.jsx") continue; // not used anywhere
    assert.ok(!/navigator\.clipboard\.writeText/.test(source), `${file} writes to the clipboard without the shared helper that reports failure`);
  }
  const helper = readFileSync(new URL("copyText.js", dir), "utf8");
  assert.match(helper, /execCommand\("copy"\)|execCommand\?\.\("copy"\)/, "the older route is tried when the browser refuses");
  const panel = readFileSync(new URL("DocmanReadiness.jsx", dir), "utf8");
  assert.match(panel, /Not copied/);
  const review = readFileSync(new URL("CodeReview.jsx", dir), "utf8");
  assert.match(review, /Could not copy/);
});

t("the sample letter's zoom and download buttons do what they say", () => {
  const source = readFileSync(new URL("ClinFlowWorkspace.jsx", dir), "utf8");
  assert.match(source, /aria-label="Zoom out"/);
  assert.match(source, /aria-label="Zoom in"/);
  assert.match(source, /aria-label="Download this letter as a PDF"[^>]*>|onClick=\{downloadDocument\} aria-label="Download this letter as a PDF"/);
  assert.match(source, /zoom: sampleZoom \/ 100/);
});

t("ClinFlow starts empty: no made-up demonstration letters, and any copy an earlier version saved is cleared away", () => {
  const source = readFileSync(new URL("ClinFlowWorkspace.jsx", dir), "utf8");
  assert.match(source, /const SAMPLE_DOCUMENTS = \[\];/, "no demonstration letters are built in");
  assert.ok(!/Mr John Smith|Mrs Mary Jones|Mr Robert Williams|Mrs Susan Brown|Miss Emily Wilson|Mr Peter Thomas|Mr Alan Johnson/.test(source), "none of the demonstration patients remain");
  assert.match(source, /RETIRED_SAMPLE_IDS = \["cf-001", "cf-002", "cf-003", "cf-004", "cf-005", "cf-006", "cf-007", "cf-008"\]/);
  assert.match(source, /removeCachedClinFlowDocument\(item\.id\)/, "a saved copy is removed as it is found");
  assert.ok((source.match(/loadCachedWithoutSamples\(\)/g) || []).length >= 2, "both the first load and Refresh use it");
  assert.ok(!/saveDemoQueue|saveSyntheticWorkflowQueue/.test(source), "the 'save the demonstration queue' button is gone");
  assert.match(source, /There are no letters in ClinFlow yet/, "the empty screen says what to do");
  assert.match(source, /useState\(SAMPLE_DOCUMENTS\[0\]\?\.id \|\| ""\)/, "an empty list cannot crash the screen");
});

console.log(`
${n} passed`);
