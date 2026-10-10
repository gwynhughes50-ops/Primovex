import assert from "node:assert/strict";
import { buildReport, VISITS, visitById } from "../src/modules/inspection/inspectionReports.js";
import { inspectionHtml } from "../src/modules/inspection/inspectionHtml.js";
import { buildSections } from "../src/modules/inspection/inspectionSummary.js";
import { normaliseSubstance } from "../src/modules/coshh/coshh.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date(2026, 9, 10, 12, 0); // Sat 10 Oct 2026
const ago = (days) => new Date(now.getTime() - days * 86400000);
const all = { fire: true, water: true, pat: true, cleaning: true, temperature: true, stock: true, coshh: true, concerns: true, sars: true, events: true };
const base = { checks: [], fireWeekly: [], waterRounds: [], patSessions: [], patAssets: [], cleaningLogs: [], tempUnits: [], tempLogs: [], tempIncidents: [], stockAlerts: [], stockCount: 0, coshh: [], concerns: [], sars: [], events: [], available: all };
const sec = (data, id) => buildSections({ ...base, ...data, now })[id];
const check = (assetType, days, extra = {}) => ({ assetType, assetId: `${assetType}-1`, performedAt: ago(days), result: "pass", actor: { displayName: "Caretaker" }, ...extra });

t("fire: weekly tests in date are evidence; an old one, a fail or nothing at all is a gap", () => {
  const good = sec({ checks: [check("fire_point", 3), check("fire_point", 10), check("fire_point", 17), check("fire_door", 5)] }, "fire");
  assert.equal(good.status, "ok");
  assert.equal(good.rows[0][1], "3", "three different weeks had an alarm test");
  assert.match(good.rows[1][1], /Caretaker/);
  const stale = sec({ checks: [check("fire_point", 30)] }, "fire");
  assert.equal(stale.status, "attention");
  assert.match(stale.gaps[0], /30 days ago/);
  assert.equal(sec({ checks: [check("fire_point", 3), check("fire_point", 4, { result: "fail" })] }, "fire").gaps.length, 1);
  assert.equal(sec({}, "fire").status, "none");
  assert.equal(sec({ checks: [check("fire_point", 400)] }, "fire").status, "none", "older than 12 months doesn't count");
  assert.equal(sec({ fireWeekly: [{ dateKey: "2026-10-08", checkedBy: "Old system" }] }, "fire").status, "ok", "the older fire records count too");
});

t("water: monthly checks in date, out-of-range readings flagged", () => {
  const ok = sec({ checks: [check("water_hot", 5, { assetId: "a" }), check("water_cold", 6, { assetId: "b" })] }, "water");
  assert.equal(ok.status, "ok");
  assert.equal(ok.rows[0][1], "2");
  assert.equal(sec({ checks: [check("water_hot", 60)] }, "water").status, "attention");
  assert.match(sec({ checks: [check("water_hot", 2, { result: "fail" })] }, "water").gaps[0], /out of range/);
});

t("PAT, emergency equipment and cleaning each judge themselves against their usual frequency", () => {
  assert.equal(sec({ patSessions: [{ testDate: "2026-07-01" }], patAssets: [{ active: true }, { active: false }] }, "pat").status, "ok");
  assert.equal(sec({ patSessions: [{ createdAt: ago(100) }], patAssets: [{}] }, "pat").rows[0][1], "1", "retired appliances aren't counted");
  assert.equal(sec({ patSessions: [{ createdAt: ago(500) }] }, "pat").status, "attention");
  assert.equal(sec({}, "pat").status, "none");
  assert.equal(sec({ checks: [check("aed", 4), check("emergency_equipment", 20)] }, "emergency").status, "ok");
  const lateAed = sec({ checks: [check("aed", 40)] }, "emergency");
  assert.equal(lateAed.status, "attention");
  assert.match(lateAed.gaps[0], /AED was last checked 40 days ago/);
  assert.equal(sec({ cleaningLogs: [{ cleanedAt: ago(1), roomId: "r1" }, { cleanedAt: ago(2), roomId: "r2", issueReported: true }] }, "cleaning").rows[0][1], "2");
  assert.equal(sec({ cleaningLogs: [{ cleanedAt: ago(20), roomId: "r1" }] }, "cleaning").status, "attention");
});

t("cold chain: fridges set up, recent readings, open incidents", () => {
  const units = [{ active: true }, { active: true }, { active: false }];
  const logs = [{ dateKey: "2026-10-09", outOfRange: false }, { dateKey: "2026-10-09", outOfRange: true }, { dateKey: "2026-10-08" }];
  const ok = sec({ tempUnits: units, tempLogs: logs, tempIncidents: [{ status: "resolved", openedAt: ago(40) }] }, "coldchain");
  assert.equal(ok.status, "ok");
  assert.match(ok.headline, /2 fridges and freezers checked on 2 days/);
  assert.equal(ok.rows[1][1], "1");
  assert.equal(sec({ tempUnits: units, tempLogs: logs, tempIncidents: [{ status: "open" }] }, "coldchain").gaps[0], "1 fridge incident still open.");
  assert.match(sec({ tempUnits: units, tempLogs: [{ dateKey: "2026-10-01" }] }, "coldchain").gaps[0], /last 2 days/);
  assert.equal(sec({}, "coldchain").status, "none");
});

