const test = require("node:test");
const assert = require("node:assert/strict");
const { analyseStock, planStockReviewMessages, runStockReview, isExempt, settingsWithDefaults, DEFAULTS } = require("../services/stockReviewService");

const DAY = 86400000;
const MONDAY = Date.UTC(2026, 9, 12, 7, 0); // Mon 12 Oct 2026
const TUESDAY = MONDAY + DAY;
const ago = (days, from = MONDAY) => new Date(from - days * DAY);

const item = (over) => ({ id: over.id || over.name, current_stock: 10, created_at: ago(500), updated_at: ago(500), ...over });
const use = (item_id, qty, daysAgo, uid = "u1") => ({ item_id, type: "use", delta: -qty, created_at: ago(daysAgo), actor: { uid, displayName: `Name ${uid}` } });

const analyse = (items, movements, settings = {}, now = MONDAY) => analyseStock({ items, movements, settings, now });

test("stock nobody has touched for six months is dormant, with who last handled it", () => {
  const a = analyse(
    [item({ name: "Tongue depressors", id: "td", current_stock: 200 }), item({ name: "Gloves", id: "gl", current_stock: 100 })],
    [use("td", 5, 300, "alice"), use("gl", 2, 3)]
  );
  assert.deepEqual(a.dormant.map((d) => d.itemId), ["td"]);
  assert.equal(a.dormant[0].lastActorUid, "alice");
  assert.equal(a.dormant[0].lastActorName, "Name alice");
  assert.ok(a.dormant[0].daysSince >= 299);
});

test("a count, a delivery or an edit counts as touching it", () => {
  const base = item({ name: "Swabs", id: "sw", current_stock: 50 });
  const stale = [{ item_id: "sw", type: "use", delta: -1, created_at: ago(400), actor: { uid: "u1" } }];
  assert.equal(analyse([base], stale).dormant.length, 1);
  assert.equal(analyse([base], [...stale, { item_id: "sw", type: "adjust", delta: 0, created_at: ago(30), actor: { uid: "u2" } }]).dormant.length, 0, "a stock take resets it");
  assert.equal(analyse([base], [...stale, { item_id: "sw", type: "receive", delta: 20, created_at: ago(40) }]).dormant.length, 0, "a recent delivery resets it");
  assert.equal(analyse([{ ...base, updated_at: ago(10) }], stale).dormant.length, 0, "a recent edit resets it");
});

test("a new item, an item with nothing in stock and an archived one are not dormant", () => {
  const a = analyse(
    [item({ name: "New", id: "n", created_at: ago(20), updated_at: ago(20) }), item({ name: "Empty", id: "e", current_stock: 0 }), item({ name: "Old", id: "o", archived_at: ago(1) })],
    []
  );
  assert.equal(a.dormant.length, 0);
});

test("emergency drugs, emergency equipment and stock held only in kits are left alone", () => {
  const items = [
    item({ name: "Adrenaline", id: "adr", subcategory: "emergency-drugs" }),
    item({ name: "Defibrillator pads", id: "def", category: "emergency-equipment" }),
    item({ name: "Chlorphenamine", id: "chl", current_stock: 4, locations: [{ locationId: "kit:anaphylaxis_boxes:b1", locationName: "Box 1", quantity: 4 }] }),
    item({ name: "Marked", id: "mk", review_exempt: true }),
    item({ name: "Tongue depressors", id: "td" }),
  ];
  const a = analyse(items, []);
  assert.deepEqual(a.dormant.map((d) => d.itemId), ["td"]);
  assert.equal(a.exempt, 4);
  assert.equal(isExempt(items[2], settingsWithDefaults()), true);
  assert.equal(isExempt({ ...items[2], current_stock: 10 }, settingsWithDefaults()), false, "stock outside the kit still counts");
});

test("too much: it would take years to use at the usual rate", () => {
  const a = analyse([item({ name: "Nitrile gloves", id: "gl", current_stock: 4000 })], [use("gl", 300, 100), use("gl", 300, 10)]);
  assert.equal(a.overstocked.length, 1);
  const row = a.overstocked[0];
  assert.equal(row.itemId, "gl");
  assert.ok(row.coverMonths > 12);
  assert.equal(row.suggestedMax, Math.ceil((600 / 365) * 180));
});

