const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getEffectiveCapabilities, hasCapability } = require("./roleCapabilities");

// A daily look at the stock for two things people can't easily see for themselves:
//
//  1. Stock nobody has touched for a long time (no use, count, delivery or edit). Nobody has
//     checked that what is recorded is what is on the shelf, so the person who last handled it
//     is asked to do a stock take and update Primovex.
//  2. Stock that is plainly too much or too little for how fast it is really used: at the
//     rate it was used over the last year, how many months or days would it last?
//
// Emergency drugs and equipment, and anything held only in a kit, are left out: they are meant to
// sit unused. The result is written for the Alerts page; the stock take messages go to individual
// people, and a short weekly summary goes to the people who can verify stock. Clients can never
// write notifications, so this runs on the server. Pure analysis first, so it can be tested.

const DAY = 86400000;

const DEFAULTS = {
  dormantDays: 180, // no use, count, delivery or edit for this long -> ask for a stock take
  overstockDays: 365, // would last longer than this at the usual rate -> too much
  understockDays: 21, // would run out sooner than this at the usual rate -> may run short
  windowDays: 365, // how far back the usual rate is worked out from
  minHistoryDays: 60, // an item needs this much history before its rate is trusted
  minUsedUnits: 3, // and to have been used at least this much in the window
  leadTimeDays: 14, // delivery time assumed when an item doesn't say
  targetOverstockDays: 180, // what "enough" would be, for the suggestion
  exemptCategories: ["emergency-drugs", "emergency-equipment"],
  maxPerGroup: 100,
  maxMessagesPerPerson: 8,
};

const toMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
};
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const label = (item) => [item.name, item.strength, item.form].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || "Unnamed item";

function settingsWithDefaults(settings = {}) {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (settings[key] === undefined || settings[key] === null) continue;
    if (Array.isArray(DEFAULTS[key])) { if (Array.isArray(settings[key])) out[key] = settings[key]; }
    else if (Number.isFinite(Number(settings[key])) && Number(settings[key]) > 0) out[key] = Number(settings[key]);
  }
  return out;
}

// Left out because it is meant to sit unused: emergency drugs/equipment, anything an administrator
// has marked review_exempt, and stock that is all inside kits.
function isExempt(item, cfg) {
  if (item.review_exempt === true) return true;
  const ids = [item.subcategory, item.category].map((v) => String(v || "").toLowerCase());
  if (ids.some((id) => cfg.exemptCategories.includes(id))) return true;
  if (/emergency|anaphyla|resus/.test(ids.join(" "))) return true;
  const locations = Array.isArray(item.locations) ? item.locations : [];
  const inKits = locations.filter((l) => String(l.locationId || "").startsWith("kit:")).reduce((sum, l) => sum + num(l.quantity), 0);
  return num(item.current_stock) > 0 && inKits >= num(item.current_stock);
}

// What has happened to each item in the window.
function summariseMovements(movements, now, windowDays) {
  const since = now - windowDays * DAY;
  const byItem = new Map();
  for (const m of movements) {
    const at = toMs(m.created_at);
    if (!m.item_id || !at) continue;
    const row = byItem.get(m.item_id) || { used: 0, lastUse: 0, lastCount: 0, lastReceive: 0, lastActor: null, lastActorAt: 0, first: 0 };
    if (!row.first || at < row.first) row.first = at;
    if (m.type === "use" && at >= since) row.used += Math.abs(num(m.delta));
    if (m.type === "use") row.lastUse = Math.max(row.lastUse, at);
    if (m.type === "adjust") row.lastCount = Math.max(row.lastCount, at);
    if (m.type === "receive") row.lastReceive = Math.max(row.lastReceive, at);
    if ((m.type === "use" || m.type === "adjust") && m.actor?.uid && at > row.lastActorAt) { row.lastActor = m.actor; row.lastActorAt = at; }
    byItem.set(m.item_id, row);
  }
  return byItem;
}

