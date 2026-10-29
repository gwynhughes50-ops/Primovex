import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

for (const [name, path] of [["desktop", "src/desktop/DesktopSessionShell.jsx"], ["phone", "src/mobile/MobileSessionShell.jsx"]]) {
  t(`the ${name} PIN boxes accept Enter as well as the Continue button`, () => {
    const source = read(path);
    assert.match(source, /const onPinEnter = \(event\) => \{\s*if \(event\.key !== "Enter"\) return;\s*event\.preventDefault\(\);/);
    assert.match(source, /else \(mode === "pin" \? submitPin : savePin\)\(\);/, "Enter does exactly what the button does");
    assert.match(source, /nextElementSibling/, "when creating a PIN, Enter in the first box moves to the confirm box");
    const boxes = source.match(/<input type="password" inputMode="numeric"[^>]*>/g) || [];
    assert.equal(boxes.length, 2);
    for (const box of boxes) assert.ok(box.includes("onKeyDown={onPinEnter}"), "every PIN box listens for Enter");
  });
}

t("ClinFlow dialogs fit the screen and scroll when they are taller than it", () => {
  const css = read("src/modules/clinflow/clinflow-workspace.css");
  assert.match(css, /\.cf-modal>div\{[^}]*max-height:calc\(100vh - 32px\);overflow-y:auto/);
  assert.match(css, /\.cf-inbox>div\{[^}]*max-width:92vw/, "the Incoming scans box never goes wider than the screen");
});

console.log(`\n${n} PIN and dialog checks passed`);
