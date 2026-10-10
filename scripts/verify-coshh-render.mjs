import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MobileCoshh from "../src/mobile/MobileCoshh.jsx";
import CoshhRegister from "../src/components/compliance/CoshhRegister.jsx";
import { stub } from "./stubs/coshhStubs.js";
import { normaliseSubstance } from "../src/modules/coshh/coshh.js";

// the COSHH screens render for each kind of person, with the right things shown and hidden
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const make = (id, patch = {}) => normaliseSubstance(id, {
  name: "Domestos", supplier: "Bunzl", hazards: ["corrosive"], ppe: ["gloves", "eye-protection"], firstAid: ["skin", "eyes"],
  site: "Main Surgery", location: "Cleaners cupboard", reviewDate: "2099-01-01", sdsUrl: "https://firebasestorage.googleapis.com/x.pdf", sdsPath: "coshh_sds/a/x.pdf", sdsFileName: "x.pdf", ...patch,
});
const phone = (props = {}) => renderToStaticMarkup(React.createElement(MobileCoshh, { onClose: () => {}, ...props }));
const desk = () => renderToStaticMarkup(React.createElement(CoshhRegister));

t("the phone list shows what is kept, searchable, with the review flag only when it matters", () => {
  stub.capabilities = ["coshh.read"];
  stub.list = [make("a"), make("b", { name: "Zoflora", reviewDate: "2020-01-01" }), make("c", { name: "Gone", active: false })];
  const html = phone();
  assert.ok(html.includes("Domestos") && html.includes("Zoflora"));
  assert.ok(!html.includes("Gone"), "archived products are not listed");
  assert.ok(html.includes("Review due"), "an overdue review is flagged");
  assert.ok(html.includes("Corrosive") && !html.includes("Corrosive (burns"), "hazard chips are short");
  assert.ok(html.includes("Search products"));
});

t("a cupboard's code shows just what is kept there, and says so when it is empty", () => {
  stub.list = [make("a"), make("b", { name: "Descaler", location: "Store room" })];
  const here = phone({ placeKey: "Main Surgery|Cleaners cupboard" });
  assert.ok(here.includes("Cleaners cupboard") && here.includes("Domestos") && !here.includes("Descaler"));
  assert.ok(here.includes("Show every product"));
  const empty = phone({ placeKey: "Main Surgery|Boiler room" });
  assert.ok(empty.includes("Nothing is listed as kept here"));
});

t("someone without the permission is told, and the list isn't shown", () => {
  stub.capabilities = ["dashboard.read"];
  stub.list = [make("a")];
  const html = phone();
  assert.ok(html.includes("isn&#x27;t set up to look at the COSHH register") && !html.includes("Domestos"));
});

t("an empty register and a load failure each say so on the phone", () => {
  stub.capabilities = ["coshh.read"];
  stub.list = [];
  assert.ok(phone().includes("Nothing has been added to the register yet"));
  stub.list = null;
  assert.ok(phone().includes("Opening the list"));
  stub.list = []; stub.error = "Could not load the COSHH register.";
  assert.ok(phone().includes("Could not load the COSHH register."));
  stub.error = "";
});

t("desktop: the caretaker can add, edit, review and print; a partner can only look", () => {
  stub.list = [make("a"), make("b", { name: "Zoflora", reviewDate: "2020-01-01" })];
  stub.capabilities = ["coshh.read", "coshh.manage"];
  const manager = desk();
  for (const text of ["Add a substance", "Mark as reviewed", "Edit", "Archive", "Print cupboard labels", "Print register", "1 review overdue", "Safety data sheet"]) assert.ok(manager.includes(text), text);
  stub.capabilities = ["coshh.read"];
  const partner = desk();
  assert.ok(partner.includes("Domestos") && partner.includes("Print register") && partner.includes("Safety data sheet"));
  for (const text of ["Add a substance", "Mark as reviewed", "Archive", "Print cupboard labels"]) assert.ok(!partner.includes(text), `${text} is for managers`);
});

t("desktop: a product with no safety data sheet is called out, and an empty register explains what to do", () => {
  stub.capabilities = ["coshh.read", "coshh.manage"];
  stub.list = [make("a", { sdsUrl: "", sdsPath: "" })];
  assert.ok(desk().includes("No safety data sheet attached"));
  stub.list = [];
  assert.ok(desk().includes("Nothing in the register yet. Add each cleaning product"));
});

console.log(`\n${n} passed`);
