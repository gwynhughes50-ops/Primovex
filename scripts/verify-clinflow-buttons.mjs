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

console.log(`\n${n} passed`);
