// Covers the sign-in and activity report maths (src/lib/usageReport.js).
import assert from "node:assert/strict";
import { areaLabel, describeSession, formatDuration, outOfHours, overview, sessionsToCsv, summariseUsers } from "../src/lib/usageReport.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const NOW = new Date(2026, 9, 5, 12, 0, 0);
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m, 0);
const session = (over) => ({ id: "s", uid: "hca", displayName: "Hayley", role: "HCA", startedAt: at(5, 9), lastSeenAt: at(5, 10), activeSeconds: 2400, deviceId: "pvx-1", client: "tauri", platform: "windows", pages: [], ...over });

t("durations read naturally", () => {
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(45), "45s");
  assert.equal(formatDuration(600), "10 min");
  assert.equal(formatDuration(3600), "1 h");
  assert.equal(formatDuration(5400), "1 h 30 min");
  assert.equal(formatDuration(-5), "0s");
  assert.equal(formatDuration("x"), "0s");
});

t("areas get friendly names, with a fallback", () => {
  assert.equal(areaLabel("/governance/sars"), "Subject access requests");
  assert.equal(areaLabel("/inventory"), "Inventory");
  assert.equal(areaLabel("/inventory/kits"), "Inventory / kits");
  assert.equal(areaLabel("/some-new-page"), "Some new page");
  assert.equal(areaLabel("/"), "Home");
});

t("a session is active, ended or left without signing out", () => {
  assert.equal(describeSession(session({ lastSeenAt: at(5, 11, 55) }), NOW).status, "active");
  assert.equal(describeSession(session({ lastSeenAt: at(5, 10) }), NOW).status, "lapsed");
  const ended = describeSession(session({ endedAt: at(5, 10, 30), endReason: "signed_out" }), NOW);
  assert.equal(ended.status, "ended");
  assert.equal(ended.spanSeconds, 90 * 60); // to when they signed out, not to the last heartbeat
});

t("out-of-hours sign-ins and very long sessions are flagged", () => {
  assert.equal(outOfHours(at(5, 3)), true);
  assert.equal(outOfHours(at(5, 23)), true);
  assert.equal(outOfHours(at(5, 6)), false);
  assert.equal(outOfHours(at(5, 21, 59)), false);
  assert.deepEqual(describeSession(session({ startedAt: at(5, 2), lastSeenAt: at(5, 3) }), NOW).flags, ["Signed in outside normal hours"]);
  assert.match(describeSession(session({ startedAt: at(4, 8), lastSeenAt: at(5, 9) }), NOW).flags.join(), /over 12 hours/);
  assert.deepEqual(describeSession(session(), NOW).flags, []);
});

t("people are summarised: sessions, days, time, where it went, most recent first", () => {
  const users = summariseUsers([
    session({ id: "1", startedAt: at(5, 9), lastSeenAt: at(5, 10), activeSeconds: 1000, pages: [{ path: "/inventory", seconds: 800, visits: 3 }, { path: "/alerts", seconds: 200, visits: 1 }] }),
    session({ id: "2", startedAt: at(4, 9), lastSeenAt: at(4, 9, 30), activeSeconds: 500, pages: [{ path: "/inventory", seconds: 500, visits: 1 }] }),
    session({ id: "3", uid: "liz", displayName: "Liz", role: "Practice Manager", startedAt: at(5, 8), lastSeenAt: at(5, 8, 20), activeSeconds: 100 }),
  ], NOW);
  assert.deepEqual(users.map((u) => u.name), ["Hayley", "Liz"]);
  const hayley = users[0];
  assert.equal(hayley.sessionCount, 2);
  assert.equal(hayley.daysActive, 2);
  assert.equal(hayley.activeSeconds, 1500);
  assert.deepEqual(hayley.topAreas.map((a) => [a.label, a.seconds]), [["Inventory", 1300], ["Alerts", 200]]);
  assert.equal(hayley.sessions[0].id, "1");
  assert.deepEqual(overview(users), { people: 2, sessions: 3, activeSeconds: 1600, flagged: 0 });
});

