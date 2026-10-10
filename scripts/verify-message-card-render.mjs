import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MessageCardHost from "../src/messaging/MessageCardHost.jsx";
import { stubState } from "./stubs/messageCardStubs.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const render = () => renderToStaticMarkup(React.createElement(MessageCardHost));
const note = (id, over = {}) => ({ id, kind: "team-message", createdByUid: "ben", createdByName: "Ben Jones", automated: false, read: false, message: "The vaccine fridge needs checking", createdAt: new Date(Date.now() - 5 * 60000), ...over });

t("a waiting message shows in the middle of the screen with who, what, reply, snooze and dismiss", () => {
  stubState.rows = [note("a")];
  const html = render();
  assert.match(html, /role="dialog"/);
  assert.match(html, /Message from Ben Jones/);
  assert.match(html, /The vaccine fridge needs checking/);
  for (const label of ["Done", "On it", "Will do", "Thanks", "Can&#x27;t today", "Reply", "Snooze", "Dismiss"]) assert.ok(html.includes(label), label);
  assert.match(html, /5 min ago/);
});

t("a reply shows as 'replied', and several waiting are counted", () => {
  stubState.rows = [note("a", { kind: "message-reply", createdByName: "Ben Jones" }), note("b")];
  const html = render();
  assert.match(html, /Ben Jones replied/);
  assert.match(html, /1 of 2 waiting/);
});

t("a fridge alert shows as a card with Take action, Snooze and Dismiss, and no reply buttons", () => {
  stubState.rows = [{ id: "f1", kind: "fridge-alert", automated: true, incidentId: "inc-1", title: "Vaccine fridge is out of range", message: "Readings: now 6°C, min 4°C, max 9.5°C.", read: false, createdAt: new Date(Date.now() - 60000) }];
  const html = render();
  assert.match(html, /Vaccine fridge is out of range/);
  for (const label of ["Take action", "Snooze", "Dismiss"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("Quick replies") && !html.includes(">Reply<") && !html.includes("Done"));
  assert.match(html, /Readings: now 6/);
});

t("nothing waiting shows nothing; alerts and read or snoozed messages never open the card", () => {
  stubState.rows = [];
  assert.equal(render(), "");
  stubState.rows = [note("a", { read: true }), note("b", { kind: "overdue", automated: true }), note("c", { snoozedUntil: new Date(Date.now() + 3600000) })];
  assert.equal(render(), "");
});

console.log(`\n${n} passed`);
