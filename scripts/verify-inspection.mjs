import assert from "node:assert/strict";
import { buildReport, VISITS, visitById } from "../src/modules/inspection/inspectionReports.js";
import { inspectionHtml } from "../src/modules/inspection/inspectionHtml.js";
import { buildSections } from "../src/modules/inspection/inspectionSummary.js";
import { normaliseSubstance } from "../src/modules/coshh/coshh.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date(2026, 9, 10, 12, 0); // Sat 10 Oct 2026
const ago = (days) => new Date(now.getTime() - days * 86400000);
const all = { fire: true, water: true, pat: true, cleaning: true, temperature: true, stock: true, coshh: true, certs: true, concerns: true, sars: true, events: true, training: true, waste: true };
const base = { checks: [], fireWeekly: [], waterRounds: [], patSessions: [], patAssets: [], cleaningLogs: [], tempUnits: [], tempLogs: [], tempIncidents: [], stockAlerts: [], stockCount: 0, coshh: [], certificates: [], concerns: [], sars: [], events: [], waste: [], training: { people: [], courses: [], records: [] }, available: all };
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
  assert.deepEqual(hs.sections.map((s) => s.id), ["fire", "water", "pat", "emergency", "cleaning", "coshh", "waste", "certificates", "training"]);
  assert.equal(heiw.sections.length, 12);
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

t("training: counts only, with the worst courses named and nobody else", () => {
  const training = {
    people: [{ id: "p1", name: "Ann Secret", group: "clinical" }, { id: "p2", name: "Bob Secret", group: "admin" }, { id: "p3", name: "Gone", group: "admin", active: false }],
    courses: [{ id: "ig", name: "Information governance", intervalMonths: 24 }, { id: "bls", name: "Basic life support", intervalMonths: 12 }],
    records: [
      { personId: "p1", courseId: "ig", completedOn: "2024-01-01" },
      { personId: "p2", courseId: "ig", completedOn: "2026-06-01" },
      { personId: "p1", courseId: "bls", completedOn: "2025-12-01" },
      { personId: "p2", courseId: "bls", completedOn: "2026-09-01" },
      { personId: "p3", courseId: "ig", completedOn: "2000-01-01" },
    ],
  };
  const s1 = sec({ training }, "training");
  assert.equal(s1.status, "attention");
  assert.match(s1.headline, /2 staff on the training matrix; 75% of dated training is in date/);
  assert.equal(s1.rows.find((r) => r[0] === "Overdue")[1], "1");
  assert.equal(s1.rows.find((r) => r[0] === "Running out in the next 60 days")[1], "1");
  assert.match(s1.gaps[0], /1 training entry overdue, mostly Information governance \(1\)/);
  assert.ok(!JSON.stringify(s1).includes("Secret"), "no names");
  assert.equal(sec({}, "training").status, "none", "nothing recorded");
  assert.equal(sec({ training, available: { ...all, training: false } }, "training").status, "unavailable");
  const clean = sec({ training: { ...training, records: training.records.filter((r) => r.personId === "p2") } }, "training");
  assert.equal(clean.status, "ok");
});

t("clinical waste: last collection, last year's totals and a long gap; counts only", () => {
  const note = (id, date, kg) => ({ id, consignmentCode: id, collectionDate: date, totalKg: kg, lines: [{ description: "SHARPS", kg }] });
  const good = sec({ waste: [note("A1", "2026-10-01", 40), note("A2", "2026-09-05", 30), note("A3", "2026-08-01", 20)] }, "waste");
  assert.equal(good.status, "ok");
  assert.match(good.headline, /Last collection 01\/10\/2026; 3 collections and 90 kg in the last 12 months/);
  assert.equal(good.rows.find((r) => r[0] === "Longest gap in the last 12 months")[1], "35 days");
  const stale = sec({ waste: [note("B1", "2026-06-01", 40)] }, "waste");
  assert.equal(stale.status, "attention");
  assert.match(stale.gaps[0], /ago/);
  assert.equal(sec({}, "waste").status, "none");
  assert.equal(sec({ available: { ...all, waste: false } }, "waste").status, "unavailable");
  assert.equal(sec({ waste: [{ ...note("V1", "2026-10-05", 99), voided: true }] }, "waste").status, "none", "a note marked as an error does not count");
});

