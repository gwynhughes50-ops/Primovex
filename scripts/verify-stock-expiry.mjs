// Mirrors parseExpiryDate/daysUntilExpiry/getExpiryStatus/summariseExpiry from
// src/services/stockService.js. Not imported directly: that file also pulls
// in the Firestore SDK at module scope (for its other exports), which drags
// in native gRPC bindings esbuild can't bundle for a plain Node script - the
// same reason useSmartHomeData.js already carried its own copy of the date
// parser before it was centralised there. Keep this in step with the real
// implementation if either changes.
import assert from "node:assert/strict";

function parseExpiryDate(value) {
  if (!value || typeof value !== "string") return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

const EXPIRY_SOON_DAYS = 14;

function daysUntilExpiry(item, now = new Date()) {
  const date = parseExpiryDate(item?.expiry_date);
  if (!date) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - start.getTime()) / 86400000);
}

function getExpiryStatus(item, now = new Date()) {
  const days = daysUntilExpiry(item, now);
  if (days === null) return null;
  if (days < 0) return "expired";
  if (days <= EXPIRY_SOON_DAYS) return "soon";
  return null;
}

function summariseExpiry(items = [], now = new Date()) {
  let expired = 0;
  let soon = 0;
  for (const item of items) {
    const status = getExpiryStatus(item, now);
    if (status === "expired") expired += 1;
    else if (status === "soon") soon += 1;
  }
  return { expired, soon, total: expired + soon };
}

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

t("parseExpiryDate: valid YYYY-MM-DD parses to local midnight", () => {
  const d = parseExpiryDate("2026-01-05");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 0);
  assert.equal(d.getDate(), 5);
});
t("parseExpiryDate: empty/garbage returns null", () => {
  assert.equal(parseExpiryDate(""), null);
  assert.equal(parseExpiryDate(null), null);
  assert.equal(parseExpiryDate("not-a-date"), null);
});

t("daysUntilExpiry: today is 0", () => assert.equal(daysUntilExpiry({ expiry_date: iso(0) }), 0));
t("daysUntilExpiry: tomorrow is 1, yesterday is -1", () => {
  assert.equal(daysUntilExpiry({ expiry_date: iso(1) }), 1);
  assert.equal(daysUntilExpiry({ expiry_date: iso(-1) }), -1);
});
t("daysUntilExpiry: no date returns null", () => assert.equal(daysUntilExpiry({}), null));

t("getExpiryStatus: past date is expired", () => assert.equal(getExpiryStatus({ expiry_date: iso(-1) }), "expired"));
t("getExpiryStatus: today is soon", () => assert.equal(getExpiryStatus({ expiry_date: iso(0) }), "soon"));
t("getExpiryStatus: 14 days out is soon, 15 days out is not", () => {
  assert.equal(getExpiryStatus({ expiry_date: iso(14) }), "soon");
  assert.equal(getExpiryStatus({ expiry_date: iso(15) }), null);
});
t("getExpiryStatus: far future is null, no date is null", () => {
  assert.equal(getExpiryStatus({ expiry_date: iso(60) }), null);
  assert.equal(getExpiryStatus({}), null);
});

t("summariseExpiry: counts expired and soon separately, ignores the rest", () => {
  const items = [
    { expiry_date: iso(-5) }, // expired
    { expiry_date: iso(-1) }, // expired
    { expiry_date: iso(3) },  // soon
    { expiry_date: iso(60) }, // neither
    {},                       // no date
  ];
  assert.deepEqual(summariseExpiry(items), { expired: 2, soon: 1, total: 3 });
});
t("summariseExpiry: empty list", () => assert.deepEqual(summariseExpiry([]), { expired: 0, soon: 0, total: 0 }));

console.log(`\n${n} passed`);
