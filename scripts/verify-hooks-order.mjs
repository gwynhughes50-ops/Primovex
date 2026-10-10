import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// React needs the same hooks, in the same order, on every render. A component that returns early
// ("if (!item) return null;") and calls a hook (useState, useEffect, useExpirySettings, ...) AFTER that line
// renders fewer hooks while the early return is taken, and crashes ("Rendered more hooks than during the
// previous render") the moment the condition changes. That is how the phone's stock sheet crashed when an
// item was tapped. This reads every component under src and fails if it finds the pattern.

const ROOT = fileURLToPath(new URL("../src/", import.meta.url));

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(jsx|js)$/.test(name) ? [path] : [];
  });
}

// Problems in one file's text: [{ component, returnLine, hookLine, hook }]
export function hookProblems(text) {
  const lines = text.split("\n");
  const problems = [];
  for (let start = 0; start < lines.length; start += 1) {
    const match = lines[start].match(/^(?:export default )?function ([A-Z]\w*)\s*\(/);
    if (!match) continue;
    let end = start + 1;
    while (end < lines.length && lines[end] !== "}" && lines[end] !== "};") end += 1;
    let returnLine = -1;
    for (let i = start + 1; i < end; i += 1) {
      const line = lines[i];
      const single = /^  if \(.*\) return\b/.test(line);
      const block = /^  if \(.*\) \{\s*$/.test(line) && /^    return\b/.test(lines[i + 1] || "");
      if (single || block) { returnLine = i; break; }
    }
    if (returnLine < 0) continue;
    for (let i = returnLine + 1; i < end; i += 1) {
      const code = lines[i].replace(/\/\/.*$/, "");
      const hook = code.match(/\b(use[A-Z]\w*)\(/);
      // a hook inside a nested function (a callback, an effect body) is fine; only the component's own level counts
      const own = /^  (?=\S)(?:(?:const|let|var)\s+[^=]*=\s*)?use[A-Z]\w*\(/.test(code);
      if (hook && own) problems.push({ component: match[1], returnLine: returnLine + 1, hookLine: i + 1, hook: hook[1] });
    }
  }
  return problems;
}

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("the check finds a hook after an early return, and nothing else", () => {
  const bad = ["function Sheet({ item }) {", "  const [a, setA] = useState(1);", "  if (!item) return null;", "  const settings = useExpirySettings();", "  return <div />;", "}"].join("\n");
  assert.deepEqual(hookProblems(bad), [{ component: "Sheet", returnLine: 3, hookLine: 4, hook: "useExpirySettings" }]);
  const good = ["function Sheet({ item }) {", "  const settings = useExpirySettings();", "  const [a, setA] = useState(1);", "  if (!item) return null;", "  return <div />;", "}"].join("\n");
  assert.deepEqual(hookProblems(good), []);
  const nested = ["function Sheet({ item }) {", "  if (!item) return null;", "  const run = () => {", "    useThing();", "  };", "  return <div />;", "}"].join("\n");
  assert.deepEqual(hookProblems(nested), [], "a call inside a nested function isn't the component's own hook");
});

t("no component in the app calls a hook after an early return", () => {
  const found = [];
  for (const path of files(ROOT)) {
    for (const problem of hookProblems(readFileSync(path, "utf8").replace(/\r\n/g, "\n"))) found.push(`${relative(ROOT, path)}: ${problem.component} calls ${problem.hook} (line ${problem.hookLine}) after returning early (line ${problem.returnLine})`);
  }
  assert.deepEqual(found, []);
});

console.log(`\n${n} passed`);
