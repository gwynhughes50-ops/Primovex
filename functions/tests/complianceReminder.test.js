const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const svc = require("../services/complianceReminderService");

const DAY = 86400000;
const WED = new Date(2026, 9, 14, 8, 0); // Wednesday 14 October 2026, 08:00
const MON = new Date(2026, 9, 12, 8, 0);
const SAT = new Date(2026, 9, 17, 8, 0);
const ago = (days) => new Date(WED.getTime() - days * DAY);

const assets = [
  { id: "fp1", assetCode: "FP-001", assetType: "fire_point", frequency: "weekly", lastCheckAt: ago(10), lastCheckResult: "pass" },
  { id: "fp2", assetCode: "FP-002", assetType: "fire_point", frequency: "weekly", lastCheckAt: ago(20), lastCheckResult: "pass" },
  { id: "wh1", assetCode: "WH-001", assetType: "water_hot", frequency: "monthly", lastCheckAt: ago(35), lastCheckResult: "pass" }, // 5 days late
  { id: "wh2", assetCode: "WH-002", assetType: "water_hot", frequency: "monthly", lastCheckAt: ago(45), lastCheckResult: "pass" }, // 15 days late: red
  { id: "wc1", assetCode: "WC-001", assetType: "water_cold", frequency: "monthly", lastCheckAt: ago(5), lastCheckResult: "pass" }, // fine
  { id: "fd1", assetCode: "FD-001", assetType: "fire_door", frequency: "weekly", lastCheckAt: ago(2), lastCheckResult: "fail" }, // failing
  { id: "ex1", assetCode: "FX-001", assetType: "fire_extinguisher", frequency: "monthly", lastCheckAt: null }, // never checked
  { id: "old", assetCode: "WH-009", assetType: "water_hot", frequency: "monthly", lastCheckAt: ago(200), active: false }, // retired
];

test("the server's rules agree with the app's on every asset", async () => {
  const rules = await import(pathToFileURL(path.resolve(__dirname, "../../src/services/compliance/complianceRules.js")).href);
  const due = await import(pathToFileURL(path.resolve(__dirname, "../../src/modules/compliance/complianceDue.js")).href);
  for (const asset of assets) {
    assert.equal(svc.isCheckDue(asset, WED), rules.isComplianceCheckDue(asset, WED), asset.assetCode);
    assert.equal(svc.overdueDays(asset, WED), due.overdueDays(asset, WED), asset.assetCode);
  }
  const live = assets.filter((a) => a.active !== false);
  assert.equal(svc.fireTestDue(live, WED), rules.isFireAlarmTestDueThisWeek(live, WED));
  assert.equal(svc.daysSinceFireTest(live, WED), due.daysSinceFireTest(live, WED));
  assert.equal(svc.RED_AFTER_DAYS, due.RED_AFTER_DAYS);
  assert.equal(svc.FIRE_RED_AFTER_DAYS, due.FIRE_RED_AFTER_DAYS);
  // the app's own "what needs doing" calls the same things red
  const items = due.dueList({ assets: live, now: WED });
  assert.equal(items.find((i) => i.key === "overdue").tone === "critical", svc.outstanding({ assets, now: WED }).redOverdue.length > 0);
  assert.equal(items.find((i) => i.key === "fire-weekly").tone === "critical", svc.outstanding({ assets, now: WED }).fireRed);
});

test("what is outstanding: the fire test, late checks, failing assets; never a retired asset or a lone call point", () => {
  const state = svc.outstanding({ assets, now: WED });
  assert.equal(state.fireDue, true);
  assert.equal(state.fireDays, 10);
  assert.equal(state.fireRed, false, "ten days is late, not yet a fortnight");
  assert.deepEqual(state.overdue.map((a) => a.assetCode).sort(), ["FX-001", "WH-001", "WH-002"]);
  assert.deepEqual(state.redOverdue.map((a) => a.assetCode), ["WH-002"]);
  assert.deepEqual(state.failing.map((a) => a.assetCode), ["FD-001"]);
});