t("signing in at night flags the person", () => {
  const [u] = summariseUsers([
    session({ id: "1", startedAt: at(5, 9), lastSeenAt: at(5, 10) }),
    session({ id: "3", startedAt: at(3, 2), lastSeenAt: at(3, 3) }),
  ], NOW);
  assert.deepEqual(u.flags, ["1 sign-in outside normal hours"]);
  assert.equal(overview([u]).flagged, 1);
});

t("a laptop then a phone, one after the other, is normal and isn't flagged", () => {
  const [u] = summariseUsers([
    session({ id: "1", deviceId: "pvx-1", startedAt: at(5, 9), lastSeenAt: at(5, 10), endedAt: at(5, 10) }),
    session({ id: "2", deviceId: "pvx-2", startedAt: at(5, 11), lastSeenAt: at(5, 11, 30) }),
  ], NOW);
  assert.deepEqual(u.flags, []);
  assert.equal(u.deviceCount, 2);
});

t("two devices in at the same time is flagged, with the count", () => {
  const [u] = summariseUsers([
    session({ id: "1", deviceId: "pvx-1", startedAt: at(5, 9), lastSeenAt: at(5, 10, 30) }),
    session({ id: "2", deviceId: "pvx-2", startedAt: at(5, 10), lastSeenAt: at(5, 11) }),
    session({ id: "3", deviceId: "pvx-2", startedAt: at(4, 9), lastSeenAt: at(4, 9, 40) }),
    session({ id: "4", deviceId: "pvx-1", startedAt: at(4, 9, 10), lastSeenAt: at(4, 9, 30) }),
  ], NOW);
  assert.deepEqual(u.flags, ["In on two devices at the same time on 2 occasions"]);
});

t("a brief overlap, the same device twice, or no recorded device isn't flagged", () => {
  const brief = summariseUsers([
    session({ id: "1", deviceId: "pvx-1", startedAt: at(5, 9), lastSeenAt: at(5, 10) }),
    session({ id: "2", deviceId: "pvx-2", startedAt: at(5, 9, 58), lastSeenAt: at(5, 10, 30) }),
  ], NOW)[0];
  assert.deepEqual(brief.flags, []);
  const same = summariseUsers([
    session({ id: "1", deviceId: "pvx-1", startedAt: at(5, 9), lastSeenAt: at(5, 10) }),
    session({ id: "2", deviceId: "pvx-1", startedAt: at(5, 9, 10), lastSeenAt: at(5, 10) }),
  ], NOW)[0];
  assert.deepEqual(same.flags, []);
  const unknown = summariseUsers([
    session({ id: "1", deviceId: "", startedAt: at(5, 9), lastSeenAt: at(5, 10) }),
    session({ id: "2", deviceId: "pvx-2", startedAt: at(5, 9, 10), lastSeenAt: at(5, 10) }),
  ], NOW)[0];
  assert.deepEqual(unknown.flags, []);
});

t("the CSV has one row per session with the areas and times, and can't run as a formula", () => {
  const users = summariseUsers([
    session({ displayName: "=HYPERLINK(\"x\")", pages: [{ path: "/inventory", seconds: 600, visits: 1 }], endedAt: at(5, 10), endReason: "signed_out" }),
  ], NOW);
  const lines = sessionsToCsv(users).split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^"Name","Role","Signed in"/);
  assert.match(lines[1], /^"'=HYPERLINK\(""x""\)"/);
  assert.match(lines[1], /Inventory \(10 min\)/);
  assert.match(lines[1], /Signed out/);
});

t("a session with no start time is ignored rather than breaking the report", () => {
  assert.deepEqual(summariseUsers([{ id: "x", uid: "u" }], NOW), []);
});

console.log(`\n${n} passed`);