t("clinical waste by site: each site is judged on its own, and a site that has gone quiet is a gap even if the other is fresh", () => {
  const note = (id, date, siteId, siteName) => ({ id, consignmentCode: id, collectionDate: date, totalKg: 10, siteId, siteName, lines: [{ kg: 10 }] });
  const both = sec({ waste: [note("m1", "2026-10-01", "main", "Main Surgery"), note("b1", "2026-09-20", "branch", "Branch Surgery")] }, "waste");
  assert.equal(both.status, "ok");
  assert.equal(both.rows.find((r) => r[0] === "Last collection, Main Surgery")[1].startsWith("01/10/2026"), true);
  assert.equal(both.rows.find((r) => r[0] === "Last collection, Branch Surgery")[1].startsWith("20/09/2026"), true);
  const quiet = sec({ waste: [note("m1", "2026-10-01", "main", "Main Surgery"), note("b1", "2026-06-01", "branch", "Branch Surgery")] }, "waste");
  assert.equal(quiet.status, "attention");
  assert.ok(quiet.gaps.some((g) => /^Branch Surgery: the last clinical waste collection on record was \d+ days ago/.test(g)));
  assert.ok(!quiet.gaps.some((g) => /^Main Surgery/.test(g)));
  const mixed = sec({ waste: [note("m1", "2026-10-01", "main", "Main Surgery"), note("x1", "2026-10-02", "", "")] }, "waste");
  assert.ok(mixed.gaps.some((g) => /1 collection has no site recorded/.test(g)));
});

t("PAT: tests done on the phone count, and appliances that are overdue, untested or out of use are named as gaps", () => {
  const tests = [{ testedOn: "2026-09-15" }, { testedOn: "2026-09-15" }, { testedOn: "2026-06-01" }];
  const healthy = sec({ patTests: tests, patAssets: [{ active: true, nextDueOn: "2027-06-01", lastTestedOn: "2026-09-15" }] }, "pat");
  assert.equal(healthy.status, "ok");
  assert.ok(healthy.rows.some(([label, value]) => label === "Tests in the last 12 months" && value === "3"));
  const messy = sec({
    patTests: tests,
    patAssets: [
      { active: true, nextDueOn: "2026-08-01" },
      { active: true, nextDueOn: "2027-06-01" },
      { active: true },
      { active: true, outOfUse: true, nextDueOn: "2026-01-01" },
      { active: false, nextDueOn: "2020-01-01" },
    ],
  }, "pat");
  assert.equal(messy.status, "attention");
  assert.ok(messy.gaps.some((g) => /1 appliance overdue for PAT testing/.test(g)));
  assert.ok(messy.gaps.some((g) => /1 appliance not PAT tested yet/.test(g)));
  assert.ok(messy.gaps.some((g) => /1 appliance out of use after a failed test/.test(g)));
  // a plain test date is that day, not the day before
  assert.equal(sec({ patTests: [{ testedOn: "2026-10-10" }], patAssets: [] }, "pat").status, "ok");
  // with only older paper sessions the section reads as it always did
  assert.equal(sec({ patSessions: [{ testDate: "2026-07-01" }], patAssets: [{ active: true }] }, "pat").status, "ok");
});

// ---- compliance, PAT and concern evidence added with the caretaker and concern wizards ----

const full = { ...all, assets: true, incidents: true, concernSteps: true };
const secF = (data, id) => buildSections({ ...base, available: full, ...data, now })[id];
const ROW = (section, label) => section.rows.find(([l]) => l === label)?.[1];
const firePoint = (id, days) => ({ id, assetType: "fire_point", active: true, lastCheckAt: days === null ? null : ago(days) });

