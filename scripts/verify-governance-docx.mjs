import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

// Word refuses a file with an invalid number in it, or with the document's page settings in the wrong place, or with a table that has two column grids.
// These three faults made the first version-0.3 Word files impossible to open ("Word experienced an error trying to open the file"). Word is not available here to try them, so these
// are the structural rules checked instead; the full schema check is the validator in the docx skill (scripts/office/validate.py).
const FILES = [
  "public/governance/dpia-draft.docx",
  "public/governance/data-sharing-map.docx",
  "public/governance/security-review-and-penetration-test.docx",
  "docs/security-review-and-penetration-test.docx",
];
const documentXml = (path) => strFromU8(unzipSync(new Uint8Array(readFileSync(new URL(`../${path}`, import.meta.url))))["word/document.xml"]);

for (const path of FILES) {
  t(`${path} is a Word file Word can open: numeric page margins, section last, one column grid per table`, () => {
    const xml = documentXml(path);
    assert.ok(!/="(undefined|NaN|null)"/.test(xml), "no attribute holds the word undefined, NaN or null");
    const margins = /<w:pgMar [^>]*>/.exec(xml)?.[0] || "";
    for (const attribute of ["top", "right", "bottom", "left", "header", "footer", "gutter"]) assert.match(margins, new RegExp(`w:${attribute}="-?\\d+"`), `the ${attribute} page margin is a number`);
    const body = xml.slice(xml.indexOf("<w:body>") + 8, xml.lastIndexOf("</w:body>")).trim();
    assert.ok(body.endsWith("</w:sectPr>"), "the section properties are the last thing in the body");
    assert.equal((body.match(/<w:sectPr[ >]/g) || []).length, 1, "there is one section");
    for (const table of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []) assert.equal((table.match(/<w:tblGrid>/g) || []).length, 1, "each table has exactly one column grid");
    assert.ok(!/<w:tc>(?:(?!<w:p[ >/]).)*?<\/w:tc>/s.test(xml), "every table cell holds a paragraph");
  });
}

t("the library entries for the three documents give the right file names", () => {
  const config = readFileSync(new URL("../src/config/governanceDocuments.js", import.meta.url), "utf8");
  for (const name of ["dpia-draft", "data-sharing-map", "security-review-and-penetration-test"]) assert.ok(config.includes(`/governance/${name}.docx`), name);
});

console.log(`\n${n} passed`);
