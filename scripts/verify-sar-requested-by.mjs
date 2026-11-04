import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getRequestedByDisplay } from "../src/modules/governance/services/sarService.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

// The words the phone page shows (the same rule as the desktop register): a company shows its name and a small tag.
const words = (sar) => { const r = getRequestedByDisplay(sar); return r.tag ? `${r.label} (${r.tag.toLowerCase()})` : r.label; };

t("getRequestedByDisplay gives an object (label, tag, isCompany), never text, so it must not be put on a screen as it is", () => {
  for (const sar of [{}, { requestedBy: "patient" }, { requestedBy: "company", requestedByOther: "Acme Solicitors" }, { requestedBy: "other" }, { requestedBy: "solicitor" }]) {
    const r = getRequestedByDisplay(sar);
    assert.equal(typeof r, "object");
    assert.equal(typeof r.label, "string");
  }
});

t("the words for each kind of requester", () => {
  assert.equal(words({}), "Patient");
  assert.equal(words({ requestedBy: "company", requestedByOther: "Acme Solicitors" }), "Acme Solicitors (company)");
  assert.equal(words({ requestedBy: "company" }), "Company");
  assert.equal(words({ requestedBy: "other", requestedByOther: "A relative" }), "A relative (other)");
  assert.equal(words({ requestedBy: "other" }), "Other");
});

t("no screen puts the object straight into the page (that made the phone SARs page go white)", () => {
  const bad = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.jsx$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        if (/\{\s*getRequestedByDisplay\(/.test(text)) bad.push(full);
        if (/\[[^\]\n]*getRequestedByDisplay\([^)]*\)\s*\]\.some/.test(text)) bad.push(`${full} (search)`);
      }
    }
  };
  walk("src");
  assert.deepEqual(bad, []);
});

console.log(`\n${n} passed`);