function analyseStock({ items = [], movements = [], settings = {}, now = Date.now() } = {}) {
  const cfg = settingsWithDefaults(settings);
  const moves = summariseMovements(movements, now, cfg.windowDays);
  const dormant = [];
  const overstocked = [];
  const understocked = [];
  let considered = 0;
  let exempt = 0;

  for (const item of items) {
    if (!item || item.archived_at) continue;
    const stock = num(item.current_stock);
    if (stock <= 0) continue;
    if (isExempt(item, cfg)) { exempt += 1; continue; }
    considered += 1;
    const m = moves.get(item.id) || { used: 0, lastUse: 0, lastCount: 0, lastReceive: 0, lastActor: null, first: 0 };
    const created = toMs(item.created_at) || m.first || 0;
    const lastActivity = Math.max(m.lastUse, m.lastCount, m.lastReceive, toMs(item.updated_at), created);
    const name = label(item);

    // 1. nobody has touched it for a long time
    if (lastActivity && now - lastActivity >= cfg.dormantDays * DAY) {
      const actor = m.lastActor || item.last_movement?.actor || null;
      dormant.push({
        itemId: item.id, name, stock, daysSince: Math.floor((now - lastActivity) / DAY), lastActivityAt: lastActivity,
        lastUseAt: m.lastUse || null, lastActorUid: actor?.uid || "", lastActorName: actor?.displayName || actor?.email || "",
      });
      continue; // a dormant item is a stock take question, not a rate question
    }

    // 2. too much or too little for how fast it is really used
    const historyDays = Math.min(cfg.windowDays, created ? (now - created) / DAY : cfg.windowDays);
    if (historyDays < cfg.minHistoryDays || m.used < cfg.minUsedUnits) continue;
    const perDay = m.used / Math.max(historyDays, 1);
    if (perDay <= 0) continue;
    const coverDays = stock / perDay;
    const lead = num(item.lead_time_days) || cfg.leadTimeDays;
    const min = num(item.min_stock);
    if (coverDays > cfg.overstockDays) {
      overstocked.push({ itemId: item.id, name, stock, perMonth: round1(perDay * 30), coverMonths: round1(coverDays / 30), suggestedMax: Math.max(1, Math.ceil(perDay * cfg.targetOverstockDays)) });
    } else if (coverDays < cfg.understockDays) {
      understocked.push({ itemId: item.id, name, stock, perWeek: round1(perDay * 7), coverDays: Math.max(0, Math.floor(coverDays)), minStock: min, suggestedMin: Math.max(1, Math.ceil(perDay * lead * 1.5)), reason: "cover" });
    } else if (min > 0 && min < perDay * lead) {
      understocked.push({ itemId: item.id, name, stock, perWeek: round1(perDay * 7), coverDays: Math.floor(coverDays), minStock: min, suggestedMin: Math.max(1, Math.ceil(perDay * lead * 1.5)), reason: "minimum" });
    }
  }

  const cap = (rows, sorter) => rows.sort(sorter).slice(0, cfg.maxPerGroup);
  return {
    generatedAt: now,
    considered,
    exempt,
    dormant: cap(dormant, (a, b) => b.daysSince - a.daysSince),
    overstocked: cap(overstocked, (a, b) => b.coverMonths - a.coverMonths),
    understocked: cap(understocked, (a, b) => a.coverDays - b.coverDays),
    settings: { dormantDays: cfg.dormantDays, overstockDays: cfg.overstockDays, understockDays: cfg.understockDays },
  };
}

const round1 = (n) => Math.round(n * 10) / 10;

// ---- the messages -------------------------------------------------------------------------------------------------