t("fire: the alarm checklist, panel faults and call points not yet tested are all shown", () => {
  const steps = (...done) => done.map((d, i) => ({ key: `s${i}`, ok: d, required: true }));
  const good = secF({
    checks: [check("fire_point", 3, { checklist: steps(true, true) }), check("fire_point", 10, { checklist: steps(true, false) }), check("fire_point", 17)],
    assets: [firePoint("a", 3), firePoint("b", 40)],
    incidents: [],
  }, "fire");
  assert.equal(good.status, "ok");
  assert.equal(ROW(good, "Alarm tests with every step of the checklist done"), "1 of 2");
  assert.equal(ROW(good, "Alarm panel faults reported by a test"), "0");
  assert.equal(ROW(good, "Call points on the register / not tested in 12 months"), "2 / 0");
  const bad = secF({
    checks: [check("fire_point", 3)],
    assets: [firePoint("a", 3), firePoint("b", 400), firePoint("c", null), { ...firePoint("d", null), active: false }],
    incidents: [{ kind: "panel_fault", assetType: "fire_alarm_panel", status: "open", openedAtMs: ago(2).getTime() }, { kind: "panel_fault", assetType: "fire_alarm_panel", status: "resolved", openedAtMs: ago(90).getTime() }],
  }, "fire");
  assert.equal(bad.status, "attention");
  assert.equal(ROW(bad, "Alarm panel faults reported by a test"), "2");
  assert.ok(bad.gaps.some((g) => /1 alarm panel fault still open/.test(g)));
  assert.ok(bad.gaps.some((g) => /2 call points not tested in the last 12 months/.test(g)), "a retired call point is not counted");
  // a person who cannot read the register or incidents is not told about them, and nothing breaks
  const quiet = sec({ checks: [check("fire_point", 3)] }, "fire");
  assert.equal(quiet.status, "ok");
  assert.ok(!quiet.rows.some(([l]) => /panel faults|Call points/.test(l)));
});

t("fire and water say when a record was filed afterwards or typed in by hand", () => {
  const f = secF({ checks: [check("fire_point", 3, { savedOffline: true }), check("fire_point", 10), check("fire_point", 17, { manualEntry: true })] }, "fire");
  assert.equal(ROW(f, "Done without a signal and filed afterwards"), "1");
  assert.equal(ROW(f, "Entered by hand afterwards"), "1");
  const w = secF({ checks: [check("water_hot", 3, { savedOffline: true, assetId: "a" })] }, "water");
  assert.equal(ROW(w, "Done without a signal and filed afterwards"), "1");
  assert.equal(ROW(secF({ checks: [check("water_hot", 3, { assetId: "a" })] }, "water"), "Done without a signal and filed afterwards"), undefined, "nothing to say when every record was live");
});

t("fire and emergency equipment incidents that are still open are gaps", () => {
  const open = { assetType: "fire_door", status: "open", openedAtMs: ago(3).getTime() };
  const fire = secF({ checks: [check("fire_point", 3)], incidents: [open] }, "fire");
  assert.ok(fire.gaps.some((g) => /1 fire equipment incident still open/.test(g)));
  const aed = secF({ checks: [check("aed", 4)], incidents: [{ assetType: "aed", status: "open" }, { assetType: "aed", status: "resolved" }] }, "emergency");
  assert.ok(aed.gaps.some((g) => /1 emergency equipment incident still open/.test(g)));
  const fireWithAed = secF({ checks: [check("fire_point", 3)], incidents: [{ assetType: "aed", status: "open" }] }, "fire");
  assert.ok(!fireWithAed.gaps.some((g) => /equipment incident/.test(g)), "an AED incident is the emergency section's");
});

t("water: outlets on the register that missed the month, and open water incidents", () => {
  const outlet = (id, days) => ({ id, assetType: "water_hot", active: true, lastCheckAt: days === null ? null : ago(days) });
  const w = secF({
    checks: [check("water_hot", 5, { assetId: "a" })],
    assets: [outlet("a", 5), outlet("b", 50), outlet("c", null)],
    incidents: [{ assetType: "water_hot", status: "open", openedAtMs: ago(4).getTime() }, { assetType: "water_cold", status: "resolved", openedAtMs: ago(100).getTime() }],
  }, "water");
  assert.equal(ROW(w, "Outlets on the register / not checked in 31 days"), "3 / 2");
  assert.equal(ROW(w, "Water incidents in the last 12 months / still open"), "2 / 1");
  assert.ok(w.gaps.some((g) => /2 water outlets not checked in the last 31 days/.test(g)));
  assert.ok(w.gaps.some((g) => /1 water incident still open/.test(g)));
});

