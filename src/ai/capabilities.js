// "What can you do for me?" for Ask Primovex: what it can do, in plain words, for the person asking. Written down here, not worked out by AI, so it is always right and
// always about this person: an area is shown only when their role can use it. Every example is a phrase the assistant really understands (scripts/verify-orb-capabilities.mjs
// sends each one through the real router and checks it reaches the tool named here).
//
// Pure (no React, no Firestore).

import { guideFor } from "./pageGuide.js";

export const ASSISTANT = "Ask Primovex";

// needs: capabilities, any one of which is enough (none = everybody).  note: a short reminder shown after the line when it only applies to some people.
// examples: { text, tool } the first is what a button offers.
export const AREAS = [
  {
    id: "mine", title: "Your own admin", needs: [],
    short: "timesheet, mileage, annual leave and your training",
    line: "see whether your timesheet has gone, send it, claim mileage for a journey, check your annual leave and what training is due",
    keywords: ["timesheet", "timesheets", "mileage", "leave", "holiday", "training", "expenses", "my admin"],
    examples: [{ text: "Have I sent my timesheet?", tool: "my.timesheet" }, { text: "What training is due for me?", tool: "my.training" }, { text: "How much annual leave do I have?", tool: "my.leave" }],
  },
  {
    id: "rota", title: "Your shifts", needs: [], note: "if you are on the reception rota",
    short: "your shifts, who is on, and swaps",
    line: "see your shifts and how many lates you have, who is on, and get a swap with a colleague ready to send",
    keywords: ["rota", "shift", "shifts", "swap", "lates", "who is on"],
    examples: [{ text: "Show my shifts", tool: "rota.myShifts" }, { text: "Who's on tomorrow?", tool: "rota.whoIsOn" }, { text: "Swap my Friday shift", tool: "rota.swapDraft" }],
  },
  {
    id: "stock", title: "Stock", needs: ["inventory.read"],
    short: "find items, what is low, what is running out of date",
    line: "find an item, see what is low or running out of date, and where things are kept",
    keywords: ["stock", "inventory", "supplies", "expiry", "expiring", "low"],
    examples: [{ text: "Which stock is low?", tool: "inventory.lowStock" }, { text: "What expires this month?", tool: "inventory.expiring" }, { text: "Where are the blue needles?", tool: "inventory.locate" }],
  },
  {
    id: "stockwrite", title: "Recording stock", needs: ["inventory.write"],
    short: "record stock used or received, count, reorder",
    line: "record stock you have used or received, count a place, and ask for a reorder (you confirm each one first)",
    keywords: ["record stock", "stock in", "received", "count", "reorder", "used"],
    examples: [{ text: "I used one pack of gauze", tool: "stock.useDraft" }, { text: "Count the gloves, I have 12", tool: "stock.countDraft" }],
  },
  {
    id: "fridges", title: "Fridges", needs: ["temperature.read"],
    short: "are they in range, which are unchecked",
    line: "see whether the fridges are in range today and which have not been checked",
    keywords: ["fridge", "fridges", "temperature", "temperatures", "cold chain", "freezer"],
    examples: [{ text: "Are all fridges OK today?", tool: "coldChain.latestStatus" }, { text: "Which fridges have not been checked today?", tool: "coldChain.checksToday" }],
  },
  {
    id: "compliance", title: "Safety checks", needs: ["compliance.read", "coshh.read"],
    short: "what is due, PAT, certificates, COSHH",
    line: "when a check was last done, what is due, open incidents, PAT testing, certificates running out and COSHH reviews",
    keywords: ["compliance", "fire", "pat", "coshh", "certificate", "certificates", "legionella", "water", "checks", "incidents"],
    examples: [{ text: "What is due in compliance?", tool: "compliance.dueNow" }, { text: "Which certificates are running out?", tool: "compliance.certificates" }, { text: "When did we last test the fire alarm?", tool: "compliance.lastCheck" }],
  },
  {
    id: "governance", title: "SARs and concerns", needs: ["governance.read"],
    short: "SARs and concerns, and what to do next",
    line: "how many SARs are outstanding, where concerns are up to, which is the most urgent, and what to do next on one",
    keywords: ["sar", "sars", "concern", "concerns", "complaint", "complaints", "governance", "significant event"],
    examples: [{ text: "How many SARs are outstanding?", tool: "governance.sarOverview" }, { text: "Which concern is the most urgent?", tool: "governance.nextSteps" }, { text: "Where are we up to with concerns?", tool: "governance.concernsOverview" }],
  },
  {
    id: "team", title: "Your team", needs: ["timesheets.manage"], note: "and anyone who manages people sees what is waiting for them",
    short: "what to sign off or approve, whose training is out of date",
    line: "see what is waiting for you to sign off, get a card ready to sign off timesheets or approve mileage, and see whose training is out of date",
    keywords: ["team", "sign off", "approve", "staff", "who is in", "managing"],
    examples: [{ text: "What is waiting for me to sign off?", tool: "signoff.waiting" }, { text: "Sign off the timesheets", tool: "signoff.draft" }, { text: "Which staff have overdue training?", tool: "training.overdue" }],
  },
  {
    id: "signins", title: "Who is in", needs: ["audit.read"],
    short: "who has been in today, and last sign-ins",
    line: "see who has been in Primovex today and when someone last signed in",
    keywords: ["sign in", "signed in", "login", "who is in"],
    examples: [{ text: "Who's in today?", tool: "security.whoIsIn" }],
  },
  {
    id: "equipment", title: "Equipment", needs: ["itAssets.read", "waste.read"],
    short: "laptops and clinical waste",
    line: "which laptops need an update or are on loan, and when the clinical waste was last collected",
    keywords: ["laptop", "laptops", "it equipment", "waste", "equipment"],
    examples: [{ text: "Which laptops need an update?", tool: "equipment.laptops" }, { text: "When was the last clinical waste collection?", tool: "waste.status" }],
  },
  {
    id: "do", title: "Getting things done", needs: [],
    short: "reminders, messages, reporting an event, going to a page",
    line: "set a reminder, get a message ready for a colleague, report a significant event, or take you to a page",
    keywords: ["remind", "reminder", "message", "tell", "report", "go to", "open"],
    examples: [{ text: "Remind me on Monday to ring the pharmacy", tool: "reminder.draft" }, { text: "Tell Sam the fridge needs checking", tool: "person.messageDraft" }, { text: "Report a significant event", tool: "se.reportDraft" }],
  },
  {
    id: "help", title: "Help", needs: [],
    short: "step-by-step how-tos, and what this page is for",
    line: "show you step by step how to do something, and explain the page you are on",
    keywords: ["help", "how do i", "explain", "page"],
    examples: [{ text: "How do I add a new product to stock?", tool: "help.howTo" }, { text: "Explain this page", tool: "page.explain" }],
  },
];

