// Covers the choices behind the kit check's quick actions
// (src/lib/kitCheckActions.js): reminders, messages and replacements.
import assert from "node:assert/strict";
import { REMIND_OPTIONS, MESSAGE_MAX, buildReplacement, isRealChange, prepareMessage, remindAtFor, replacementOptions } from "../src/lib/kitCheckActions.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const at = (y, m, d, h = 10, min = 0) => new Date(y, m - 1, d, h, min, 0);

t("later today is three hours on, on the hour", () => {
  const r = remindAtFor("later-today", at(2026, 10, 2, 10, 20));
  assert.deepEqual([r.getDate(), r.getHours(), r.getMinutes()], [2, 13, 0]);
});

t("later today late in the day rolls to tomorrow morning rather than the middle of the night", () => {
  const r = remindAtFor("later-today", at(2026, 10, 2, 16, 30)); // 19:00 would be after hours
  assert.deepEqual([r.getDate(), r.getHours()], [3, 9]);
  const night = remindAtFor("later-today", at(2026, 10, 2, 22, 30)); // would cross midnight
  assert.deepEqual([night.getDate(), night.getHours()], [3, 9]);
});

t("tomorrow and next week are 9am", () => {
  const tomorrow = remindAtFor("tomorrow", at(2026, 10, 2, 15));
  assert.deepEqual([tomorrow.getDate(), tomorrow.getHours(), tomorrow.getMinutes()], [3, 9, 0]);
  const week = remindAtFor("next-week", at(2026, 10, 2, 15));
  assert.deepEqual([week.getMonth() + 1, week.getDate(), week.getHours()], [10, 9, 9]);
  assert.equal(remindAtFor("anything-else", at(2026, 10, 2, 15)).getDate(), 3); // unknown -> tomorrow
});

t("every reminder choice offered produces a future time", () => {
  const now = at(2026, 10, 2, 11);
  for (const o of REMIND_OPTIONS) assert.ok(remindAtFor(o.id, now) > now, o.id);
});

t("a message is trimmed, tidied and must not be empty", () => {
  assert.deepEqual(prepareMessage("  Please   replace\nthis  "), { ok: true, text: "Please replace this", error: "" });
  assert.equal(prepareMessage("   ").ok, false);
  assert.equal(prepareMessage(null).ok, false);
  assert.match(prepareMessage("").error, /Write a message/);
});

t("a message over the limit is refused with the limit stated", () => {
  const r = prepareMessage("x".repeat(MESSAGE_MAX + 1));
  assert.equal(r.ok, false);
  assert.match(r.error, new RegExp(String(MESSAGE_MAX)));
  assert.equal(prepareMessage("x".repeat(MESSAGE_MAX)).ok, true);
});

// adrenaline in stock: lot A (12, expires soon), lot B (40, 2031), lot C (5, already expired)
const NOW = at(2026, 10, 2, 9);
const stock = {
  id: "adr", name: "Adrenaline 1mg/1ml", current_stock: 57,
  batches: [
    { batch_number: "A", expiry_date: "2026-12-31", quantity: 12 },
    { batch_number: "B", expiry_date: "2031-02-28", quantity: 40 },
    { batch_number: "C", expiry_date: "2026-01-31", quantity: 5 },
  ],
};
const kitItem = { id: "item_1", name: "Adrenaline 1mg/1ml", stock_item_id: "adr", defaultBatch: "C", defaultExpiry: "2026-01-31" };

t("replacement options: only batches in stock and in date, soonest-expiring first", () => {
  const { stock: found, options } = replacementOptions(kitItem, [stock], NOW);
  assert.equal(found.id, "adr");
  assert.deepEqual(options.map((o) => o.batch_number), ["A", "B"]); // C expired, so it can't be put in a kit
  assert.match(options[0].label, /Batch A · expires 31\/12\/2026 · 12 in stock/);
});

t("the batch the kit already has is marked, so it isn't offered as a 'new' one by mistake", () => {
  const withA = { ...kitItem, defaultBatch: "A", defaultExpiry: "2026-12-31" };
  const { options } = replacementOptions(withA, [stock], NOW);
  assert.equal(options.find((o) => o.batch_number === "A").current, true);
  assert.equal(options.find((o) => o.batch_number === "B").current, false);
});

t("a batch with no expiry date is still offered; an item with no stock record gets no options", () => {
  const noExpiry = { ...stock, current_stock: 3, batches: [{ batch_number: "", expiry_date: "", quantity: 3 }] };
  assert.equal(replacementOptions(kitItem, [noExpiry], NOW).options.length, 1);
  const unlinked = replacementOptions({ id: "x", name: "Free text item" }, [stock], NOW);
  assert.deepEqual(unlinked, { stock: null, options: [] });
});

t("a replacement records what it replaced and what it is", () => {
  const r = buildReplacement(kitItem, { batch_number: " B ", expiry_date: "2031-02-28" });
  assert.deepEqual(r, { batch_number: "B", expiry_date: "2031-02-28", previousBatch: "C", previousExpiry: "2026-01-31" });
  assert.equal(isRealChange(r), true);
});

t("choosing the batch already in the kit is not a change; bad dates are dropped", () => {
  assert.equal(isRealChange(buildReplacement(kitItem, { batch_number: "C", expiry_date: "2026-01-31" })), false);
  assert.equal(buildReplacement(kitItem, { batch_number: "B", expiry_date: "tomorrow" }).expiry_date, "");
  assert.equal(isRealChange(null), false);
});

console.log(`\n${n} passed`);
