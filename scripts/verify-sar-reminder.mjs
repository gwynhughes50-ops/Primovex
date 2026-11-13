// Covers the SAR reminder bell on the app side: the wording and colours, that the bell is only drawn for a row the server listed,
// and that it is wired in everywhere it should be (SARs page, phone, menu, list pages) without the app writing anything itself.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SarBell from "@/components/governance/SarBell";
import { bellLabel, bellTone, confirmText, dueWords, lastReminderText } from "@/modules/governance/sarReminderModel";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const row = (extra = {}) => ({ id: "s1", reference: "SAR-2026-007", requestTypeLabel: "Subject access", status: "in_progress", dueDate: "2026-11-15T12:00:00.000Z", dueLabel: "15/11/2026", daysLeft: 2, assignedToUid: "craig", assignedToName: "Craig Assignee", lastReminderAt: null, lastReminderByName: "", remindedToday: false, reminderCount: 0, ...extra });

t("the due wording", () => {
  assert.equal(dueWords(-1), "overdue by 1 day");
  assert.equal(dueWords(-3), "overdue by 3 days");
  assert.equal(dueWords(0), "due today");
  assert.equal(dueWords(1), "due tomorrow");
  assert.equal(dueWords(9), "due in 9 days");
  assert.equal(dueWords(null), "no due date");
});

t("the bell is red when overdue, amber in the last week, and plain before that or with no date", () => {
  assert.equal(bellTone(-1), "late");
  assert.equal(bellTone(0), "soon");
  assert.equal(bellTone(7), "soon");
  assert.equal(bellTone(8), "plain");
  assert.equal(bellTone(null), "plain");
});

t("what the sender is told before sending, and what the bell says on hover", () => {
  assert.equal(confirmText(row()), "Craig Assignee will be told that SAR-2026-007 is due in 2 days and needs prioritising, and that the reminder is from you.");
  assert.equal(bellLabel(row({ daysLeft: -2 })), "Send Craig Assignee a reminder: SAR-2026-007 is overdue by 2 days");
  assert.equal(bellLabel(row({ remindedToday: true, lastReminderByName: "Lee Manager" })), "A reminder was already sent today by Lee Manager");
  assert.equal(lastReminderText(row()), "");
  assert.match(lastReminderText(row({ lastReminderAt: "2026-11-12T09:30:00.000Z", lastReminderByName: "Lee Manager", reminderCount: 3 })), /^Last reminder: Lee Manager, \d\d\/\d\d at \d\d:\d\d \(3 sent\)$/);
});

t("no bell is drawn unless the server listed the SAR for this person: a missing row draws nothing, a listed one draws a labelled bell", () => {
  assert.equal(renderToStaticMarkup(React.createElement(SarBell, { row: undefined })), "");
  const html = renderToStaticMarkup(React.createElement(SarBell, { row: row() }));
  assert.match(html, /<button/);
  assert.match(html, /aria-label="Send Craig Assignee a reminder: SAR-2026-007 is due in 2 days"/);
  assert.doesNotMatch(html, /role="dialog"/, "the question only opens when the bell is pressed");
  assert.match(renderToStaticMarkup(React.createElement(SarBell, { row: row({ daysLeft: -1 }) })), /rose/);
});

t("the app asks the server and writes nothing itself: no Firestore write in the bell, the hook or the client service, and the two server calls are named", () => {
  for (const file of ["src/components/governance/SarBell.jsx", "src/modules/governance/useSarsToChase.js", "src/modules/governance/services/sarReminderClient.js", "src/pages/SarsToChase.jsx", "src/mobile/MobileSarsToChase.jsx"]) {
    assert.doesNotMatch(read(file), /setDoc|addDoc|updateDoc|from "firebase\/firestore"|from 'firebase\/firestore'/, file);
  }
  const client = read("src/modules/governance/services/sarReminderClient.js");
  assert.match(client, /"listSarsToChase"/);
  assert.match(client, /"sendSarReminder"/);
  const server = read("functions/index.js");
  assert.match(server, /exports\.listSarsToChase = onCall/);
  assert.match(server, /exports\.sendSarReminder = onCall/);
  const sendCall = server.slice(server.indexOf("exports.sendSarReminder"), server.indexOf("exports.sendSarReminder") + 400);
  assert.match(sendCall, /db\.collection\("users"\)\.doc\(request\.auth\.uid\)\.get\(\)/, "the caller's profile is read from the database, not taken from the request");
});

t("the bell is on the SARs page (table and open SAR), on the phone (open SAR and its own list), and the list is in the menu only for people who have one", () => {
  const desk = read("src/pages/GovernanceSARs.jsx");
  assert.equal((desk.match(/<SarBell /g) || []).length, 2);
  // the open-SAR panel is always rendered, with nothing selected until one is opened: reading selected.id unguarded blanked the whole page
  assert.match(desk, /chase=\{selected \? chase\.byId\.get\(selected\.id\) : undefined\}/);
  assert.match(desk, /useSarsToChase\(\)/);
  assert.match(read("src/mobile/MobileGovernanceSARs.jsx"), /<SarBell row=\{chase\}/);
  assert.match(read("src/mobile/MobileSarsToChase.jsx"), /<SarBell row=\{row\}/);
  assert.match(read("src/apps/DesktopApp.jsx"), /<Route path="sars-to-chase" element=\{<SarsToChase \/>\} \/>/);
  assert.match(read("src/apps/MobileApp.jsx"), /<Route path="\/sars-to-chase" element=\{<MobileSarsToChaseRoute \/>\} \/>/);
  assert.match(read("src/config/routeManifest.js"), /path: "\/sars-to-chase".*dynamicKey: "sarsToChase"/);
  assert.match(read("src/components/navigation/DesktopSidebar.jsx"), /dynamic: sarsToChase\.canChase \? \["sarsToChase"\] : \[\]/);
  assert.match(read("src/mobile/RoleAdaptiveMobileHome.jsx"), /hasChase/);
});

console.log(`\n${n} passed`);
