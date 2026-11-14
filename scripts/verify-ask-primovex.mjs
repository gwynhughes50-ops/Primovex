// Covers Ask Primovex's new introduction: the examples it offers (each really understood, each only to someone who can use it), the once-only page tips,
// the single click on the ball, and the new name wherever a person reads it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeApprovedTool } from "@/ai/tools/intentRouter";
import { ASSISTANT_NAME, ASSISTANT_PROMISE, GROUPS, PAGE_TIPS, STARTERS, sendsAtOnce, startersFor, tipFor } from "@/ai/starters";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const canOf = (...caps) => (cap) => caps.includes(cap);

t("every example is understood: each one goes to the tool it says, through the real router", () => {
  for (const s of STARTERS) {
    const routed = routeApprovedTool(s.text, { conversation: [] });
    assert.equal(routed?.toolId ?? null, s.tool, `"${s.text}" went to ${routed?.toolId ?? "nothing"}, expected ${s.tool}`);
  }
  assert.ok(STARTERS.length >= 15);
});

t("the examples that are sent at once only look things up or open a page; the ones that set something up are put in the box to change", () => {
  for (const s of STARTERS) {
    if (sendsAtOnce(s)) assert.ok(!/draft$/i.test(s.tool), `${s.text} would set something up`);
    else assert.ok(/draft$/i.test(s.tool), `${s.text} is put in the box but is not a draft`);
  }
  assert.deepEqual(GROUPS.map((g) => g.key), ["ask", "do", "go"]);
});

t("each person is only offered what their role can use, up to three in a group, and a group with nothing to offer is left out", () => {
  const nobody = startersFor({ can: () => false });
  assert.deepEqual(nobody.map((g) => g.key), ["ask", "do"], "no Go examples without a page they can open");
  assert.ok(nobody.every((g) => g.items.every((s) => !s.needs)));
  assert.ok(nobody.find((g) => g.key === "do").items.every((s) => ["reminder.draft", "person.messageDraft", "my.timesheetDraft", "my.mileageDraft"].includes(s.tool)), "only what anyone can do: a reminder, a message, their own timesheet and mileage");
  const stock = startersFor({ can: canOf("inventory.read", "inventory.write", "temperature.read") });
  assert.ok(stock.every((g) => g.items.length <= 3));
  assert.ok(stock.find((g) => g.key === "do").items.some((s) => s.tool === "stock.inDraft"));
  assert.ok(stock.find((g) => g.key === "ask").items.some((s) => s.text === "Which stock is low?"));
  const everything = startersFor({ can: () => true });
  assert.equal(everything.length, 3);
  assert.ok(startersFor({ can: () => true, max: 2 }).every((g) => g.items.length <= 2));
});

t("Who's in today? is offered to people who can see the sign-in records, and Show my shifts only to people on the reception rota", () => {
  const asks = (opts) => startersFor({ max: 9, ...opts }).find((g) => g.key === "ask").items.map((x) => x.text);
  assert.ok(!asks({ can: () => false }).includes("Who's in today?"));
  assert.ok(asks({ can: canOf("audit.read") }).includes("Who's in today?"));
  assert.ok(!asks({ can: canOf("audit.read") }).includes("Show my shifts"));
  assert.ok(!asks({ can: () => false, onRota: false }).includes("Show my shifts"));
  assert.ok(asks({ can: () => false, onRota: true }).includes("Show my shifts"));
  assert.ok(!asks({ can: () => false, onRota: true }).includes("Who's in today?"), "being on the rota does not show who has signed in");
  assert.match(read("src/ai/components/AskPrimovexPanel.jsx"), /onRota=\{onRota\}/);
});

t("someone on the reception rota is shown the rota examples first: shifts, counts, who is on, and a swap", () => {
  const groups = startersFor({ can: () => false, onRota: true });
  const ask = groups.find((g) => g.key === "ask").items.map((x) => x.tool);
  assert.deepEqual(ask, ["rota.myShifts", "rota.myCounts", "rota.whoIsOn"]);
  assert.deepEqual(groups.find((g) => g.key === "do").items.map((x) => x.tool).slice(0, 1), ["rota.swapDraft"]);
  const nobody = startersFor({ can: () => false, onRota: false, max: 20 }).flatMap((g) => g.items.map((x) => x.tool));
  assert.ok(!nobody.some((tool) => tool.startsWith("rota.")), "no rota examples for someone who is not on it");
});

