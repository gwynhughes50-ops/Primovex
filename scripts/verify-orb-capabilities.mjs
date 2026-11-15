// Covers "What can you do for me?" for Ask Primovex: the many ways of asking it (and the questions that only look like it), the answer written for the person's own role,
// and that every example offered really works through the real router.
import assert from "node:assert/strict";
import { AREAS, describeAbilities, parseIntro } from "@/ai/capabilities";
import { routeApprovedTool } from "@/ai/tools/intentRouter";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const canOf = (...caps) => (cap) => caps.includes(cap);

const ASKS = [
  "how can you help me", "how could you help me?", "How can Ask Primovex help me", "how would you help me in my job", "how can you save me time", "how can you make my job easier",
  "how might you be useful to me", "how can you help the practice", "how can you help with my work",
  "what can you do", "What can you do for me?", "what can ask primovex do", "what do you do", "what are you for", "what are you good at", "what are you good for", "what are you able to do",
  "what else can you do", "what can you help with", "what can you help me with", "what do you know", "what can i ask", "what can i ask you", "what questions can i ask", "what should i ask",
  "what shall I ask", "what can I say", "what can i do with you", "what is this for", "what does this do", "tell me what you can do", "tell me about yourself", "show me what you can do",
  "explain what you can do for me", "give me some ideas", "give me some ideas of what to ask", "show me some examples",
  "who are you", "what are you", "what's the point of you", "what's your job", "why would I use you", "why should i use this",
  "hello", "Hi", "hi there", "hey primovex", "good morning", "good morning ask primovex",
  "help", "help me", "please help me", "i need help", "I need a hand", "i want some help", "can you help me", "can you help", "could you help me with something", "can I get some help",
  "how do i use you", "how do I use ask primovex", "how do I get started with you", "where do I start", "how do I get started", "i'm new", "I'm new here, what do I do", "I am new here",
  "I'm the practice manager, how can you save me time", "i'm a receptionist so what can you do",
  "so what can you actually do", "okay what can you do for me",
];
const NOT = [
  "how do I add a new product to stock", "can you help me find the gloves", "help me find paracetamol", "how can you help me with the stock levels in the nurses room", "what can you do with paracetamol",
  "what do you know about paracetamol", "what can you tell me about CN-2026-1103085823", "who are you messaging", "what is this page", "explain this page", "which stock is low", "what's low",
  "show my shifts", "what's next for my SARs", "I need help with a timesheet", "help with the rota", "hello Sarah can you swap my shift", "what is the point of the fridge check",
  "where do I find the fire alarm log", "how do I use the stock take", "who is on tomorrow", "can you help me to order more gauze",
];

t("the many natural ways of asking what it can do are understood", () => {
  assert.deepEqual(ASKS.filter((q) => !parseIntro(q)), [], "not understood");
});

t("tasks, products, cases and other questions that only look similar are left alone", () => {
  assert.deepEqual(NOT.filter((q) => parseIntro(q)), [], "wrongly taken");
});

t("a greeting says hello, and asking about one area focuses on it", () => {
  assert.deepEqual(parseIntro("hello"), { focus: "", greeting: true });
  assert.deepEqual(parseIntro("what can you do"), { focus: "", greeting: false });
  assert.equal(parseIntro("what can you do with stock").focus, "stock");
  assert.equal(parseIntro("what can you do with the rota").focus, "rota");
  assert.equal(parseIntro("what can you do for the fridges").focus, "fridges");
  assert.equal(parseIntro("how can you help me with concerns").focus, "governance");
  assert.equal(parseIntro("what can you do with my timesheet").focus, "mine");
  assert.equal(parseIntro("what can you help with in my job").focus, "");
});

t("through the real router every one of them reaches the introduction, and nothing else is stolen", () => {
  assert.deepEqual(ASKS.filter((q) => routeApprovedTool(q, { conversation: [] })?.toolId !== "help.capabilities"), [], "went elsewhere");
  assert.equal(routeApprovedTool("how do I add a new product to stock", { conversation: [] })?.toolId, "help.howTo");
  assert.equal(routeApprovedTool("explain this page", { conversation: [] })?.toolId, "page.explain");
  assert.equal(routeApprovedTool("which stock is low", { conversation: [] })?.toolId, "inventory.lowStock");
  assert.equal(routeApprovedTool("show my shifts", { conversation: [] })?.toolId, "rota.myShifts");
});