test("the caretaker's notice lists what is due in a few words, and says nothing when nothing is", () => {
  const notice = svc.caretakerNotice(svc.outstanding({ assets, now: WED }));
  assert.equal(notice.title, "Compliance checks due");
  assert.match(notice.message, /weekly fire alarm test has not been done for 10 days/);
  assert.match(notice.message, /3 checks due: .*WH-002/);
  assert.match(notice.message, /1 asset still failing: FD-001/);
  assert.equal(notice.priority, "high");
  const calm = svc.outstanding({ assets: [{ id: "w", assetCode: "WC-1", assetType: "water_cold", frequency: "monthly", lastCheckAt: ago(3) }, { id: "f", assetCode: "FP-1", assetType: "fire_point", lastCheckAt: ago(2) }], now: WED });
  assert.equal(svc.caretakerNotice(calm), null);
  assert.equal(svc.managerNotice(calm), null);
  // a fire test never done says so
  const never = svc.caretakerNotice(svc.outstanding({ assets: [{ id: "f", assetCode: "FP-1", assetType: "fire_point" }], now: WED }));
  assert.match(never.message, /never been done/);
  // a long list is cut short
  const many = Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, assetCode: `WH-0${i}`, assetType: "water_hot", frequency: "monthly", lastCheckAt: ago(40) }));
  assert.match(svc.caretakerNotice(svc.outstanding({ assets: many, now: WED })).message, /and 3 more/);
});

test("the practice manager hears only about what has gone red", () => {
  const notice = svc.managerNotice(svc.outstanding({ assets, now: WED }));
  assert.match(notice.message, /1 check more than a week overdue: WH-002/);
  assert.match(notice.message, /still failing: FD-001/);
  assert.ok(!/fire alarm test/.test(notice.message), "ten days since a fire test is not red yet");
  const redFire = svc.managerNotice(svc.outstanding({ assets: [{ id: "f", assetCode: "FP-1", assetType: "fire_point", lastCheckAt: new Date(WED.getTime() - 15 * DAY) }], now: WED }));
  assert.match(redFire.message, /No fire alarm test for 15 days/);
});

// a Firestore that keeps notifications in a map and refuses to create one twice, as the real one does
function fakeDb(assetRows) {
  const notes = new Map();
  const db = {
    notes,
    collection(name) {
      if (name === "compliance_assets") return { get: async () => ({ docs: assetRows.map((a) => ({ id: a.id, data: () => a })) }) };
      if (name === "users") return { doc: (uid) => ({ collection: () => ({ doc: (id) => ({ create: async (data) => { const key = `${uid}/${id}`; if (notes.has(key)) { const e = new Error("6 ALREADY_EXISTS"); e.code = 6; throw e; } notes.set(key, data); } }) }) }) };
      throw new Error(`unexpected collection ${name}`);
    },
  };
  return db;
}
const FieldValue = { serverTimestamp: () => "now" };

test("the morning job tells the caretaker each weekday once, the manager on Mondays, and nobody at the weekend", async () => {
  const db = fakeDb(assets);
  let told = await svc.runComplianceReminders({ db, FieldValue, now: WED, caretakers: ["care"], managers: ["pm"] });
  assert.deepEqual(told, { caretakers: 1, managers: 0, skipped: "" }, "Wednesday: the caretaker only");
  assert.equal([...db.notes.keys()].join(), "care/cd-2026-10-14");
  const note = db.notes.get("care/cd-2026-10-14");
  assert.equal(note.module, "compliance");
  assert.equal(note.actionUrl, "/compliance");
  assert.equal(note.recipientUid, "care");
  assert.equal(note.automated, true);

  told = await svc.runComplianceReminders({ db, FieldValue, now: WED, caretakers: ["care"], managers: ["pm"] });
  assert.equal(told.caretakers, 0, "run again the same day: no second notice");

  told = await svc.runComplianceReminders({ db, FieldValue, now: MON, caretakers: ["care"], managers: ["pm"] });
  assert.deepEqual(told, { caretakers: 1, managers: 1, skipped: "" }, "Monday: both");
  assert.ok(db.notes.has("pm/cm-2026-10-12"));

  told = await svc.runComplianceReminders({ db, FieldValue, now: SAT, caretakers: ["care"], managers: ["pm"] });
  assert.equal(told.skipped, "weekend");
  assert.equal(db.notes.size, 3);
});

test("with nothing due nobody is told", async () => {
  const db = fakeDb([{ id: "w", assetCode: "WC-1", assetType: "water_cold", frequency: "monthly", lastCheckAt: ago(3) }]);
  const told = await svc.runComplianceReminders({ db, FieldValue, now: MON, caretakers: ["care"], managers: ["pm"] });
  assert.deepEqual(told, { caretakers: 0, managers: 0, skipped: "" });
  assert.equal(db.notes.size, 0);
});

test("the day is the London day, not the cloud's (UTC) day", () => {
  // 23:30 UTC on 14 Oct is 00:30 on the 15th in London (British Summer Time)
  const late = new Date(Date.UTC(2026, 9, 14, 23, 30));
  assert.equal(svc.londonDay(late).key, "2026-10-15");
  assert.equal(svc.londonDay(late).weekday, 4);
});