t("someone who works the SARs and concerns is shown those first", () => {
  const sar = startersFor({ can: canOf("governance.read", "governance.manageSars", "inventory.read") });
  assert.equal(sar.find((g) => g.key === "ask").items[0].tool, "governance.sarOverview");
  const other = startersFor({ can: canOf("governance.read", "inventory.read") });
  assert.notEqual(other.find((g) => g.key === "ask").items[0].tool, "governance.sarOverview");
});

t("page tips: four pages, each with a read-only example that is understood, shown only to someone who can use it", () => {
  assert.deepEqual(PAGE_TIPS.map((x) => x.id), ["inventory", "temperature", "sars", "compliance"]);
  for (const tip of PAGE_TIPS) {
    assert.equal(routeApprovedTool(tip.example, { conversation: [] })?.toolId, tip.tool);
    assert.ok(!/draft$/i.test(tip.tool), "a tip never sets anything up");
  }
  assert.equal(tipFor("/inventory", canOf("inventory.read")).id, "inventory");
  assert.equal(tipFor("/inventory", () => false), null);
  assert.equal(tipFor("/governance/sars", canOf("governance.read")).id, "sars");
  assert.equal(tipFor("/dashboard", () => true), null);
  assert.equal(tipFor("/inventory/item/5", canOf("inventory.read")).id, "inventory");
});

t("it says what it is for, in one sentence, with the three things it does", () => {
  assert.match(ASSISTANT_PROMISE, /own words/);
  assert.match(ASSISTANT_PROMISE, /answer/);
  assert.match(ASSISTANT_PROMISE, /confirm/);
  assert.match(ASSISTANT_PROMISE, /take you there/);
  assert.equal(ASSISTANT_NAME, "Ask Primovex");
});

t("the panel opens on the welcome (and again from What can I do?), and no longer shows the one fixed list", () => {
  const panel = read("src/ai/components/AskPrimovexPanel.jsx");
  assert.match(panel, /<AssistantWelcome/);
  assert.match(panel, /messages\.length === 0 \|\| helpOpen/);
  assert.match(panel, /aria-label="What can I do\?"/);
  assert.doesNotMatch(panel, /SUGGESTIONS/);
  assert.doesNotMatch(panel, /Evidence-aware answers/);
  assert.match(panel, /<h2 className="font-bold">\{ASSISTANT_NAME\}<\/h2>/);
  const welcome = read("src/ai/components/AssistantWelcome.jsx");
  assert.match(welcome, /onFill\(starter\.text\)/, "a Do example goes into the box");
  assert.match(welcome, /onAsk\(starter\.text\)/);
});

