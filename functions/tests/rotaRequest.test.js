const test = require("node:test");
const assert = require("node:assert/strict");
const { rotaRequest, applySwap } = require("../services/rotaRequestService");

const NOW = new Date(Date.UTC(2026, 10, 12, 9, 0, 0)); // Thu 12 Nov 2026
const MON = "2026-11-16";
const DAYS = ["mon", "tue", "wed", "thu", "fri"];
const iso = (d) => ({ mon: "2026-11-16", tue: "2026-11-17", wed: "2026-11-18", thu: "2026-11-19", fri: "2026-11-20" }[d]);

// ---- an in-memory database with what the service touches ----
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  let auto = 0;
  const ref = (path) => ({
    path, id: path.split("/").pop(),
    get: async () => ({ exists: store.has(path), data: () => store.get(path), id: path.split("/").pop() }),
    set: async (value) => { store.set(path, JSON.parse(JSON.stringify(value, (k, v) => (v && v._methodName ? "SERVER_TIME" : v)))); },
    update: async (value) => { store.set(path, { ...store.get(path), ...JSON.parse(JSON.stringify(value, (k, v) => (v && v._methodName ? "SERVER_TIME" : v))) }); },
    collection: (name) => collection(`${path}/${name}`),
  });
  const collection = (path) => ({
    doc: (id) => ref(`${path}/${id || `auto${String(++auto).padStart(10, "0")}`}`),
    get: async () => ({ docs: [...store.entries()].filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/")).map(([p, d]) => ({ id: p.split("/").pop(), data: () => d })) }),
  });
  return {
    store,
    collection,
    runTransaction: async (fn) => {
      const writes = [];
      const tx = {
        get: async (r) => r.get(),
        update: (r, v) => writes.push(() => r.update(v)),
        set: (r, v) => writes.push(() => r.set(v)),
      };
      await fn(tx);
      for (const w of writes) await w();
    },
  };
}

const shift = (id, label, start, end, extra = {}) => ({ id, label, group: id, start, end, essential: true, count: 1, days: DAYS, ...extra });
const person = (uid, name, extra = {}) => ({ uid, name, days: DAYS, mode: "pool", shift: "", onlyShifts: [], coverShifts: [], cannotDo: [], earliest: {}, latest: {}, maxPerWeek: {}, dayRules: {}, ...extra });
const RULES = {
  shifts: [shift("early1", "Early 1", "08:00", "16:30"), shift("early2", "Early 2", "08:00", "16:30"), shift("late", "Late", "10:00", "18:30"), shift("half", "Half day", "09:00", "13:00", { essential: false }), shift("admin2", "Admin 2", "08:30", "17:00", { essential: false })],
  settings: {},
  people: [person("kim", "Kim"), person("emily", "Emily"), person("lewis", "Lewis"), person("libby", "Libby"), person("jack", "Jack", { mode: "fixed", shift: "admin2" })],
};
const weekDoc = (monday, slotsByDay) => ({ mondayIso: monday, days: Object.fromEntries(DAYS.map((d) => [d, { iso: iso(d), slots: slotsByDay[d] || {}, unfilled: [] }])), issues: [], edited: {} });
const place = (uid) => ({ uid, name: RULES.people.find((p) => p.uid === uid).name, source: "auto" });
const MONDAY_SLOTS = { early1: place("kim"), early2: place("emily"), late: place("libby"), admin2: place("jack"), half: undefined };
const slots = () => Object.fromEntries(DAYS.map((d) => [d, { early1: place("kim"), early2: place("emily"), late: place("libby"), admin2: place("jack") }]));
function seed(extra = {}) {
  return {
    "settings/rota": { teamAccess: true },
    "reception_rota_rules/main": RULES,
    [`reception_rota_weeks/${MON}`]: weekDoc(MON, slots()),
    "roles/Practice Manager": { capabilities: ["rota.manage"] },
    "roles/Reception": { capabilities: ["dashboard.read"] },
    "users/pm": { displayName: "Pat Manager", role: "Practice Manager" },
    "users/sarah": { displayName: "Sarah", role: "Reception", permissionExceptions: { allow: ["rota.manage"] } },
    "users/kim": { displayName: "Kim", role: "Reception" },
    "users/emily": { displayName: "Emily", role: "Reception" },
    "users/lewis": { displayName: "Lewis", role: "Reception" },
    "users/libby": { displayName: "Libby", role: "Reception" },
    "users/stranger": { displayName: "Stranger", role: "Reception" },
    ...extra,
  };
}
const staff = (db, uid, data, over = {}) => rotaRequest({ db, uid, profile: { displayName: db.store.get(`users/${uid}`)?.displayName || uid }, capabilities: ["dashboard.read"], data, now: NOW, ...over });
const coordinator = (db, uid, data) => rotaRequest({ db, uid, profile: { displayName: uid }, capabilities: ["rota.manage"], data, now: NOW });
const notificationsFor = (db, uid) => [...db.store.entries()].filter(([p]) => p.startsWith(`users/${uid}/notifications/`)).map(([, d]) => d);
const requests = (db) => [...db.store.entries()].filter(([p]) => p.startsWith("reception_rota_requests/")).map(([p, d]) => ({ id: p.split("/").pop(), ...d }));
const whoIs = (db, day, key) => db.store.get(`reception_rota_weeks/${MON}`).days[day].slots[key]?.uid;
const swapKimLibby = { action: "create_swap", from: { monday: MON, day: "mon", key: "early1" }, to: { monday: MON, day: "mon", key: "late" } };

test("nothing is done for the team until the Practice Manager has switched their access on", async () => {
  const db = fakeDb(seed({ "settings/rota": {} }));
  assert.deepEqual(await staff(db, "kim", swapKimLibby), { enabled: false });
  assert.deepEqual(await staff(db, "kim", { action: "options", from: { monday: MON, day: "mon", key: "early1" } }), { enabled: false });
  assert.equal(requests(db).length, 0);
});

test("the swaps on offer for your own shift are the ones that work, and only the team can ask", async () => {
  const db = fakeDb(seed());
  const r = await staff(db, "kim", { action: "options", from: { monday: MON, day: "mon", key: "early1" } });
  assert.equal(r.ok, true);
  const names = r.options.map((o) => o.name).sort();
  assert.deepEqual(names, ["Emily", "Libby"], "Jack is always on Admin 2, so not Jack");
  assert.ok(r.options.every((o) => o.monday === MON && o.day === "mon" && !o.changesHours));
  await assert.rejects(staff(db, "stranger", { action: "options", from: { monday: MON, day: "mon", key: "early1" } }), /not on the rota/);
  assert.deepEqual((await staff(db, "emily", { action: "options", from: { monday: MON, day: "mon", key: "early1" } })).options, [], "not Emily's shift: nothing on offer");
});

test("asking for a swap: the request is made, the colleague is told, and a swap that is not possible or not yours is refused", async () => {
  const db = fakeDb(seed());
  const r = await staff(db, "kim", swapKimLibby);
  assert.equal(r.status, "awaiting_colleague");
  assert.equal(r.changesHours, false);
  const [req] = requests(db);
  assert.equal(req.requesterUid, "kim"); assert.equal(req.targetUid, "libby");
  assert.match(req.a.label, /Early 1, Mon 16 Nov, 8 to 16\.30/);
  const told = notificationsFor(db, "libby");
  assert.equal(told.length, 1);
  assert.match(told[0].title, /Kim would like to swap shifts with you/);
  assert.equal(told[0].actionUrl, "/my-rota");
  await assert.rejects(staff(db, "emily", swapKimLibby), /not your shift/);
  await assert.rejects(staff(db, "kim", { ...swapKimLibby, to: { monday: MON, day: "mon", key: "admin2" } }), /swap is not possible: Jack is always on Admin 2/);
  await assert.rejects(staff(db, "kim", { ...swapKimLibby, to: { monday: MON, day: "mon", key: "nobody" } }), /Nobody is on that shift/);
  await assert.rejects(staff(db, "kim", { ...swapKimLibby, from: { monday: "2026-11-17", day: "mon", key: "early1" } }), /could not be found/, "not a Monday");
  await assert.rejects(staff(db, "stranger", swapKimLibby), /not on the rota|not your shift/);
});

test("the colleague says yes: with no change to hours it is made at once, both weeks and the published copy change, and the requester and the coordinators are told", async () => {
  const published = { mondayIso: MON, days: { mon: { iso: iso("mon"), slots: {} } }, teamUids: [] };
  const db = fakeDb(seed({ [`reception_rota_published/${MON}`]: published }));
  await staff(db, "kim", swapKimLibby);
  const id = requests(db)[0].id;
  const r = await staff(db, "libby", { action: "accept", id });
  assert.equal(r.status, "approved");
  assert.equal(whoIs(db, "mon", "early1"), "libby");
  assert.equal(whoIs(db, "mon", "late"), "kim");
  const week = db.store.get(`reception_rota_weeks/${MON}`);
  assert.equal(week.edited["mon|early1"], true, "kept when the week is built again");
  const pub = db.store.get(`reception_rota_published/${MON}`);
  assert.equal(pub.days.mon.slots.early1.uid, "libby", "the team's copy is updated");
  assert.doesNotMatch(JSON.stringify(pub), /issues|edited/);
  assert.equal(requests(db)[0].status, "approved");
  assert.match(notificationsFor(db, "kim")[0].title, /Your swap is done/);
  const coordinatorsTold = ["pm", "sarah"].map((u) => notificationsFor(db, u).length);
  assert.deepEqual(coordinatorsTold, [1, 1], "the Practice Manager and the coordinator are told, nobody is asked");
  assert.match(notificationsFor(db, "sarah")[0].message, /No hours changed, so nothing needs approving/);
  assert.equal(notificationsFor(db, "lewis").length, 0);
  assert.equal(r.audit.metadata.changesHours, false);
  assert.doesNotMatch(JSON.stringify(r.audit), /Kim|Libby/, "the audit never has names");
});

test("the colleague can say no, only the colleague can answer, and a request can only be answered once", async () => {
  const db = fakeDb(seed());
  await staff(db, "kim", swapKimLibby);
  const id = requests(db)[0].id;
  await assert.rejects(staff(db, "emily", { action: "accept", id }), /not for you/);
  await assert.rejects(staff(db, "kim", { action: "accept", id }), /not for you/);
  const no = await staff(db, "libby", { action: "decline", id });
  assert.equal(no.status, "declined_by_colleague");
  assert.match(notificationsFor(db, "kim")[0].title, /Libby cannot swap shifts/);
  assert.equal(whoIs(db, "mon", "early1"), "kim", "nothing changed");
  await assert.rejects(staff(db, "libby", { action: "accept", id }), /no longer waiting/);
});

test("the requester can cancel while it is waiting; nobody else can", async () => {
  const db = fakeDb(seed());
  await staff(db, "kim", swapKimLibby);
  const id = requests(db)[0].id;
  await assert.rejects(staff(db, "libby", { action: "cancel", id }), /not yours/);
  const r = await staff(db, "kim", { action: "cancel", id });
  assert.equal(r.status, "cancelled");
  assert.match(notificationsFor(db, "libby").at(-1).title, /Kim cancelled the swap/);
  await assert.rejects(staff(db, "kim", { action: "cancel", id }), /no longer waiting/);
});

test("if the rota changed since the request, accepting it fails safely and says so, and nothing is changed", async () => {
  const db = fakeDb(seed());
  await staff(db, "kim", swapKimLibby);
  const id = requests(db)[0].id;
  const week = db.store.get(`reception_rota_weeks/${MON}`);
  week.days.mon.slots.late = place("lewis"); // the coordinator moved Libby off the late
  const r = await staff(db, "libby", { action: "accept", id });
  assert.equal(r.ok, false);
  assert.equal(r.status, "failed");
  assert.equal(whoIs(db, "mon", "early1"), "kim");
  assert.equal(requests(db)[0].status, "failed");
  assert.match(notificationsFor(db, "kim").at(-1).message, /rota has changed/);
});

test("a swap that changes someone's hours waits for the coordinator, who is told; the coordinator can agree it or decline it with a reason; only they can", async () => {
  const slotsHalf = slots();
  slotsHalf.mon = { early1: place("kim"), early2: place("emily"), late: place("libby"), half: place("lewis"), admin2: place("jack") };
  const db = fakeDb(seed({ [`reception_rota_weeks/${MON}`]: weekDoc(MON, slotsHalf) }));
  const ask = await staff(db, "kim", { action: "create_swap", from: { monday: MON, day: "mon", key: "early1" }, to: { monday: MON, day: "mon", key: "half" } });
  assert.equal(ask.changesHours, true);
  const id = requests(db)[0].id;
  assert.match(requests(db)[0].hoursNote.join(" "), /Kim: 42h 30m to 38h/);
  const yes = await staff(db, "lewis", { action: "accept", id });
  assert.equal(yes.status, "awaiting_coordinator");
  assert.equal(whoIs(db, "mon", "early1"), "kim", "not made yet");
  assert.match(notificationsFor(db, "sarah").at(-1).title, /needs your approval/);
  assert.match(notificationsFor(db, "sarah").at(-1).message, /changes hours/);
  await assert.rejects(staff(db, "kim", { action: "approve", id }), /Only the person who builds the rota/);
  await assert.rejects(coordinator(db, "sarah", { action: "reject", id, reasonKey: "because" }), /Choose a reason/);
  const no = await coordinator(db, "sarah", { action: "reject", id, reasonKey: "cover" });
  assert.equal(no.status, "declined");
  assert.equal(requests(db)[0].decision.reason, "There is not enough cover");
  assert.match(notificationsFor(db, "kim").at(-1).message, /not enough cover/);
  // and the other way
  const db2 = fakeDb(seed({ [`reception_rota_weeks/${MON}`]: weekDoc(MON, slotsHalf) }));
  await staff(db2, "kim", { action: "create_swap", from: { monday: MON, day: "mon", key: "early1" }, to: { monday: MON, day: "mon", key: "half" } });
  const id2 = requests(db2)[0].id;
  await staff(db2, "lewis", { action: "accept", id: id2 });
  const okay = await coordinator(db2, "pm", { action: "approve", id: id2 });
  assert.equal(okay.status, "approved");
  assert.equal(db2.store.get(`reception_rota_weeks/${MON}`).days.mon.slots.half.uid, "kim");
  assert.equal(db2.store.get(`reception_rota_weeks/${MON}`).days.mon.slots.early1.uid, "lewis");
  assert.equal(okay.audit.metadata.changesHours, true);
});

test("asking for an adjustment: it goes to the coordinator, who is told; the coordinator agrees it (and the time off is entered with its times) or declines it", async () => {
  const db = fakeDb(seed());
  const r = await staff(db, "kim", { action: "create_adjust", monday: MON, day: "thu", kind: "finish_early", fromTime: "14:00", reason: "toil" });
  assert.equal(r.status, "awaiting_coordinator");
  const req = requests(db)[0];
  assert.equal(req.adjust.text, "Finish early at 14");
  assert.deepEqual(notificationsFor(db, "sarah").map((n) => n.title), ["Kim has asked for an adjustment"]);
  assert.doesNotMatch(JSON.stringify(notificationsFor(db, "sarah")), /toil|leave|sick/i, "the reason is not in the notification");
  await assert.rejects(staff(db, "kim", { action: "agree_adjust", id: req.id }), /Only the person who builds the rota/);
  const agreed = await coordinator(db, "sarah", { action: "agree_adjust", id: req.id });
  assert.equal(agreed.status, "approved");
  assert.equal(agreed.enteredTimeOff, true);
  const absences = [...db.store.entries()].filter(([p]) => p.startsWith("reception_rota_absences/")).map(([, d]) => d);
  assert.equal(absences.length, 1);
  assert.deepEqual({ uid: absences[0].uid, from: absences[0].from, to: absences[0].to, fromTime: absences[0].fromTime, reason: absences[0].reason }, { uid: "kim", from: "2026-11-19", to: "2026-11-19", fromTime: "14:00", reason: "toil" });
  assert.deepEqual(Object.keys(absences[0]).sort(), ["createdAt", "createdByName", "createdByUid", "fromTime", "from", "name", "reason", "to", "uid"].sort(), "only the fields the database allows");
  assert.match(notificationsFor(db, "kim").at(-1).title, /Your request was agreed/);
  // a different shift is a conversation: nothing is entered
  const r2 = await staff(db, "emily", { action: "create_adjust", monday: MON, day: "tue", kind: "different_shift", reason: "other" });
  const done = await coordinator(db, "sarah", { action: "agree_adjust", id: r2.id });
  assert.equal(done.enteredTimeOff, false);
  assert.equal([...db.store.keys()].filter((p) => p.startsWith("reception_rota_absences/")).length, 1);
});

test("an adjustment must be a real one: the right times, a reason from the list, a day that has not passed, and from someone on the rota", async () => {
  const db = fakeDb(seed());
  const ask = (over) => staff(db, "kim", { action: "create_adjust", monday: MON, day: "thu", kind: "finish_early", fromTime: "14:00", reason: "other", ...over });
  await assert.rejects(ask({ fromTime: "" }), /Choose the time you finish/);
  await assert.rejects(ask({ reason: "sickness" }), /Choose a reason/);
  await assert.rejects(ask({ kind: "nonsense" }), /Choose what you are asking for/);
  await assert.rejects(ask({ day: "sat" }), /Choose the day/);
  await assert.rejects(staff(db, "kim", { action: "create_adjust", monday: "2026-11-09", day: "mon", kind: "day_off", reason: "other" }), /already passed/);
  await assert.rejects(staff(db, "stranger", { action: "create_adjust", monday: MON, day: "thu", kind: "day_off", reason: "other" }), /not on the rota/);
  assert.equal(requests(db).length, 0);
});

test("the coordinator can decline an adjustment with a reason from the list, and the person is told", async () => {
  const db = fakeDb(seed());
  const r = await staff(db, "kim", { action: "create_adjust", monday: MON, day: "wed", kind: "day_off", reason: "leave" });
  const no = await coordinator(db, "pm", { action: "reject", id: r.id, reasonKey: "notice" });
  assert.equal(no.status, "declined");
  assert.match(notificationsFor(db, "kim").at(-1).message, /It needs more notice/);
  assert.equal([...db.store.keys()].filter((p) => p.startsWith("reception_rota_absences/")).length, 0);
});

test("asking is limited: forty an hour a person", async () => {
  const db = fakeDb(seed());
  const ask = () => staff(db, "kim", { action: "options", from: { monday: MON, day: "mon", key: "early1" } });
  for (let i = 0; i < 40; i += 1) assert.equal((await ask()).ok, true);
  await assert.rejects(ask(), /asked a lot|limit/i);
});

test("nothing from the rules or time off reaches the team: an offer lists only the colleague, the shift and whether hours change", async () => {
  const db = fakeDb(seed({ "reception_rota_absences/a1": { uid: "libby", from: "2026-11-23", to: "2026-11-23", reason: "other" } }));
  const r = await staff(db, "kim", { action: "options", from: { monday: MON, day: "mon", key: "early1" } });
  for (const o of r.options) assert.deepEqual(Object.keys(o).sort(), ["changesHours", "day", "key", "label", "monday", "name", "withUid"]);
  assert.doesNotMatch(JSON.stringify(r), /reason|absence|earliest|maxPerWeek|dayRules/);
});