const allowed = (area, can) => !area.needs.length || area.needs.some((cap) => can(cap));

// ---- recognising the question ----
// null, or { focus, greeting }. "What can you do?", "how could you help me?", "what are you for?", "I'm new, where do I start?", "give me some ideas", "hello", "help",
// and "what can you do with stock?" (focus "stock"). Questions that name a task ("can you help me find the gloves") are not this.
const clean = (prompt) => String(prompt || "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().replace(/[?.!,]+$/g, "");
const YOU = "(?:you|ask primovex|primovex|the orb|orb|it|this|this thing|this app|this system)";
const JOBWORDS = "(?:job|jobs|role|work|day|days|working day|everyday|day to day|daily|admin|workload)";

function focusIn(t) {
  for (const area of AREAS) if (area.keywords.some((k) => new RegExp(`\\b${k.replace(/\s+/g, "\\s+")}\\b`).test(t))) return area.id;
  return "";
}

// a few words naming an area ("stock", "the rota", "my timesheet"), not a whole task ("the stock levels in the nurses room")
const shortAbout = (about) => about.split(" ").filter(Boolean).length <= 3;

export function parseIntro(prompt) {
  const t = clean(prompt);
  if (!t || t.length > 140) return null;
  if (/\b(?:cn|sar)-\d{4}-\d+\b/.test(t) || /\b\d{5,}\b/.test(t)) return null;

  // a greeting
  if (/^(?:hi|hello|hey|hiya|howdy|yo|morning|afternoon|evening|good\s+(?:morning|afternoon|evening|day))(?:\s+(?:there|again|primovex|ask primovex|orb))?$/.test(t)) return { focus: "", greeting: true };

  // help on its own
  if (/^(?:please\s+)?help(?:\s+me)?(?:\s+please)?$/.test(t)) return { focus: "", greeting: false };
  if (/^i\s+(?:need|want|could\s+do\s+with)\s+(?:some\s+)?(?:help|a\s+hand|assistance)(?:\s+please)?$/.test(t)) return { focus: "", greeting: false };
  if (/^(?:can|could|will|would)\s+(?:you|someone)\s+(?:please\s+)?help(?:\s+me|\s+us)?(?:\s+(?:with\s+)?(?:something|anything|a\s+few\s+things|out))?(?:\s+please)?$/.test(t)) return { focus: "", greeting: false };
  if (/^(?:can|could)\s+i\s+(?:ask|get)\s+(?:you\s+)?(?:some\s+)?(?:help|a\s+hand)(?:\s+please)?$/.test(t)) return { focus: "", greeting: false };

  // how can you help me / be useful / save me time / make my job easier
  const helpWay = new RegExp(`\\bhow\\s+(?:can|could|would|might|do|will|does)\\s+${YOU}\\s+(?:actually\\s+)?(?:help|assist|support|benefit|be\\s+(?:useful|of\\s+use|of\\s+help|helpful)|save|make|improve)(?:\\s+me|\\s+us|\\s+the\\s+practice|\\s+my\\s+team)?(?:\\s+(?:in|with)\\s+(?:my\\s+)?${JOBWORDS})?(?:\\s+(?:time|easier|better))?`);
  if (helpWay.test(t) && !new RegExp(`\\bhelp\\s+(?:me|us)\\s+(?:to\\s+)?(?:find|add|check|order|book|do|get|make|write|fix|see|record|count|open|print|log)\\b`).test(t)) {
    const about = /\b(?:with|about|for|on)\s+(?:the\s+|my\s+|our\s+)?(.+)$/.exec(t)?.[1] || "";
    const focus = about && !new RegExp(`^${JOBWORDS}`).test(about) && shortAbout(about) ? focusIn(about) : "";
    if (about && !focus && !new RegExp(`^(?:me|us|the practice|my team|${JOBWORDS})`).test(about)) return null;
    return { focus, greeting: false };
  }
  // how do I use you / get the best out of you / talk to you
  if (new RegExp(`\\bhow\\s+(?:do|can|should|would)\\s+i\\s+(?:use|work|talk\\s+to|speak\\s+to|get\\s+(?:the\\s+best\\s+)?(?:out\\s+of|started\\s+with)|start\\s+with)\\s+${YOU}$`).test(t)) return { focus: "", greeting: false };

  // what can you do / are you for / know / offer
  const whatDo = new RegExp(`^(?:so\\s+|ok\\s+|okay\\s+|right\\s+)?(?:what|and\\s+what)\\s+(?:else\\s+)?(?:can|could|do|does|will|would|are)\\s+${YOU}\\s+(?:actually\\s+|really\\s+)?(?:do|help|know|offer|support|give|for|good\\s+(?:for|at)|able\\s+to\\s+do|capable\\s+of|used\\s+for|there\\s+for|going\\s+to\\s+do)(?:\\s+(?:me|us))?(?:\\s+for\\s+(?:me|us|the practice))?(?:\\s+with)?(?:\\s+(?:with|about|for|on|in)\\s+(?:the\\s+|my\\s+|our\\s+)?(.+))?$`);
  const m = whatDo.exec(t);
  if (m) {
    const about = m[1] || "";
    if (!about) return { focus: "", greeting: false };
    const focus = shortAbout(about) ? focusIn(about) : "";
    if (focus) return { focus, greeting: false };
    if (new RegExp(`^(?:${JOBWORDS}|the practice|practice)`).test(about)) return { focus: "", greeting: false };
    return null;
  }
  if (/^(?:what|who)\s+(?:are|is)\s+(?:you|ask primovex|primovex|the orb|orb|this)(?:\s+(?:exactly|actually|then))?$/.test(t)) return { focus: "", greeting: false };
  if (/^(?:what|who)\s+(?:are|is)\s+(?:you|this)\s+(?:for|about)$/.test(t)) return { focus: "", greeting: false };
  if (/^(?:what'?s|what\s+is)\s+(?:the\s+point\s+of|your\s+(?:job|purpose|role)|the\s+use\s+of)(?:\s+(?:you|this|ask primovex|the orb|orb))?$/.test(t)) return { focus: "", greeting: false };
  if (/^why\s+(?:would|should|do)\s+i\s+(?:use|need|want|bother\s+with)\s+(?:you|this|ask primovex|the orb|orb|it)$/.test(t)) return { focus: "", greeting: false };
  if (/^(?:tell|show|explain)\s+(?:me\s+)?(?:what\s+you\s+(?:can\s+do|do|are\s+for|know)|about\s+(?:yourself|what\s+you\s+do)|more\s+about\s+(?:yourself|what\s+you\s+do))(?:\s+for\s+(?:me|us))?$/.test(t)) return { focus: "", greeting: false };
  if (/^(?:what\s+(?:can|could|should|shall|might)\s+i\s+(?:ask|say|type|try)(?:\s+(?:you|for))?|what\s+questions\s+(?:can|could)\s+i\s+ask(?:\s+you)?|what\s+(?:do|can)\s+i\s+say|what\s+should\s+i\s+(?:ask|say|do\s+with\s+you))$/.test(t)) return { focus: "", greeting: false };
  if (/^(?:what\s+can\s+i\s+do\s+with\s+(?:you|this|ask primovex|the orb|orb)|what\s+is\s+this\s+(?:for|thing|app|assistant)|what\s+does\s+this\s+(?:do|thing\s+do|app\s+do))$/.test(t)) return { focus: "", greeting: false };
  if (/^(?:give|show)\s+me\s+(?:some\s+|a\s+few\s+)?(?:ideas|examples|suggestions)(?:\s+(?:of\s+what\s+to\s+ask|of\s+what\s+i\s+can\s+ask|for\s+what\s+to\s+ask))?$/.test(t)) return { focus: "", greeting: false };
  if (/^(?:where|how)\s+(?:do|can|should)\s+i\s+(?:start|begin|get\s+started)$/.test(t) || /^(?:i'?m|i\s+am)\s+(?:new|new\s+here|not\s+sure\s+what\s+to\s+(?:ask|do))(?:[,.]?\s*(?:what\s+(?:do|can|should)\s+i\s+(?:do|ask|say)|where\s+do\s+i\s+start|help))?$/.test(t)) return { focus: "", greeting: false };
  // "I'm the practice manager, how can you save me time?" and the like: a role, then the question
  if (/^(?:i'?m|i\s+am|as)\s+(?:the\s+|a\s+|an\s+|our\s+)?[a-z ]{3,40}?[,;]?\s+(?:so\s+)?(?:how|what)\s+(?:can|could|would|do)\s+(?:you|ask primovex|primovex|the orb|orb|this)\s+(?:help|do|save|make|be\s+useful)\b/.test(t)) return { focus: "", greeting: false };
  return null;
}

// ---- the answer ----
const pickExamples = (areas, per = 1) => areas.flatMap((a) => a.examples.slice(0, per));

// { text, followUps: [{ label, ask, color }], areas: [ids] }
export function describeAbilities({ can = () => false, focus = "", greeting = false, page = "" } = {}) {
  const mine = AREAS.filter((a) => allowed(a, can));
  const focused = focus ? AREAS.find((a) => a.id === focus) : null;
  const lines = [];
  let shown = mine;
  const hello = greeting ? `Hello! I'm ${ASSISTANT}. ` : `I'm ${ASSISTANT}. `;

  if (focused && allowed(focused, can)) {
    shown = [focused];
    lines.push(`${hello}Here is what I can do for ${focused.title.toLowerCase()}:`, "", `• ${focused.line.charAt(0).toUpperCase()}${focused.line.slice(1)}${focused.note ? ` (${focused.note})` : ""}.`);
    lines.push("", "You can ask in your own words. For example:", ...focused.examples.map((e) => `• “${e.text}”`));
  } else {
    lines.push(`${hello}Say it in your own words and I'll look it up, get it ready for you to confirm, or take you to the right page.`);
    if (focused) lines.push("", `${focused.title} is not something your role can use here, but this is what I can do for you:`);
    else lines.push("", "Here is what I can do for you:");
    lines.push("");
    for (const a of mine) lines.push(`• ${a.title}: ${a.short}${a.note ? ` (${a.note})` : ""}`);
    lines.push("", "Ask “what can you do with stock?” (or the rota, fridges, concerns, your timesheet…) for more on any one.");
  }
  lines.push("", "Nothing changes until you press the button on the card I prepare. Please never type a patient's name: use their EMIS number, date of birth and initials.");

  // buttons: the page's own help first, then one example from each area, those that look something up before those that set something up
  const followUps = [];
  const pageHasGuide = Boolean(page && guideFor(page));
  if (pageHasGuide) followUps.push({ label: "Explain this page", ask: "Explain this page", color: "#8b5cf6" });
  const examples = focused && allowed(focused, can) ? focused.examples : pickExamples(shown);
  // only the ones that look something up or explain: pressing a button sends it, and an example that sets something up (a reminder, a message) must not be sent as it stands
  for (const e of examples) {
    if (followUps.length >= 4) break;
    if (/draft$/i.test(e.tool) || (e.tool === "page.explain" && pageHasGuide)) continue;
    followUps.push({ label: e.text, ask: e.text, color: "#0ea5e9" });
  }
  return { text: lines.join("\n"), followUps, areas: shown.map((a) => a.id) };
}