t("the ball: one click opens Ask Primovex, it says what it is, and a double click no longer opens a second thing", () => {
  const ball = read("src/components/pulse/PulseWidget.jsx");
  assert.match(ball, /if \(wasClick\) \{[\s\S]*primovexAI\.open\(\);/);
  assert.match(ball, /Click to ask Primovex/);
  assert.match(ball, />\s*Ask Primovex\s*<\/button>/, "a visible label on the ball");
  assert.doesNotMatch(ball, /Double-click to open/);
  assert.doesNotMatch(ball, /onOrbDoubleClick = \(event\) => \{\s*event\.preventDefault\(\);\s*if/);
});

t("a person never reads the old name where they use it: the panel, the ball, the phone, the help page and its articles", () => {
  const visible = (file) => read(file).split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && !/(asks|keywords|related|id):/.test(line) && !/import |console\.|orbStatus|useOrbStatus|OrbStatus|PulseOrb|sleepOrb|wakeOrb|orbAwake|orbLabel|NativeOrb|nativeOrb|PrimovexOrbVoice/.test(line));
  for (const file of ["src/ai/components/AskPrimovexPanel.jsx", "src/components/pulse/PulseWidget.jsx", "src/mobile/RoleAdaptiveMobileHome.jsx", "src/pages/Help.jsx"]) {
    const bad = visible(file).filter((line) => /\bOrb\b/.test(line));
    assert.deepEqual(bad.map((l) => l.trim().slice(0, 90)), [], file);
  }
  const articles = visible("src/ai/help/helpArticles.js").filter((line) => /\bOrb\b/.test(line));
  assert.deepEqual(articles.map((l) => l.trim().slice(0, 90)), ['tip: "The phone app listens when you tap it. It doesn\'t wake up to the word \\"Orb\\".",'], "only the word people might say");
  assert.match(read("src/mobile/RoleAdaptiveMobileHome.jsx"), /aria-label="Ask Primovex"/);
});

t("the swap card has something to run: the executor asks the colleague through the server, which checks the swap again", () => {
  const exec = read("src/orb/actionExecutors.js");
  assert.match(exec, /"rota-swap": async \(params\) => \{/);
  assert.match(exec, /askRota\(\{ action: "create_swap", from: params\.from, to: params\.to/);
  assert.match(read("src/ai/rota/rotaAsk.js"), /kind: "rota-swap"/);
  assert.match(read("src/ai/tools/readOnlyTools.js"), /askRota\(\{ action: 'options'/);
});

t("going to another page starts Ask Primovex afresh, and an answer still on its way does not turn up on the new page", () => {
  const ctx = read("src/ai/context/PrimovexAIContext.jsx");
  assert.match(ctx, /if \(lastPath\.current === pathname\) return;[\s\S]*generation\.current \+= 1;[\s\S]*setMessages\(\[\]\);[\s\S]*setStatus\(AI_STATES\.IDLE\);/);
  const ask = ctx.slice(ctx.indexOf("const ask = useCallback"), ctx.indexOf("}, [capabilities, messages, orb"));
  assert.match(ask, /const startedOn = generation\.current;/);
  assert.equal((ask.match(/if \(generation\.current !== startedOn\) return;/g) || []).length, 4, "checked after each wait: the staff names, the answer, the pause, and the failure");
  const panel = read("src/ai/components/AskPrimovexPanel.jsx");
  assert.match(panel, /if \(lastPage\.current === pathname\) return;[\s\S]*setPrompt\(''\);[\s\S]*setHelpOpen\(false\);[\s\S]*setReport\(null\);/);
});

t("Ask Primovex has its own colours, worked out from the theme: a palette for dark themes, one for light, and one for High Contrast, used for the whole panel", () => {
  const panel = read("src/ai/components/AskPrimovexPanel.jsx");
  for (const name of ["--ai-surface", "--ai-raised", "--ai-card", "--ai-line", "--ai-line-strong", "--ai-ink", "--ai-ink-soft", "--ai-accent", "--ai-glow", "--ai-rim"]) assert.ok(panel.includes(`${name}:`), `${name} is defined`);
  assert.match(panel, /html\.medtrak-light \.primovex-ai-panel \{/);
  assert.match(panel, /html\[data-medtrak-theme="high-contrast"\] \.primovex-ai-panel \{/);
  assert.match(panel, /\.primovex-ai-panel::before \{[^}]*background: var\(--ai-rim\)/);
  // the panel's parts take their colours from the palette, not straight from the page's
  const rules = panel.slice(panel.indexOf(".primovex-ai-divider {"), panel.indexOf(".primovex-pulse-voice-orb {"));
  assert.ok(!/var\(--medtrak-(panel|border|bg)\)/.test(rules), "no page surface or border colour in the panel's rules");
  assert.ok(!/var\(--medtrak-(panel|border)\)\]/.test(panel.slice(0, panel.indexOf("<style>"))), "nor in its markup");
  // the text colours stay the theme's own, so readability follows the theme
  assert.match(panel, /--ai-ink: var\(--medtrak-text\);/);
});

t("the tips are in the desktop layout and are remembered per person and page", () => {
  assert.match(read("src/layout/Layout.jsx"), /<RouteAskTip \/><Outlet \/>/);
  const tip = read("src/components/ai/RouteAskTip.jsx");
  assert.match(tip, /primovex-asktip:\$\{uid \|\| "anon"\}:\$\{id\}/);
  assert.match(tip, /assistant\.open\(\); assistant\.ask\(tip\.example\)/);
});

console.log(`\n${n} passed`);