t("stock and COSHH: expired stock, overdue reviews and missing sheets are gaps", () => {
  assert.equal(sec({ stockCount: 40, stockAlerts: [{ state: "low" }] }, "stock").status, "ok");
  assert.match(sec({ stockCount: 40, stockAlerts: [{ state: "expired" }, { state: "expired" }] }, "stock").gaps[0], /2 stock items past its expiry/);
  const product = (id, patch = {}) => normaliseSubstance(id, { name: "P", supplier: "S", hazards: ["corrosive"], ppe: ["gloves"], firstAid: ["skin"], location: "Cupboard", reviewDate: "2027-06-01", sdsUrl: "u", ...patch });
  assert.equal(sec({ coshh: [product("a"), product("b")] }, "coshh").status, "ok");
  const bad = sec({ coshh: [product("a", { reviewDate: "2025-01-01" }), product("b", { sdsUrl: "" })] }, "coshh");
  assert.equal(bad.status, "attention");
  assert.deepEqual(bad.gaps, ["1 COSHH review overdue.", "1 product without a safety data sheet attached."]);
  assert.equal(sec({ coshh: [product("a", { active: false })] }, "coshh").status, "none");
});

t("governance shows counts only, whichever parts this person may read", () => {
  const concern = { status: "received", receivedAt: ago(10), title: "SECRET NAME", patientName: "PATIENT" };
  const sar = { status: "new", createdAt: ago(5), dueDate: ago(-20), requester: "SECRET" };
  const event = { status: "closed", createdAt: ago(30), title: "SECRET EVENT" };
  const g = sec({ concerns: [concern, { ...concern, status: "closed" }], sars: [sar], events: [event, { ...event, status: "reported" }] }, "governance");
  assert.equal(g.status, "ok");
  assert.deepEqual(g.rows.map((r) => r[1]), ["2", "1", "1", "1", "2", "1"]);
  assert.ok(!JSON.stringify(g).includes("SECRET") && !JSON.stringify(g).includes("PATIENT"), "no names or patient detail");
  const overdue = sec({ sars: [{ ...sar, dueDate: ago(3) }] , available: { ...all, concerns: false, events: false } }, "governance");
  assert.equal(overdue.status, "attention");
  assert.equal(overdue.rows.length, 2, "only the SAR rows when that's all this person can read");
  assert.equal(sec({ available: { ...all, concerns: false, sars: false, events: false } }, "governance").status, "unavailable");
});

t("an area this person can't read is marked as not shown, not as empty", () => {
  const s = buildSections({ ...base, now, available: { ...all, fire: false, stock: false, coshh: false } });
  assert.equal(s.fire.status, "unavailable");
  assert.equal(s.emergency.status, "unavailable");
  assert.equal(s.stock.status, "unavailable");
  assert.equal(s.coshh.status, "unavailable");
  assert.equal(s.cleaning.status, "none");
});

t("each visit sheet lists its own areas, and the gaps are gathered at the top", () => {
  assert.deepEqual(VISITS.map((v) => v.id), ["heiw", "hs"]);
  assert.equal(visitById("nope").id, "heiw");
  assert.equal(visitById("hiw").id, "heiw", "an old link still opens the sheet");
  const data = { checks: [check("fire_point", 40)], coshh: [] };
  const hs = buildReport({ visitId: "hs", data: { ...base, ...data }, now });
  const heiw = buildReport({ visitId: "heiw", data: { ...base, ...data }, now });
  assert.deepEqual(hs.sections.map((s) => s.id), ["fire", "water", "pat", "emergency", "cleaning", "coshh"]);
  assert.equal(heiw.sections.length, 9);
  assert.ok(heiw.sections.some((s) => s.id === "governance") && !hs.sections.some((s) => s.id === "governance"), "governance is for the HEIW sheet only");
  assert.match(hs.gaps[0].text, /fire check was 40 days ago/);
});

t("the printed sheet carries the sections, the gaps and what is held elsewhere, and escapes what it is given", () => {
  const report = buildReport({ visitId: "heiw", data: { ...base, checks: [check("fire_point", 3, { actor: { displayName: "<b>Bob</b>" } })] }, preparedBy: "Gwyn <Hughes>", now });
  const html = inspectionHtml(report, { practiceName: "Test & Co" });
  assert.ok(html.includes("HEIW visit: evidence summary") && html.includes("At a glance") && html.includes("To put right before the visit"));
  assert.ok(html.includes("Fire safety") && html.includes("Held outside Primovex") && html.includes("Croner"));
  assert.ok(html.includes("Gwyn &lt;Hughes&gt;") && html.includes("Test &amp; Co") && html.includes("&lt;b&gt;Bob&lt;/b&gt;"));
  assert.ok(!html.includes("<b>Bob") && !html.includes("<Hughes>"));
  assert.ok(html.includes("Save as PDF"));
  assert.ok(html.includes("Not shown") === false);
});

console.log(`\n${n} passed`);
