// Covers the page guide: what Ask Primovex says about each page, the examples it offers for the page you are on, and "explain this page".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeApprovedTool } from "@/ai/tools/intentRouter";
import { PAGE_GUIDE, explainPage, guideFor, helpButton, looksLikeExplainPage, pageStarters } from "@/ai/pageGuide";
import { HELP_ARTICLES } from "@/ai/help/helpArticles";
import { CAPABILITY_CATALOG } from "@/core/identity/capabilities";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const canOf = (...caps) => (cap) => caps.includes(cap);
const toolOf = (text) => routeApprovedTool(text, { conversation: [] })?.toolId ?? null;

t("every page in the guide is a real page, with something to say about it", () => {
  const desktop = read("src/apps/DesktopApp.jsx");
  for (const page of PAGE_GUIDE) {
    assert.ok(desktop.includes(`path="${page.path.slice(1)}"`), `${page.path} is a route`);
    assert.ok(page.title && page.about.length > 20 && page.can.length >= 1, page.path);
  }
  assert.equal(new Set(PAGE_GUIDE.map((p) => p.path)).size, PAGE_GUIDE.length);
});

t("every example is understood: the ones sent at once look things up, the ones put in the box only prepare something, and each needs a real permission", () => {
  const known = new Set(CAPABILITY_CATALOG.map((c) => c.id));
  for (const page of PAGE_GUIDE) {
    for (const a of page.asks || []) {
      const tool = toolOf(a.text);
      assert.ok(tool && tool !== "inventory.search" && !/draft$/i.test(tool) && tool !== "page.explain", `${page.path}: "${a.text}" went to ${tool}`);
      if (a.needs) assert.ok(known.has(a.needs), `${a.needs} is a permission`);
    }
    for (const a of page.tries || []) {
      assert.match(toolOf(a.text) || "", /draft$/i, `${page.path}: "${a.text}" should only prepare something`);
      if (a.needs) assert.ok(known.has(a.needs), `${a.needs} is a permission`);
    }
  }
});

t("every help button is a real article whose own question reaches the help answer", () => {
  for (const page of PAGE_GUIDE) {
    for (const id of page.help || []) {
      assert.ok(HELP_ARTICLES.find((a) => a.id === id), `${page.path}: ${id} is a help article`);
      const button = helpButton(id);
      assert.ok(button, `${id} has a way of asking that reaches it`);
      assert.equal(toolOf(button.ask), "help.howTo", `${id}: "${button.ask}"`);
    }
  }
});

t("the guide finds a page by its address, including a page below it, and nothing for an unknown one", () => {
  assert.equal(guideFor("/inventory").title, "Inventory");
  assert.equal(guideFor("/inventory/item/5").title, "Inventory");
  assert.equal(guideFor("/governance/sars?year=2026").title, "SARs");
  assert.equal(guideFor("/governance/sars/").title, "SARs");
  assert.equal(guideFor("/nowhere"), null);
  assert.equal(guideFor(""), null);
});

t("what is offered on a page is only what this person can use, a couple at a time", () => {
  assert.deepEqual(pageStarters("/inventory", { can: () => false }).asks, []);
  assert.deepEqual(pageStarters("/inventory", { can: canOf("inventory.read") }).asks.map((a) => a.text), ["Which stock is low?", "What expires this month?"]);
  assert.equal(pageStarters("/inventory", { can: canOf("inventory.read"), max: 1 }).asks.length, 1);
  assert.deepEqual(pageStarters("/inventory", { can: canOf("inventory.write") }).tries.map((a) => a.text), ["I used one pack of gauze"]);
  assert.equal(pageStarters("/nowhere"), null);
  assert.deepEqual(pageStarters("/dashboard").asks.map((a) => a.text), ["What needs attention today?", "Brief me"], "no permission needed");
});

t("explain this page: what it is for, what you can do, and buttons for examples and how-to's", () => {
  const helpTitleOf = helpButton;
  const out = explainPage("/governance/sars", { can: canOf("governance.read"), helpTitleOf });
  assert.equal(out.found, true);
  assert.match(out.text, /^SARs: Subject access requests\./);
  assert.match(out.text, /Here you can:\n• Record a new SAR/);
  assert.ok(out.followUps.some((f) => f.ask === "How many SARs are outstanding?"));
  assert.ok(out.followUps.some((f) => /remind/i.test(f.label)), "a how-to button");
  assert.ok(out.followUps.length <= 6);
  assert.ok(!explainPage("/governance/sars", { can: () => false, helpTitleOf }).followUps.some((f) => f.ask === "How many SARs are outstanding?"), "an example they can't use is not offered");
  const nothing = explainPage("/nowhere");
  assert.equal(nothing.found, false);
  assert.match(nothing.text, /don't have a guide for this page yet/);
});

t("the ways of asking to have a page explained are recognised, and other questions are not", () => {
  for (const q of ["Explain this page", "explain this screen", "What is this page?", "what is this page for", "What does this page do?", "what can I do here", "What can I do on this page?", "How does this page work?", "Where am I?", "describe this page", "please explain this page"]) {
    assert.equal(looksLikeExplainPage(q), true, q);
    assert.equal(toolOf(q), "page.explain", q);
  }
  for (const q of ["what is a SAR", "how do I add stock", "what can you do", "explain the fire alarm test", "which stock is low", ""]) assert.equal(looksLikeExplainPage(q), false, q);
});

t("it is wired in: the page reaches the engine, the tool reads no data, and the welcome shows On this page", () => {
  const ctx = read("src/ai/context/PrimovexAIContext.jsx");
  assert.match(ctx, /const \{ pathname \} = useLocation\(\);/);
  assert.match(ctx, /page: pathname,/);
  assert.match(read("src/orb/ContextEngine.js"), /page: raw\.page \|\| null,/);
  const tools = read("src/ai/tools/readOnlyTools.js");
  const tool = tools.slice(tools.indexOf("id: 'page.explain'"), tools.indexOf("// The reception team and the rota, from the weeks"));
  assert.match(tool, /explainPage\(context\.page/);
  assert.ok(!/readRows|getDocs|httpsCallable/.test(tool), "no data is read");
  assert.match(read("src/ai/components/AssistantWelcome.jsx"), /On this page/);
  assert.match(read("src/ai/components/AskPrimovexPanel.jsx"), /pathname=\{pathname\}/);
});

console.log(`\n${n} passed`);
