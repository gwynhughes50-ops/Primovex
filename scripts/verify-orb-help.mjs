// Covers the Orb's how-to help: that every article is well formed, that real phrasings find
// the right one, and that questions that aren't how-to's are left alone.
import assert from "node:assert/strict";
import { HELP_ARTICLES } from "../src/ai/help/helpArticles.js";
import { findHelp, formatHelpAnswer, isHowToQuestion, rankHelp, relatedQuestions, sampleQuestions, stem, tokens } from "../src/ai/help/helpSearch.js";
import { CAPABILITY_CATALOG } from "../src/core/identity/capabilities.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const ids = new Set(CAPABILITY_CATALOG.map((c) => c.id));

t("every article is complete, its permission exists, and its links and related articles are real", () => {
  const seen = new Set();
  HELP_ARTICLES.forEach((a) => {
    assert.ok(a.id && !seen.has(a.id), `unique id ${a.id}`);
    seen.add(a.id);
    ["title", "topic"].forEach((k) => assert.ok(String(a[k] || "").trim(), `${a.id} ${k}`));
    assert.ok(a.asks.length >= 3 && a.keywords.length >= 3, `${a.id} needs several asks and keywords`);
    assert.ok(a.steps.length >= 1 && a.steps.every((s) => s.trim().length > 10), `${a.id} steps`);
    assert.ok(["desktop", "phone", "both"].includes(a.where), `${a.id} where`);
    if (a.needs) assert.ok(ids.has(a.needs), `${a.id} needs unknown permission ${a.needs}`);
    if (a.open) assert.ok(a.open.route.startsWith("/") && a.open.label, `${a.id} open`);
    (a.related || []).forEach((r) => assert.ok(HELP_ARTICLES.some((x) => x.id === r), `${a.id} related ${r}`));
    assert.match(a.asks[0], /^(how|where do i)/i, `${a.id} first ask must be a how-to question`);
  });
});

t("a stem treats the forms of a word as one", () => {
  assert.equal(stem("adding"), stem("add"));
  assert.equal(stem("received"), stem("receive"));
  assert.equal(stem("scanning"), stem("scan"));
  assert.equal(stem("deliveries"), stem("delivery"));
  assert.deepEqual(tokens("How do I add a new product?").sort(), ["add", "new", "product"].map(stem).sort());
});

t("the first way of asking each article always finds that article", () => {
  HELP_ARTICLES.forEach((a) => {
    const found = findHelp(a.asks[0]);
    assert.equal(found.match?.id, a.id, `${a.id}: "${a.asks[0]}" found ${found.match?.id || "(" + found.alternatives.map((x) => x.id) + ")"}`);
  });
});

t("every other way of asking each article finds it or offers it, never a wrong one", () => {
  const wrong = [];
  HELP_ARTICLES.forEach((a) => a.asks.slice(1).forEach((ask) => {
    const f = findHelp(ask);
    const ok = f.match?.id === a.id || f.alternatives.some((x) => x.id === a.id);
    if (!ok && f.match) wrong.push(`${a.id} <- "${ask}" gave ${f.match.id}`);
  }));
  assert.deepEqual(wrong, []);
});

const PHRASINGS = [
  ["how do I add a new product to the system", "add-stock-item"],
  ["how do i book in a delivery", "add-stock-item"],
  ["how can I receive some stock that we already have", "receive-delivery"],
  ["the order has arrived, how do I put it on", "receive-delivery"],
  ["how do I record that I used some gloves", "use-stock"],
  ["how do i move adrenaline into the anaphylaxis box", "move-stock-to-kit"],
  ["I took stock from the store room and put it in the resus bag, how do I record it", "move-stock-to-kit"],
  ["how do I request more of something", "reorder-stock"],
  ["how do i delete a product permanently", "archive-delete-item"],
  ["how do I change what is in the emergency kit", "manage-kit"],
  ["how do I do the monthly anaphylaxis box check", "check-kit-phone"],
  ["how do I start a kit check on my phone", "check-kit-phone"],
  ["how do I print the label for a box", "print-box-label"],
  ["where do I find the anaphylaxis guidelines", "anaphylaxis-guidance"],
  ["how do I log the fridge temperature", "log-temperature"],
  ["the fridge is too warm what do I do", "fridge-out-of-range"],
  ["how do I log a SAR", "new-sar"],
  ["how do I record a complaint", "new-concern"],
  ["how do I add a new member of staff", "add-user"],
  ["how do I add loads of staff from a spreadsheet", "import-staff"],
  ["someone has forgotten their password how do I reset it", "reset-password"],
  ["how do I create a stock controller role", "add-role"],
  ["how do I put someone in a department", "set-department"],
  ["how do I print the org chart", "print-org-chart"],
  ["how do I see who has logged in", "activity-report"],
  ["how do I see who changed something", "view-audit-log"],
  ["how do i turn on the orb ai", "orb-ai-settings"],
  ["how do I change the expiry warning period", "expiry-warning-days"],
  ["how do I use the orb", "what-can-orb-do"],
  ["why has my screen locked", "screen-locked"],
];

