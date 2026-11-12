// Covers the appearance and reading settings: the pure helpers, the three added colour themes (contrast, and that the default theme did not change), the font rules, and a guard against two files in one folder
// whose names differ only by case (on Windows "./ReadingPreferences" then finds the wrong one and the whole app shows a white screen).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_READING, READING_OPTIONS, loadReading, normaliseReading, readingKey } from "../src/components/theme/readingSettings.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

t("reading settings: only known choices are kept, anything else falls back to the default", () => {
  assert.deepEqual(normaliseReading({}), { ...DEFAULT_READING });
  assert.deepEqual(normaliseReading({ font: "comic-sans", size: "huge", spacing: "x", motion: "none" }), { ...DEFAULT_READING });
  assert.deepEqual(normaliseReading({ font: "verdana", size: "large", spacing: "comfortable", motion: "reduced" }), { font: "verdana", size: "large", spacing: "comfortable", motion: "reduced" });
  assert.deepEqual(normaliseReading(null), { ...DEFAULT_READING });
  assert.deepEqual(Object.keys(READING_OPTIONS).sort(), ["font", "motion", "size", "spacing"]);
});

t("reading settings are saved per person and per kind of device, and a broken or missing saved value is harmless", () => {
  assert.equal(readingKey("abc", "desktop"), "primovex-reading-v1:abc:desktop");
  assert.equal(readingKey("abc", "android"), "primovex-reading-v1:abc:mobile");
  assert.equal(readingKey(undefined, undefined), "primovex-reading-v1:anonymous:mobile");
  assert.notEqual(readingKey("a b", "desktop"), readingKey("a%20b", "desktop"), "the id is encoded");
  const store = (value) => ({ getItem: () => value });
  assert.deepEqual(loadReading(store(null), "k"), { ...DEFAULT_READING });
  assert.deepEqual(loadReading(store("{not json"), "k"), { ...DEFAULT_READING });
  assert.deepEqual(loadReading(store(JSON.stringify({ font: "arial", size: "extra-large" })), "k"), { ...DEFAULT_READING, font: "arial", size: "extra-large" });
  assert.deepEqual(loadReading({ getItem: () => { throw new Error("blocked"); } }, "k"), { ...DEFAULT_READING });
});

// ---- the colour themes ----
const provider = read("src/components/theme/MedTrakThemeProvider.jsx");
const lum = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const themeOf = (id) => {
  const line = provider.split("\n").find((l) => l.includes(`id: "${id}"`));
  assert.ok(line, `theme ${id} is in the list`);
  return Object.fromEntries([...line.matchAll(/(\w+): "(#[0-9a-fA-F]{6})"/g)].map((m) => [m[1], m[2]]));
};

t("the added themes (Primovex Modern, Contemporary, Soft Paper) are complete and readable: text, muted text and accents meet AA contrast on every surface", () => {
  for (const id of ["primovex-modern", "contemporary", "soft-paper"]) {
    const th = themeOf(id);
    for (const key of ["bg", "panel", "panelSoft", "border", "text", "muted", "accent", "accent2"]) assert.match(th[key] || "", /^#[0-9a-f]{6}$/i, `${id} has ${key}`);
    for (const surface of ["bg", "panel", "panelSoft"]) { assert.ok(ratio(th.text, th[surface]) >= 7, `${id} text on ${surface}`); assert.ok(ratio(th.muted, th[surface]) >= 4.5, `${id} muted on ${surface}`); }
    for (const [fg, bg] of [["accent", "panel"], ["accent", "bg"], ["accent2", "panel"]]) assert.ok(ratio(th[fg], th[bg]) >= 4.5, `${id} ${fg} on ${bg}`);
    for (const accent of ["accent", "accent2"]) assert.ok(ratio("#ffffff", th[accent]) >= 4.5, `${id} white text on ${accent}`);
  }
});

t("adding themes at the top of the list did not change what people get by default: an unknown theme falls back to NHS Blue, not to the first in the list", () => {
  assert.match(provider, /const DEFAULT_THEME_ID = "nhs-blue";/);
  assert.match(provider, /MEDTRAK_THEMES\.find\(\(theme\) => theme\.id === themeId\) \|\| MEDTRAK_THEMES\.find\(\(theme\) => theme\.id === DEFAULT_THEME_ID\)/);
  assert.doesNotMatch(provider, /\|\| MEDTRAK_THEMES\[0\]/);
  const ids = [...provider.matchAll(/id: "([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "no theme id is used twice");
});

// ---- the font rules ----
t("fonts: Primovex default leaves the app's font alone, and Arial and Verdana outrank the theme's own font rule so they reach all the text, not only some", () => {
  const css = read("src/components/theme/readingPreferences.css");
  assert.doesNotMatch(css, /--pvx-reading-font/, "no rule that changes the font for everyone by default");
  assert.doesNotMatch(css, /data-reading-font="system"/);
  for (const font of ["arial", "verdana"]) assert.match(css, new RegExp(`html\\[data-reading-font="${font}"\\]\\[data-medtrak-theme\\]`));
  assert.match(provider, /html\[data-medtrak-theme\] button,/, "the theme's own font rule is what these rules have to outrank");
  assert.match(read("src/components/theme/ReadingPreferences.jsx"), /\["system", "Primovex default"\]/);
});

t("the reading settings are wired in: the provider sits inside the theme provider, the controls are on the Appearance page, and nothing is changed until the person chooses", () => {
  assert.match(provider, /<ReadingPreferencesProvider>\{children\}<\/ReadingPreferencesProvider>/);
  assert.match(read("src/pages/ThemeLab.jsx"), /<ReadingControls \/>/);
  const component = read("src/components/theme/ReadingPreferences.jsx");
  assert.match(component, /from '\.\/readingSettings'/);
  assert.match(component, /localStorage\.setItem\(key, JSON\.stringify\(safe\)\)/, "saved on this device only");
});

// ---- the white-screen guard ----
t("no two files in one folder have names that differ only by case, so an import can never pick the wrong one on Windows", () => {
  const clashes = [];
  const walk = (dir) => {
    const names = readdirSync(dir);
    const stems = new Map();
    for (const name of names) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx|mjs|ts|tsx)$/.test(name)) continue;
      const stem = name.replace(/\.(js|jsx|mjs|ts|tsx)$/, "").toLowerCase();
      if (stems.has(stem)) clashes.push(`${full} and ${stems.get(stem)}`); else stems.set(stem, full);
    }
  };
  walk(new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  assert.deepEqual(clashes, []);
});

console.log(`\n${n} passed`);
