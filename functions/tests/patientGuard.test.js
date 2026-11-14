const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { checkText, findIdentifiers, redactText } = require("../services/patientGuard.cjs");

// the server applies the same rules as the app (the file is generated from src/ai/guard/patientGuard.js)
test("names and other identifiers are refused, and ordinary questions pass", () => {
  for (const text of ["Mrs Jones has complained about her letter", "reply to Margaret Smith please", "her NHS number is 943 476 5919", "call 07700 900123", "j.smith@example.com", "lives at 12 High Street", "CF10 1AA"]) {
    assert.equal(checkText(text).ok, false, text);
  }
  for (const text of ["Which stock is low?", "SAR for EMIS 1234567, patient JS, born 04/05/1960", "Count the gloves, I have 12", "Take me to the SARs", "I miss the deadline sometimes"]) {
    assert.equal(checkText(text).ok, true, text);
  }
});

test("colleagues' names are allowed, and a message says what was found and what to do", () => {
  assert.equal(checkText("when did Craig last log in", { allow: ["Craig Davies"] }).ok, true);
  assert.equal(checkText("when did Craig last log in").ok, false);
  const out = checkText("write to Margaret Smith");
  assert.match(out.message, /^I can't process this because it looks like it contains a person's name \(“Margaret Smith”\)\./);
  assert.equal(redactText("write to Margaret Smith", findIdentifiers("write to Margaret Smith")), "write to [removed]");
});

test("both server paths that call an AI refuse such text first, and audit only the kind and count", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(source, /const \{ checkText: checkPatientText \} = require\("\.\/services\/patientGuard\.cjs"\);/);
  const route = source.slice(source.indexOf("exports.orbRoute"), source.indexOf("exports.orbPhrase"));
  const phrase = source.slice(source.indexOf("exports.orbPhrase"), source.indexOf("exports.rotaReviewSummary"));
  assert.match(route, /refuseIdentifiers\(\{ request, profile, text: request\.data\?\.question, path: "route" \}\)/);
  assert.ok(route.indexOf("refuseIdentifiers") < route.indexOf("routeQuestion({"), "checked before the model is called");
  assert.match(phrase, /refuseIdentifiers\(\{ request, profile, text: request\.data\?\.question, path: "phrase" \}\)/);
  assert.ok(phrase.indexOf("refuseIdentifiers") < phrase.indexOf("phraseAnswer({"));
  const helper = source.slice(source.indexOf("async function refuseIdentifiers"), source.indexOf("// The Orb's language layer"));
  assert.match(helper, /metadata: \{ path, kinds: \[\.\.\.new Set\(guard\.problems\.map\(\(p\) => p\.kind\)\)\], count: guard\.problems\.length \}/);
  assert.ok(!/text/.test(helper.slice(helper.indexOf("metadata:"))), "the text is never written to the log");
});