// London date parts for "is it Monday" and the quarter / week keys used in message ids.
function londonParts(nowMs) {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday, year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function isoWeekKey(nowMs) {
  const { year, month, day } = londonParts(nowMs);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const quarterKey = (nowMs) => { const { year, month } = londonParts(nowMs); return `${year}-Q${Math.floor((month - 1) / 3) + 1}`; };
const months = (days) => Math.max(1, Math.round(days / 30));

// recipients: { activeUids: Set, controllerUids: [] }. Returns [{ uid, id, data }].
function planStockReviewMessages({ analysis, recipients, now = Date.now(), maxPerPerson = DEFAULTS.maxMessagesPerPerson }) {
  const out = [];
  const perPerson = new Map();
  const base = { module: "inventory", read: false, status: "open", automated: true, createdByUid: null, createdByName: "Primovex stock review" };

  // 1. stock take requests, one message per item to the person who last handled it
  for (const row of analysis.dormant) {
    const targets = row.lastActorUid && recipients.activeUids.has(row.lastActorUid) ? [row.lastActorUid] : recipients.controllerUids;
    for (const uid of targets) {
      const list = perPerson.get(uid) || [];
      list.push(row);
      perPerson.set(uid, list);
    }
  }
  const quarter = quarterKey(now);
  for (const [uid, rows] of perPerson) {
    rows.slice(0, maxPerPerson).forEach((row) => {
      out.push({
        uid, id: `stock-stocktake-${row.itemId}-${quarter}-${uid}`,
        data: {
          ...base, recipientUid: uid, kind: "stock-stocktake", priority: "routine",
          title: `Please do a stock take: ${row.name}`,
          message: `Nothing has been recorded for it in about ${months(row.daysSince)} months (${row.stock} recorded). Please count what is on the shelf and update Primovex.`,
          actionUrl: `/inventory?find=${encodeURIComponent(row.name)}`,
        },
      });
    });
    if (rows.length > maxPerPerson) {
      out.push({
        uid, id: `stock-stocktake-more-${quarter}-${uid}`,
        data: { ...base, recipientUid: uid, kind: "stock-stocktake", priority: "routine", title: `${rows.length - maxPerPerson} more items need a stock take`, message: "Open the Alerts page to see the full list.", actionUrl: "/alerts" },
      });
    }
  }

  // 2. a weekly summary for the people who verify stock, on Mondays
  const { weekday } = londonParts(now);
  const counts = { dormant: analysis.dormant.length, over: analysis.overstocked.length, short: analysis.understocked.length };
  if (weekday === "Mon" && counts.dormant + counts.over + counts.short > 0) {
    const bits = [];
    if (counts.over) bits.push(`${counts.over} look overstocked (${analysis.overstocked.slice(0, 3).map((r) => r.name).join(", ")}${counts.over > 3 ? ", …" : ""})`);
    if (counts.short) bits.push(`${counts.short} may run short (${analysis.understocked.slice(0, 3).map((r) => r.name).join(", ")}${counts.short > 3 ? ", …" : ""})`);
    if (counts.dormant) bits.push(`${counts.dormant} not used for ${months(analysis.settings.dormantDays)}+ months and due a stock take`);
    const week = isoWeekKey(now);
    for (const uid of recipients.controllerUids) {
      out.push({
        uid, id: `stock-review-weekly-${week}-${uid}`,
        data: { ...base, recipientUid: uid, kind: "stock-review-weekly", priority: "routine", title: "Weekly stock review", message: `${bits.join("; ")}.`, actionUrl: "/alerts" },
      });
    }
  }
  return out;
}

// ---- running it ------------------------------------------------------------------------------------------------------------

async function findRecipients({ db, capsForRole = (role) => getEffectiveCapabilities(db, role) }) {
  const snap = await db.collection("users").get();
  const cache = new Map();
  const activeUids = new Set();
  const controllerUids = [];
  for (const doc of snap.docs) {
    const user = doc.data() || {};
    if (user.active === false) continue;
    activeUids.add(doc.id);
    if (!user.role) continue;
    if (!cache.has(user.role)) cache.set(user.role, await capsForRole(user.role));
    if (hasCapability(cache.get(user.role), "inventory.verify")) controllerUids.push(doc.id);
  }
  return { activeUids, controllerUids };
}

async function runStockReview({ db, now = Date.now(), notify = true, capsForRole } = {}) {
  const settingsSnap = await db.collection("settings").doc("stockReview").get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const cfg = settingsWithDefaults(settings);
  const [itemsSnap, movesSnap] = await Promise.all([
    db.collection("stock_items").get(),
    db.collection("stock_movements").where("created_at", ">=", Timestamp.fromMillis(now - cfg.windowDays * DAY)).get(),
  ]);
  const analysis = analyseStock({
    items: itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    movements: movesSnap.docs.map((d) => d.data()),
    settings,
    now,
  });
  await db.collection("stock_reviews").doc("latest").set({ ...analysis, generatedAt: Timestamp.fromMillis(now), updatedAt: FieldValue.serverTimestamp() });

  const result = { considered: analysis.considered, dormant: analysis.dormant.length, overstocked: analysis.overstocked.length, understocked: analysis.understocked.length, messages: 0 };
  if (!notify) return result;
  const recipients = await findRecipients({ db, capsForRole });
  const plan = planStockReviewMessages({ analysis, recipients, now, maxPerPerson: cfg.maxMessagesPerPerson });
  for (const message of plan) {
    try {
      await db.collection("users").doc(message.uid).collection("notifications").doc(message.id).create({ ...message.data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      result.messages += 1;
    } catch (error) {
      if (!(error?.code === 6 || /already exists/i.test(error?.message || ""))) throw error;
    }
  }
  return result;
}

module.exports = { DEFAULTS, settingsWithDefaults, isExempt, analyseStock, planStockReviewMessages, findRecipients, runStockReview, isoWeekKey, quarterKey };