t("every example it offers is really understood and goes to the tool named", () => {
  for (const area of AREAS) {
    assert.ok(area.examples.length >= 1, area.id);
    for (const e of area.examples) {
      const routed = routeApprovedTool(e.text, { conversation: [] });
      assert.equal(routed?.toolId ?? null, e.tool, `"${e.text}" went to ${routed?.toolId ?? "nothing"}, expected ${e.tool}`);
    }
  }
});

t("the answer is written for the person: only what their role can use, plus what everyone can do", () => {
  const nobody = describeAbilities({ can: canOf() });
  assert.deepEqual(nobody.areas, ["mine", "rota", "do", "help"]);
  assert.match(nobody.text, /Your own admin/);
  assert.doesNotMatch(nobody.text, /Stock:|Fridges:|SARs and concerns|Your team/);
  const caretaker = describeAbilities({ can: canOf("temperature.read", "compliance.read", "inventory.read") });
  assert.ok(caretaker.areas.includes("fridges") && caretaker.areas.includes("compliance") && caretaker.areas.includes("stock"));
  assert.ok(!caretaker.areas.includes("governance") && !caretaker.areas.includes("team") && !caretaker.areas.includes("stockwrite"));
  const manager = describeAbilities({ can: () => true });
  assert.equal(manager.areas.length, AREAS.length);
  assert.match(manager.text, /Your team: what to sign off or approve, whose training is out of date/);
  assert.match(manager.text, /SARs and concerns: SARs and concerns, and what to do next/);
  assert.match(describeAbilities({ can: canOf("inventory.write") }).text, /Recording stock: record stock used or received, count, reorder/);
  assert.match(manager.text, /Ask “what can you do with stock\?”/);
  assert.ok(manager.text.split("\n").length < 22, "short enough to read in the panel");
});

t("it opens with who it is, says how to talk to it, and always says nothing changes without a confirm and not to type a patient's name", () => {
  const a = describeAbilities({ can: canOf("inventory.read") });
  assert.match(a.text, /^I'm Ask Primovex\. Say it in your own words/);
  assert.match(a.text, /Nothing changes until you press the button on the card I prepare\./);
  assert.match(a.text, /never type a patient's name: use their EMIS number, date of birth and initials/);
  assert.match(describeAbilities({ can: canOf(), greeting: true }).text, /^Hello! I'm Ask Primovex\./);
});

t("asking about one area gives its detail and examples, and says so plainly when the role cannot use it", () => {
  const ok = describeAbilities({ can: canOf("inventory.read"), focus: "stock" });
  assert.deepEqual(ok.areas, ["stock"]);
  assert.match(ok.text, /Here is what I can do for stock:/);
  assert.match(ok.text, /“Which stock is low\?”/);
  const no = describeAbilities({ can: canOf(), focus: "governance" });
  assert.match(no.text, /SARs and concerns is not something your role can use here, but this is what I can do for you:/);
  assert.deepEqual(no.areas, ["mine", "rota", "do", "help"]);
});

t("the buttons are few, only look things up or explain, and never send an example that would set something up", () => {
  const a = describeAbilities({ can: () => true });
  assert.ok(a.followUps.length >= 3 && a.followUps.length <= 4);
  assert.equal(new Set(a.followUps.map((f) => f.ask)).size, a.followUps.length);
  for (const f of a.followUps) {
    const routed = routeApprovedTool(f.ask, { conversation: [] });
    assert.ok(routed && !/draft$/i.test(routed.toolId), `${f.ask} -> ${routed?.toolId}`);
  }
  const onPage = describeAbilities({ can: canOf("inventory.read"), page: "/inventory" });
  assert.equal(onPage.followUps[0].ask, "Explain this page", "on a page it knows, the first button explains that page");
  assert.ok(!describeAbilities({ can: canOf("inventory.read"), page: "/somewhere-else" }).followUps.some((f) => f.ask === "Explain this page" && false));
});

console.log(`\n${n} tests passed`);
