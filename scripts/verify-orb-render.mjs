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
  assert.match(css, /prefers-reduced-motion[\s\S]*pvx-orb--red \.pvx-orb-ring \{ border: 3px/, "someone who wants no movement still sees a firmer ring for red");
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