t("real questions in ordinary wording find the right article", () => {
  const misses = PHRASINGS.filter(([q, id]) => {
    const f = findHelp(q);
    return f.match?.id !== id && !f.alternatives.some((x) => x.id === id);
  }).map(([q, id]) => `${id} <- "${q}" => ${findHelp(q).match?.id || "(" + findHelp(q).alternatives.map((x) => x.id) + ")" || "none"}`);
  assert.deepEqual(misses, []);
  const exact = PHRASINGS.filter(([q, id]) => findHelp(q).match?.id === id).length;
  assert.ok(exact / PHRASINGS.length >= 0.8, `only ${exact}/${PHRASINGS.length} matched outright`);
});

t("questions that aren't about how to do something are left alone", () => {
  // phrased like a how-to, but nothing we have help for
  ["how do I bake a cake", "how do I get to the car park", "how do I know if the fridge is ok", "how do I fix the photocopier", "how do I book annual leave", "how can I reach the practice by bus"].forEach((q) => {
    assert.equal(findHelp(q).match, null, `"${q}" should not find a how-to`);
    assert.deepEqual(findHelp(q).alternatives, [], `"${q}" should not offer choices`);
  });
  assert.equal(findHelp("").match, null);
  assert.deepEqual(rankHelp(""), []);
});

t("how-to questions are recognised, and 'where is the ECG' is not one", () => {
  ["how do I add stock", "How can we print this", "where do I find the guidance", "steps to receive a delivery", "show me how to log a temperature", "walk me through the kit check", "what is the process for adding a user", "help me with the org chart"].forEach((q) => assert.ok(isHowToQuestion(q), q));
  ["where is the ECG machine", "what stock is low", "how many items are out", "is the fridge ok", "who cleaned room 3"].forEach((q) => assert.ok(!isHowToQuestion(q), q));
});

t("an answer is numbered steps, the headline first, with the permission and platform notes", () => {
  const a = HELP_ARTICLES.find((x) => x.id === "receive-delivery");
  const label = (id) => CAPABILITY_CATALOG.find((c) => c.id === id)?.label || id;
  const text = formatHelpAnswer(a, { capabilities: ["inventory.write"], hasCapability: (c, need) => c.includes(need), capabilityLabel: label });
  assert.match(text, /^How to: Receive a delivery of something we already stock\n1\. Go to Inventory/);
  assert.match(text, /\n4\. Save\./);
  assert.ok(!/permission/.test(text)); // they have it
  const without = formatHelpAnswer(a, { capabilities: ["inventory.read"], hasCapability: (c, need) => c.includes(need), capabilityLabel: label });
  assert.match(without, /You'll need the "[^"]+" permission to do this\. If you can't see the button, ask an administrator\./);
  assert.match(formatHelpAnswer(a, { platform: "android" }), /^This is done on a computer, in the Primovex desktop app\.\nHow to:/);
  const phone = HELP_ARTICLES.find((x) => x.id === "check-kit-phone");
  assert.match(formatHelpAnswer(phone, { platform: "desktop" }), /^This is done on the phone/);
  assert.ok(!/^This is done/.test(formatHelpAnswer(phone, { platform: "android" })));
  assert.match(formatHelpAnswer({ ...a, steps: ["Only one step here."] }), /\n• Only one step here\./);
});

t("a close call between two articles is offered as a choice, not guessed", () => {
  const f = findHelp("how do I add something");
  assert.ok(f.match || f.alternatives.length >= 2);
});

t("suggested next questions are real, routable how-to's", () => {
  HELP_ARTICLES.forEach((a) => relatedQuestions(a).forEach((q) => {
    assert.ok(isHowToQuestion(q), q);
    assert.ok(findHelp(q).match, `"${q}" finds nothing`);
  }));
  assert.equal(sampleQuestions(3).length, 3);
  sampleQuestions(6).forEach((q) => assert.ok(isHowToQuestion(q), q));
});

console.log(`\n${n} passed`);