t("PAT: failed tests and failed-appliance incidents are counted and the open ones flagged", () => {
  const live = [{ active: true, nextDueOn: "2027-06-01", lastTestedOn: "2026-09-15" }];
  const p = secF({
    patTests: [{ testedOn: "2026-09-15", result: "pass" }, { testedOn: "2026-09-16", result: "fail" }],
    patAssets: live,
    incidents: [{ kind: "pat_fail", status: "open", openedAtMs: ago(3).getTime() }, { kind: "pat_fail", status: "resolved", openedAtMs: ago(20).getTime() }, { assetType: "water_hot", status: "open" }],
  }, "pat");
  assert.equal(ROW(p, "Failed tests in the last 12 months"), "1");
  assert.equal(ROW(p, "Failed-appliance incidents closed / still open"), "1 / 1");
  assert.ok(p.gaps.some((g) => /1 failed-appliance incident still open/.test(g)));
});

t("cold chain: readings entered by hand at the fridge are counted", () => {
  const c = secF({ tempUnits: [{ active: true }], tempLogs: [{ dateKey: "2026-10-09", source: "manual-mobile" }, { dateKey: "2026-10-09", source: "sensor" }, { dateKey: "2026-10-08", source: "manual-mobile" }] }, "coldchain");
  assert.equal(ROW(c, "...of which read from the thermometer and entered at the fridge"), "2");
});

t("governance: how cases were closed, and which are waiting on an outside party (counts only)", () => {
  let k = 0;
  const closed = (extra) => ({ id: `closed${k += 1}`, status: "closed", closedAt: ago(20), receivedAt: ago(80), dutyOfCandourConsidered: true, ...extra });
  const open = { id: "open1", status: "in_progress", receivedAt: ago(40), mddusRequired: true, gmpiReference: "G-1" };
  const steps = [
    { concernId: "open1", party: "indemnity", action: "sent", occurredOn: "2026-09-26", createdAtMs: 1 },
    { concernId: "open1", party: "indemnity", action: "changes", occurredOn: "2026-09-30", createdAtMs: 2 },
    { concernId: "open1", party: "indemnity", action: "sent", occurredOn: "2026-10-02", createdAtMs: 3 },
    { concernId: "open1", party: "gmpi", action: "sent", occurredOn: "2026-10-07", createdAtMs: 4 },
  ];
  const g = secF({
    concerns: [open, closed({ dutyOfCandourTriggered: true }), closed({ sentBeforeAccepted: true, lfeReportStatus: "in_progress" }), closed({ dutyOfCandourConsidered: undefined })],
    concernSteps: steps,
  }, "governance");
  assert.equal(ROW(g, "Cases closed (12 months) with every closing check recorded"), "2 of 3");
  assert.equal(ROW(g, "...Duty of Candour triggered"), "1");
  assert.equal(ROW(g, "...final response sent before everyone involved had accepted it"), "1");
  assert.equal(ROW(g, "Welsh Risk Pool reports still being prepared"), "1");
  assert.equal(ROW(g, "Open cases waiting on a reply from an outside party"), "2", "the insurer (sent again) and GMPI are both with them");
  assert.equal(ROW(g, "...longest wait so far (days)"), "8");
  // names and free text never get in
  const leaky = secF({ concerns: [{ ...open, patientName: "Someone", description: "ZZ story" }], concernSteps: [{ concernId: "open1", party: "gmpi", action: "sent", occurredOn: "2026-10-07", note: "ZZ private" }] }, "governance");
  assert.ok(!/Someone|ZZ/.test(JSON.stringify(leaky)));
  // a role that cannot read the steps is not shown that line
  assert.ok(!sec({ concerns: [open] }, "governance").rows.some(([l]) => /outside party/.test(l)));
});

console.log(`\n${n} passed`);
