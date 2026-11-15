import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PulseOrbFace from "../src/components/pulse/PulseOrbFace.jsx";
import OrbStatusPanel from "../src/orb/OrbStatusPanel.jsx";
import { buildOrbStatus } from "../src/modules/orbStatus/orbStatus.js";
import { readFileSync } from "node:fs";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const face = (props) => renderToStaticMarkup(React.createElement(PulseOrbFace, props));

t("the orb takes its traffic-light colour from the level, and keeps its blue with none", () => {
  for (const level of ["green", "amber", "red"]) assert.ok(face({ level }).includes(`pvx-orb--${level}`), level);
  const plain = face({});
  assert.ok(!/pvx-orb--(green|amber|red)/.test(plain));
  assert.ok(face({ level: "red", active: true }).includes("pvx-orb--active"), "a change still quickens it");
});

t("the pulse quickens from green to amber to red without going frantic, and red stays subtle", () => {
  const css = readFileSync("src/components/pulse/PulseOrbFace.css", "utf8");
  const rule = (level) => [...css.matchAll(new RegExp(String.raw`\.pvx-orb--${level}\s*\{([^}]*)\}`, "g"))].map((m) => m[1]).find((body) => body.includes("--tempo")) || "";
  const tempo = (level) => Number(/--tempo:\s*([\d.]+)s/.exec(rule(level))?.[1]);
  assert.ok(tempo("green") > tempo("amber") && tempo("amber") > tempo("red"), "calm, quicker, quickest");
  assert.ok(tempo("red") >= 2, "never faster than a slow heartbeat");
  const beat = Number(/--beat-up:\s*([\d.]+)/.exec(rule("red"))?.[1]);
  assert.ok(beat > 1.045 && beat <= 1.08, "a little harder, not a thump");
  assert.match(css, /prefers-reduced-motion[\s\S]*pvx-orb--red \.pvx-orb-track \{ stroke-width: 8/, "someone who wants no movement still sees a firmer ring for red");
});

t("the orb draws the Primovex P on a disc with a ring and an orbiting light, and says what Ask Primovex is doing", () => {
  const html = face({ level: "green" });
  for (const part of ["pvx-orb-bowl", "pvx-orb-stem", "pvx-orb-plus", "pvx-orb-disc", "pvx-orb-track", "pvx-orb-arc", "pvx-orb-dot", "pvx-orb-bar"]) assert.ok(html.includes(part), part);
  assert.equal((html.match(/pvx-orb-bar"/g) || []).length, 36, "36 voice bars");
  for (const mode of ["listening", "thinking", "speaking"]) assert.ok(face({ mode }).includes(`pvx-orb--${mode}`), mode);
  assert.ok(!/pvx-orb--(listening|thinking|speaking)/.test(face({ mode: "dancing" })), "an unknown mode is ignored");
  assert.ok(face({ still: true }).includes("pvx-orb--still"));
});

t("each orb has its own gradient and glow ids, so several on one page never borrow from each other", () => {
  const ids = (html) => [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  const both = renderToStaticMarkup(React.createElement(React.Fragment, null, React.createElement(PulseOrbFace, {}), React.createElement(PulseOrbFace, {})));
  const a = ids(both);
  assert.equal(a.length, 8);
  assert.equal(new Set(a).size, 8);
  assert.ok(a.every((id) => !/[^a-zA-Z0-9_-]/.test(id)), "ids that work inside url(#...)");
});

t("the disc takes its colour from the theme, with plain black and white on High Contrast and a lighter tint on light themes", () => {
  const css = readFileSync("src/components/pulse/PulseOrbFace.css", "utf8");
  assert.match(css, /--o-disc:\s*color-mix\(in srgb, var\(--o-accent\) 13%, var\(--o-base\)\)/);
  assert.match(css, /--o-base:\s*color-mix\(in srgb, var\(--medtrak-bg, #020617\) 74%, #000\)/);
  assert.match(css, /html\.medtrak-light \.pvx-orb \{[^}]*--o-disc: color-mix\(in srgb, var\(--o-accent\) 9%, #ffffff\)/);
  assert.match(css, /high-contrast"\] \.pvx-orb \{[^}]*--o-disc: #000; --o-edge: #fff/);
  assert.match(css, /high-contrast"\] \.pvx-orb-bowl[^{]*\{ fill: #fff; \}/, "no gradient on High Contrast");
  const level = (name) => /--o-level:\s*(#[0-9a-f]{6})/i.exec(new RegExp(String.raw`\.pvx-orb--${name}\s*\{([^}]*)\}`).exec(css)?.[1] || "")?.[1];
  assert.deepEqual(["green", "amber", "red"].map(level), ["#6df2a0", "#ffc24a", "#ff6b6b"]);
});

t("the orb window and the app draw the same orb", () => {
  assert.match(readFileSync("src/orb-window/orb.js", "utf8"), /face\.innerHTML = orbSvg\(/);
  assert.match(readFileSync("src/components/pulse/PulseOrbFace.jsx", "utf8"), /orbSvg\(/);
  assert.ok(!readFileSync("orb.html", "utf8").includes("pvx-orb-core"), "the old markup is gone");
});

t("the panel says what is wrong and where to go; quiet when green if asked", () => {
  const now = new Date(2026, 9, 10, 12);
  const status = buildOrbStatus({ scope: { key: "caretaker", areas: ["compliance"] }, dueInputs: { incidents: [{ id: "i", assetId: "a", assetLabel: "Staff Kitchen Hot Tap", status: "open", openedAtMs: now.getTime() - 86400000, actions: [] }] }, now });
  const html = renderToStaticMarkup(React.createElement(OrbStatusPanel, { status }));
  assert.ok(html.includes("Something has failed or is overdue") && html.includes("Staff Kitchen Hot Tap failed its check") && html.includes("Open for"));
  const green = buildOrbStatus({ scope: { key: "caretaker", areas: ["compliance"] }, now });
  assert.equal(renderToStaticMarkup(React.createElement(OrbStatusPanel, { status: green, quietWhenGreen: true })), "");
  assert.ok(renderToStaticMarkup(React.createElement(OrbStatusPanel, { status: green })).includes("All clear"));
});

console.log(`\n${n} passed`);