test("too little: it would run out in under three weeks, with a suggested minimum", () => {
  const a = analyse([item({ name: "Dressing packs", id: "dp", current_stock: 20, min_stock: 10 })], [use("dp", 350, 200), use("dp", 350, 20)]);
  assert.equal(a.understocked.length, 1);
  const row = a.understocked[0];
  assert.equal(row.reason, "cover");
  assert.ok(row.coverDays < 21);
  assert.equal(row.suggestedMin, Math.ceil((700 / 365) * 14 * 1.5));
});

test("a minimum that is too low for how fast it is used is flagged even with plenty in stock", () => {
  const a = analyse([item({ name: "Syringes", id: "sy", current_stock: 100, min_stock: 5 })], [use("sy", 182, 300), use("sy", 183, 20)]);
  assert.equal(a.understocked.length, 1);
  assert.equal(a.understocked[0].reason, "minimum");
  assert.ok(a.understocked[0].suggestedMin > 5);
});

test("not enough history or use to judge, and sensible stock, are not flagged", () => {
  const a = analyse(
    [
      item({ name: "Brand new", id: "bn", created_at: ago(20), updated_at: ago(2), current_stock: 5000 }),
      item({ name: "Hardly used", id: "hu", current_stock: 5000 }),
      item({ name: "About right", id: "ar", current_stock: 120 }),
    ],
    [use("bn", 50, 5), use("hu", 1, 30), use("ar", 180, 200), use("ar", 180, 20)]
  );
  assert.equal(a.overstocked.length + a.understocked.length, 0);
});

test("settings are adjustable and ignore rubbish", () => {
  assert.equal(settingsWithDefaults({ dormantDays: 90 }).dormantDays, 90);
  assert.equal(settingsWithDefaults({ dormantDays: -5 }).dormantDays, DEFAULTS.dormantDays);
  assert.equal(settingsWithDefaults({ dormantDays: "abc" }).dormantDays, DEFAULTS.dormantDays);
  const quick = analyse([item({ name: "Tape", id: "tp" })], [use("tp", 1, 100)], { dormantDays: 90 });
  assert.equal(quick.dormant.length, 1);
});

const recipients = (extra = {}) => ({ activeUids: new Set(["alice", "bob", "ctl1", "ctl2"]), controllerUids: ["ctl1", "ctl2"], ...extra });

test("the person who last handled it gets one message per item; a controller if they have gone", () => {
  const analysis = analyse(
    [item({ name: "Tongue depressors", id: "td" }), item({ name: "Spatulas", id: "sp" })],
    [use("td", 1, 300, "alice"), use("sp", 1, 300, "gone")]
  );
  const plan = planStockReviewMessages({ analysis, recipients: recipients(), now: TUESDAY });
  const alice = plan.filter((m) => m.uid === "alice");
  assert.equal(alice.length, 1);
  assert.equal(alice[0].data.title, "Please do a stock take: Tongue depressors");
  assert.match(alice[0].data.message, /about \d+ months/);
  assert.match(alice[0].data.actionUrl, /^\/inventory\?find=Tongue%20depressors$/);
  assert.equal(alice[0].data.read, false);
  assert.match(alice[0].id, /^stock-stocktake-td-2026-Q4-alice$/);
  const spatulas = plan.filter((m) => m.data.title.includes("Spatulas"));
  assert.deepEqual(spatulas.map((m) => m.uid).sort(), ["ctl1", "ctl2"], "the last person has left: stock controllers instead");
});

test("one person is never buried: more than the limit becomes one 'more items' message", () => {
  const items = Array.from({ length: 12 }, (_, i) => item({ name: `Item ${i}`, id: `i${i}` }));
  const moves = items.map((it, i) => use(it.id, 1, 300 + i, "alice"));
  const plan = planStockReviewMessages({ analysis: analyse(items, moves), recipients: recipients(), now: TUESDAY });
  const mine = plan.filter((m) => m.uid === "alice");
  assert.equal(mine.length, 9);
  assert.match(mine[8].data.title, /4 more items need a stock take/);
});

