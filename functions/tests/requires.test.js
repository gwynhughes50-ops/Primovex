const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// A deploy loads index.js, which needs every file it requires to be found. A name without its extension (a generated .cjs file) is found by nothing, and the
// whole deploy stops. This checks every relative require in index.js and in the services resolves, without starting anything.
function relativeRequires(file) {
  const source = fs.readFileSync(file, "utf8");
  return [...source.matchAll(/require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)].map((m) => m[1]);
}

for (const file of ["index.js", ...fs.readdirSync(path.join(__dirname, "..", "services")).filter((f) => f.endsWith(".js")).map((f) => path.join("services", f))]) {
  test(`every file ${file} requires can be found`, () => {
    const full = path.join(__dirname, "..", file);
    for (const request of relativeRequires(full)) {
      assert.doesNotThrow(() => require.resolve(path.resolve(path.dirname(full), request)), `${file} requires "${request}", which cannot be found`);
    }
  });
}
