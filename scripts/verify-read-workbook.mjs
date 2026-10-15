import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { readWorkbook } from "../src/modules/training/readWorkbook.js";
import { parseTrainingSheets } from "../src/modules/training/trainingImport.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

// a small workbook built here: two sheets, shared and inline strings, numbers, a blank, and an entity in a name
const files = {
  "xl/workbook.xml": strToU8('<workbook xmlns:r="x"><sheets><sheet name="Nursing &amp; Team" sheetId="1" r:id="rId1"/><sheet name="Second" sheetId="2" r:id="rId2"/></sheets></workbook>'),
  "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId2" Type="t" Target="worksheets/sheet9.xml"/><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/></Relationships>'),
  "xl/sharedStrings.xml": strToU8("<sst><si><t>Job Role</t></si><si><t>Information Governance EXP 2 yearly</t></si><si><t>Fire Safety EXP 2 yearly</t></si><si><t>Care Navigation</t></si><si><r><t>Nu</t></r><r><t>rse</t></r></si><si><t>Ann</t></si><si><t>Example</t></si></sst>"),
  "xl/worksheets/sheet1.xml": strToU8(
    '<worksheet><sheetData>'
    + '<row r="3"><c r="A3" t="s"><v>0</v></c><c r="D3" t="s"><v>1</v></c><c r="E3" t="s"><v>2</v></c><c r="F3" t="s"><v>3</v></c></row>'
    + '<row r="4"><c r="A4" t="s"><v>4</v></c><c r="B4" t="s"><v>5</v></c><c r="C4" t="s"><v>6</v></c><c r="D4"><v>46753</v></c><c r="E4"/><c r="F4"><v>44835</v></c></row>'
    + '</sheetData></worksheet>'),
  "xl/worksheets/sheet9.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>typed here</t></is></c><c r="B1" t="str"><v>formula text</v></c><c r="C1" t="b"><v>1</v></c></row></sheetData></worksheet>'),
};
const bytes = zipSync(files);

t("sheets are found by their relationship, with names unescaped, in the order they are listed", () => {
  const sheets = readWorkbook(bytes);
  assert.deepEqual(sheets.map((s) => s.name), ["Nursing & Team", "Second"]);
});

t("cells: shared strings (including split ones), numbers, inline and formula text; blanks and booleans are left out", () => {
  const [first, second] = readWorkbook(bytes);
  assert.deepEqual(first.rows[1], { r: 4, cells: { 1: "Nurse", 2: "Ann", 3: "Example", 4: 46753, 6: 44835 } });
  assert.deepEqual(second.rows[0].cells, { 1: "typed here", 2: "formula text" });
});

t("a workbook read this way imports as a training matrix", () => {
  const out = parseTrainingSheets(readWorkbook(bytes).slice(0, 1).map((s) => ({ ...s, rows: s.rows })));
  assert.equal(out.people[0].name, "Ann Example");
  assert.deepEqual(out.courses.map((c) => c.name), ["Information Governance", "Fire Safety", "Care Navigation"]);
  assert.equal(out.records.length, 2);
  assert.equal(out.records[0].dueOn, "2028-01-01");
});

console.log(`\n${n} passed`);