test("the weekly summary goes to stock controllers on Mondays only, and only when there is something to say", () => {
  const analysis = analyse(
    [item({ name: "Nitrile gloves", id: "gl", current_stock: 4000 }), item({ name: "Dressing packs", id: "dp", current_stock: 20 }), item({ name: "Tongue depressors", id: "td" })],
    [use("gl", 600, 50), use("dp", 700, 30), use("td", 1, 300, "alice")]
  );
  const monday = planStockReviewMessages({ analysis, recipients: recipients(), now: MONDAY });
  const weekly = monday.filter((m) => m.data.kind === "stock-review-weekly");
  assert.deepEqual(weekly.map((m) => m.uid).sort(), ["ctl1", "ctl2"]);
  assert.match(weekly[0].data.message, /1 look overstocked \(Nitrile gloves\)/);
  assert.match(weekly[0].data.message, /1 may run short \(Dressing packs\)/);
  assert.match(weekly[0].data.message, /1 not used for 6\+ months/);
  assert.match(weekly[0].id, /^stock-review-weekly-2026-W42-ctl1$/);
  assert.equal(planStockReviewMessages({ analysis, recipients: recipients(), now: TUESDAY }).filter((m) => m.data.kind === "stock-review-weekly").length, 0);
  const calm = analyse([item({ name: "About right", id: "ar", current_stock: 120 })], [use("ar", 180, 200), use("ar", 180, 20)]);
  assert.equal(planStockReviewMessages({ analysis: calm, recipients: recipients(), now: MONDAY }).length, 0);
});

function fakeDb({ items, movements, users, settings = null }) {
  const notifications = new Map();
  const written = {};
  return {
    notifications, written,
    collection: (name) => ({
      get: async () => ({ docs: (name === "stock_items" ? items : name === "users" ? Object.entries(users).map(([id, d]) => ({ id, ...d, __user: true })) : []).map((d) => ({ id: d.id, data: () => (name === "users" ? users[d.id] : (({ id, ...rest }) => rest)(d)) })) }),
      where: () => ({ get: async () => ({ docs: movements.map((m) => ({ data: () => m })) }) }),
      doc: (id) => ({
        get: async () => ({ exists: name === "settings" && id === "stockReview" && settings !== null, data: () => settings, id }),
        set: async (data) => { written[`${name}/${id}`] = data; },
        collection: (sub) => ({
          doc: (nid) => ({
            create: async (data) => {
              const key = `${id}/${sub}/${nid}`;
              if (notifications.has(key)) { const e = new Error("already exists"); e.code = 6; throw e; }
              notifications.set(key, data);
            },
          }),
        }),
      }),
    }),
  };
}

test("a full run writes the review for the Alerts page and sends each message once", async () => {
  const items = [item({ name: "Tongue depressors", id: "td", current_stock: 200 }), item({ name: "Nitrile gloves", id: "gl", current_stock: 4000 })];
  const movements = [use("td", 1, 300, "alice"), use("gl", 600, 50)];
  const users = { alice: { role: "Nurse", displayName: "Alice" }, ctl1: { role: "Stock Controller" } };
  const capsForRole = async (role) => (role === "Stock Controller" ? ["inventory.verify"] : ["inventory.read"]);
  const db = fakeDb({ items, movements, users });
  const first = await runStockReview({ db, now: MONDAY, capsForRole });
  assert.equal(first.dormant, 1);
  assert.equal(first.overstocked, 1);
  assert.ok(db.written["stock_reviews/latest"], "the Alerts page reads this");
  assert.equal(db.written["stock_reviews/latest"].dormant[0].name, "Tongue depressors");
  assert.equal(first.messages, 2, "a stock take to Alice and the Monday summary to the controller");
  const again = await runStockReview({ db, now: MONDAY, capsForRole });
  assert.equal(again.messages, 0, "running again never repeats a message");
  const quiet = await runStockReview({ db: fakeDb({ items, movements, users }), now: MONDAY, capsForRole, notify: false });
  assert.equal(quiet.messages, 0);
});
