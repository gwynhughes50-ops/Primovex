import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { historyRows, keyDates, ukDate, ukDateTime } from "../src/modules/governance/concernHistory.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const at = (y, m, d, h = 9, min = 30) => new Date(y, m - 1, d, h, min);
const ev = (id, date, type, title, message = "", actorName = "Pat Example") => ({ id, createdAt: date, type, title, message, actorName });
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const find = (rows, label) => rows.find((r) => r.label === label)?.text;

t("dates and times are written the UK way", () => {
  assert.equal(ukDate(at(2026, 10, 5)), "05/10/2026");
  assert.equal(ukDateTime(at(2026, 10, 5, 14, 7)), "05/10/2026 14:07");
  assert.equal(ukDate(null), "");
});

t("the key dates come from the case when it has them", () => {
  const rows = keyDates({ receivedAt: at(2026, 10, 1), acknowledgedAt: at(2026, 10, 2), listeningDiscussionOfferedAt: at(2026, 10, 3), listeningDiscussionCompletedAt: at(2026, 10, 6), status: "listening", acknowledgementDueAt: at(2026, 10, 6) }, []);
  assert.equal(find(rows, "Received"), "01/10/2026");
  assert.equal(find(rows, "Acknowledged"), "02/10/2026");
  assert.equal(find(rows, "Listening discussion offered"), "03/10/2026");
  assert.equal(find(rows, "Listening discussion completed"), "06/10/2026");
  assert.equal(find(rows, "Acknowledgement due"), "06/10/2026");
});

t("a date missing from the case is taken from the history, and says so; one that is nowhere says it was not recorded", () => {
  const timeline = [
    ev("1", at(2026, 10, 2), "acknowledged", "Acknowledgement recorded"),
    ev("2", at(2026, 10, 3), "listening", "Listening discussion offered"),
    ev("3", at(2026, 10, 7), "listening", "Listening discussion completed"),
    ev("4", at(2026, 10, 9), "status", "Moved to Investigation"),
  ];
  const rows = keyDates({ receivedAt: at(2026, 10, 1), status: "investigation" }, timeline);
  assert.equal(find(rows, "Acknowledged"), "02/10/2026 (from the case history)");
  assert.equal(find(rows, "Listening discussion offered"), "03/10/2026 (from the case history)");
  assert.equal(find(rows, "Listening discussion completed"), "07/10/2026 (from the case history)");
  const none = keyDates({ receivedAt: at(2026, 10, 1), status: "investigation" }, []);
  assert.equal(find(none, "Listening discussion offered"), "Not recorded");
  assert.equal(find(none, "Acknowledged"), "Not recorded");
  assert.equal(find(keyDates({ receivedAt: at(2026, 10, 1) }, null), "Acknowledged"), "Not recorded", "history could not be loaded: still prints");
  assert.ok(!keyDates({ receivedAt: at(2026, 10, 1) }, []).some((r) => r.label === "Closed"), "an open case has no closed date");
});

t("the closed date is shown for a closed case, from the case or from the history, with the final response dates", () => {
  const closedAt = at(2026, 10, 20);
  const rows = keyDates({ status: "closed", closedAt, finalResponseSentAt: at(2026, 10, 19), finalResponseReadyAt: at(2026, 10, 18), receivedAt: at(2026, 10, 1) }, []);
  assert.equal(find(rows, "Closed"), "20/10/2026");
  assert.equal(find(rows, "Final response sent"), "19/10/2026");
  assert.equal(find(rows, "Final response letter ready"), "18/10/2026");
  const fromHistory = keyDates({ status: "closed", receivedAt: at(2026, 10, 1) }, [ev("1", at(2026, 10, 21), "closed", "Case closed")]);
  assert.equal(find(fromHistory, "Closed"), "21/10/2026 (from the case history)");
  assert.equal(find(keyDates({ status: "closed", receivedAt: at(2026, 10, 1) }, []), "Closed"), "Not recorded");
});

t("the history lists everything, oldest first, with who did it and the time", () => {
  const rows = historyRows([
    ev("c", at(2026, 10, 9, 16, 5), "closed", "Case closed", "Outcome: upheld.", "Sam Manager"),
    ev("a", at(2026, 10, 1, 9, 0), "note", "Case created", "", "Pat Example"),
    ev("b", { seconds: at(2026, 10, 5, 11, 20).getTime() / 1000 }, "note", "Note added", "Rang the patient.", ""),
  ]);
  assert.deepEqual(rows.map((r) => r.title), ["Case created", "Note added", "Case closed"]);
  assert.deepEqual(rows.map((r) => r.who), ["Pat Example", "Not recorded", "Sam Manager"]);
  assert.equal(rows[0].when, "01/10/2026 09:00");
  assert.equal(rows[2].when, "09/10/2026 16:05");
  assert.equal(rows[1].message, "Rang the patient.");
  assert.deepEqual(historyRows([]), []);
  assert.deepEqual(historyRows(undefined), []);
});

t("the printed summary uses them: every date, and the whole history with who and when, not the last six", () => {
  const print = read("src/modules/governance/services/concernPrint.js");
  assert.match(print, /keyDates\(concern, timeline\)/);
  assert.match(print, /historyRows\(timeline\)/);
  assert.match(print, /<th>When<\/th><th>Who<\/th><th>What happened<\/th>/);
  assert.match(print, /History of the case: who did what, and when/);
  assert.match(print, /limit\(1000\)/); // room for the detailed audit lines as well as the history
  assert.ok(!/limit\(6\)/.test(print));
  assert.ok(!/Recent activity/.test(print));
});

t("a step that has already happened is recorded for its day and never moves the case back", () => {
  const service = read("src/modules/governance/services/concernService.js");
  assert.match(service, /export async function recordListeningDiscussion\(concern, actor = \{\}, completed = true, day = ""\)/);
  assert.match(service, /export async function acknowledgeConcern\(concern, actor = \{\}, day = ""\)/);
  assert.match(service, /at >= order\.indexOf\(target\) \? null : target/);
  const wizard = read("src/modules/governance/components/ConcernWizards.jsx");
  assert.match(wizard, /recordListeningDiscussion\(concern, actor, true, form\.date\)/);
  assert.match(wizard, /What day was it\?/);
});

console.log(`\n${n} passed`);
