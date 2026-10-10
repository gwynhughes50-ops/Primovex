import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RoleAdaptiveMobileHome from "../src/mobile/RoleAdaptiveMobileHome.jsx";
import { stub } from "./stubs/mobileHomeStubs.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const home = (role, capabilities = ["*"]) => { stub.role = role; stub.capabilities = capabilities; return renderToStaticMarkup(React.createElement(RoleAdaptiveMobileHome, { onAction: () => {} })); };

t("the manager's home: slim Ask Orb, SARs and the other tiles, the attention strip, and no 'future command layer' line", () => {
  const html = home("Practice Manager");
  assert.ok(html.includes("Ask Orb"));
  assert.ok(html.includes("is-compact"));
  for (const label of ["Inventory", "Spaces", "Compliance", "Temperature", "Concerns", "SARs", "Significant events", "What needs attention?"]) assert.ok(html.includes(label), label);
  assert.ok(html.includes("Nothing urgent right now"), "the attention strip");
  assert.ok(!html.includes("Future command layer"));
  assert.ok(!html.includes("pvx-orb-hint"));
});

t("a nurse sees the clinic tiles and no attention strip or management tiles", () => {
  const html = home("Nurse", ["inventory.write"]);
  for (const label of ["Scan stock", "Take items by voice", "Kits and boxes", "Temperature", "Report an issue", "Quick note", "Messages"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("SARs") && !html.includes("Concerns") && !html.includes("Nothing urgent"));
});

t("reception and the caretaker each get their own", () => {
  const reception = home("Reception", ["dashboard.read"]);
  assert.ok(reception.includes("Report an issue") && reception.includes("Room status") && !reception.includes("Scan stock"));
  const caretaker = home("Caretaker", ["compliance.recordChecks"]);
  assert.ok(caretaker.includes("Scan space or asset") && caretaker.includes("Fire and water checks") && !caretaker.includes("Inventory"));
});

t("a partner sees SARs and Concerns up front with the attention strip", () => {
  const html = home("Partner", ["governance.read", "governance.partnerAccess"]);
  assert.ok(html.indexOf("SARs") > -1 && html.indexOf("Concerns") > -1 && html.includes("Nothing urgent right now"));
  assert.ok(!html.includes("Scan stock"));
});

t("the greeting uses the first name", () => {
  assert.match(home("Practice Manager"), /Good (morning|afternoon|evening), Gwyn/);
});

console.log(`\n${n} passed`);
