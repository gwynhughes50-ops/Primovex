// What Ask Primovex says about itself, and the examples it offers each person. Staff were not clear what it was for, so it now says so in one
// sentence and offers three kinds of thing to try: Ask (find something out), Do (tell it, and it sets it up for you to confirm) and Go (jump to a page).
// Every example here is a phrase the assistant really understands (scripts/verify-ask-primovex.mjs sends each one through the real router),
// and each is offered only to someone whose role can use it.

export const ASSISTANT_NAME = "Ask Primovex";
export const ASSISTANT_TAGLINE = "Ask it, tell it, or go anywhere";
export const ASSISTANT_PROMISE = "Tell me what you need, in your own words. I'll answer, set it up for you to confirm, or take you there.";

export const GROUPS = [
  { key: "ask", title: "Ask", blurb: "Find something out", how: "tap to ask" },
  { key: "do", title: "Do", blurb: "Tell me and I'll set it up. Nothing happens until you confirm", how: "tap to try it" },
  { key: "go", title: "Go", blurb: "Jump straight to a page", how: "tap to go" },
];

// group: ask / do / go.  needs: a capability the person must have (none = everyone).  onRota: only for someone on the reception rota.  tool: what the assistant routes it to (checked by the test).
// "do" examples are put in the box for the person to change and send; "ask" and "go" are sent at once (they only look things up or open a page).
export const STARTERS = [
  { group: "ask", text: "What needs attention today?", tool: "operations.summary" },
  { group: "ask", text: "Brief me", tool: "briefing.daily" },
  { group: "ask", text: "Who's in today?", needs: "audit.read", tool: "security.whoIsIn" },
  { group: "ask", text: "Show my shifts", onRota: true, tool: "rota.myShifts" },
  { group: "ask", text: "Which stock is low?", needs: "inventory.read", tool: "inventory.lowStock" },
  { group: "ask", text: "What expires this month?", needs: "inventory.read", tool: "inventory.expiring" },
  { group: "ask", text: "Are all fridges OK today?", needs: "temperature.read", tool: "coldChain.latestStatus" },
  { group: "ask", text: "How many SARs are outstanding?", needs: "governance.read", tool: "governance.sarOverview" },
  { group: "ask", text: "Where are we up to with concerns?", needs: "governance.read", tool: "governance.concernsOverview" },
  { group: "ask", text: "When did we last test the fire alarm?", needs: "compliance.read", tool: "compliance.lastCheck" },
  { group: "ask", text: "How do I sign off timesheets?", tool: "help.howTo" },
  { group: "do", text: "I have received 20 chlorphenamine ampoules", needs: "inventory.write", tool: "stock.inDraft" },
  { group: "do", text: "I used one pack of gauze", needs: "inventory.write", tool: "stock.useDraft" },
  { group: "do", text: "Count the gloves, I have 12", needs: "inventory.write", tool: "stock.countDraft" },
  { group: "do", text: "Remind me on Monday to ring the pharmacy", tool: "reminder.draft" },
  { group: "do", text: "Tell Sam the fridge needs checking", tool: "person.messageDraft" },
  { group: "go", text: "Take me to the SARs", needs: "governance.read", tool: "app.navigate" },
  { group: "go", text: "Take me to concerns", needs: "governance.read", tool: "app.navigate" },
  { group: "go", text: "Take me to temperature", needs: "temperature.read", tool: "app.navigate" },
  { group: "go", text: "Take me to the inventory", needs: "inventory.read", tool: "app.navigate" },
  { group: "go", text: "Take me to compliance", needs: "compliance.read", tool: "app.navigate" },
];

// What to show this person: up to `max` in each group, only what they may use, in the order above (so the most useful come first).
export function startersFor({ can = () => false, onRota = false, max = 3 } = {}) {
  // someone who works the SARs and concerns is shown those first; everyone else gets the order above
  const governance = can("governance.manageSars");
  const rank = (s) => (governance && s.needs === "governance.read" ? 0 : 1);
  return GROUPS.map((group) => ({
    ...group,
    items: STARTERS.map((s, i) => ({ s, i })).filter(({ s }) => s.group === group.key && (!s.needs || can(s.needs)) && (!s.onRota || onRota))
      .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(({ s }) => s).slice(0, max),
  })).filter((group) => group.items.length > 0);
}

// "do" examples go into the box to be changed; the others are sent straight away
export const sendsAtOnce = (starter) => starter.group !== "do";

// The once-only hint at the top of a page (see components/ai/RouteAskTip.jsx): the page it belongs to and an example that is read-only,
// so trying it never changes anything. Only for someone whose role can use the example.
export const PAGE_TIPS = [
  { id: "inventory", path: "/inventory", example: "Which stock is low?", needs: "inventory.read", tool: "inventory.lowStock" },
  { id: "temperature", path: "/temperature", example: "Are all fridges OK today?", needs: "temperature.read", tool: "coldChain.latestStatus" },
  { id: "sars", path: "/governance/sars", example: "How many SARs are outstanding?", needs: "governance.read", tool: "governance.sarOverview" },
  { id: "compliance", path: "/compliance", example: "When did we last test the fire alarm?", needs: "compliance.read", tool: "compliance.lastCheck" },
];
export function tipFor(pathname, can = () => false) {
  const tip = PAGE_TIPS.find((t) => pathname === t.path || pathname.startsWith(`${t.path}/`));
  return tip && (!tip.needs || can(tip.needs)) ? tip : null;
}
