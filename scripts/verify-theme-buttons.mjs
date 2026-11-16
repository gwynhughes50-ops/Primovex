// A primary button, and anything else filled with the theme's blue, keeps readable text on the light themes. (Found when "Add many at once" on the PAT register showed dark navy text on the blue.)
// The real check is a contrast scan in a browser; this keeps the two rules that fix it from being lost.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/components/theme/MedTrakThemeProvider.jsx", import.meta.url), "utf8");
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("a primary button always takes the on-accent text colour, heavier than the light theme's old text-colour rules", () => {
  const rule = /html\[data-medtrak-theme\] \[data-mt-button="default"\]\[data-mt-button\]\[data-mt-button\],\s*html\[data-medtrak-theme\] \[data-mt-button="default"\]\[data-mt-button\]\[data-mt-button\] \* \{\s*color: var\(--mt-on-accent\) !important;/;
  assert.match(css, rule);
});

t("anything filled with the blue (either way the screens write it) keeps white text on the light themes, but a pale tint or a hover-only fill is left alone", () => {
  assert.match(css, /html\.medtrak-light :is\(\[class\*="bg-\[var\(--medtrak-accent\)\]"\], \[class\*="bg-\[color:var\(--medtrak-accent\)\]"\]\):not\(\[class\*="--medtrak-accent\)\]\/"\], \[class\*=":bg-\[var\(--medtrak-accent\)\]"\], \[class\*=":bg-\[color:var\(--medtrak-accent\)\]"\]\):is\(\.text-white, \.text-slate-950, \.text-slate-900, \.text-slate-50, \.text-black\)/);
  assert.match(css, /color: var\(--mt-on-accent, #ffffff\) !important;/);
});

t("the light theme's on-accent colour is white", () => {
  assert.match(css, /html\.medtrak-light \{[^}]*--mt-on-accent: #ffffff;/s);
});

console.log(`\n${n} checks passed`);
