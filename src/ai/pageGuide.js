// What Ask Primovex knows about each page, so it can offer a few things to try for the page you are on and explain the page in plain English.
// No AI and no data: this is written down here. Every "asks" example is a phrase the assistant really understands (scripts/verify-ask-primovex.mjs sends each one
// through the real router), every "help" is a real help article, and an example is offered only to someone whose role can use it.

import { HELP_ARTICLES } from "./help/helpArticles.js";
import { findHelp, isHowToQuestion } from "./help/helpSearch.js";

// The button for a help article: its title and a question that really reaches that article (one of its own ways of asking that is a "how do I" question
// and finds it), so pressing the button gives the steps. null when the article does not exist.
export function helpButton(id) {
  const article = HELP_ARTICLES.find((item) => item.id === id);
  if (!article) return null;
  const candidates = [...(article.asks || []), article.title];
  const ask = candidates.find((text) => isHowToQuestion(text) && findHelp(text).match?.id === id) || null;
  return ask ? { title: article.title, ask } : null;
}

// path: the page's address (a page below it, such as /inventory/item/5, counts too).  needs: a capability the person must have to be offered the example.
// asks: sent at once (they only look something up).  tries: put in the box to change and send (they set something up for you to confirm).
// help: help article ids, offered as "how do I...?" buttons.
export const PAGE_GUIDE = [
  {
    path: "/dashboard", title: "Dashboard",
    about: "Your starting point. It shows what is waiting on you, what is coming up, and how each part of the practice is doing.",
    can: ["Work through Needs you: each row has a button that deals with it", "See what is due soon and who is on the reception rota today", "Press Customise to choose what shows and in what order", "Press Use stock to record stock you have used"],
    asks: [{ text: "What needs attention today?" }, { text: "Brief me" }], help: [],
  },
  {
    path: "/inventory", title: "Inventory",
    about: "Every item the practice holds, where it is kept and when it runs out of date.",
    can: ["Search for an item, or scan its barcode", "Use, add, move or count stock", "See what is running low or close to its expiry date"],
    asks: [{ text: "Which stock is low?", needs: "inventory.read" }, { text: "What expires this month?", needs: "inventory.read" }],
    tries: [{ text: "I used one pack of gauze", needs: "inventory.write" }], help: ["add-stock-item", "use-stock", "reorder-stock"],
  },
  {
    path: "/stocktake", title: "Stock take",
    about: "Counting what is on the shelves against what Primovex expects, and putting right any differences.",
    can: ["Count a place and save the counts", "Review the differences before they change the stock"],
    tries: [{ text: "Count the gloves, I have 12", needs: "inventory.write" }], help: ["stock-take"],
  },
  {
    path: "/temperature", title: "Temperature",
    about: "Fridge and freezer readings, and what to do when one goes out of range.",
    can: ["Record a reading", "See today's checks and any open incidents", "Close an incident once the fridge is back in range"],
    asks: [{ text: "Are all fridges OK today?", needs: "temperature.read" }, { text: "Which fridges have not been checked today?", needs: "temperature.read" }], help: ["log-temperature", "fridge-out-of-range"],
  },
  {
    path: "/compliance", title: "Compliance",
    about: "Safety checks and registers: fire, water, emergency equipment, PAT testing, COSHH and certificates.",
    can: ["Record a check, or scan a tag to start one", "See what is due or overdue", "Open the PAT, COSHH and certificate registers"],
    asks: [{ text: "When did we last test the fire alarm?", needs: "compliance.read" }, { text: "What is due in compliance?", needs: "compliance.read" }],
    help: ["fire-alarm-test", "do-pat-test", "coshh-register", "certificates-register"],
  },
  {
    path: "/governance/sars", title: "SARs",
    about: "Subject access requests. Each has a due date, an owner and a checklist, and a patient is identified by EMIS number, date of birth and initials only.",
    can: ["Record a new SAR and assign it", "Open one to see its checklist, its activity and how long is left", "Press the bell to remind the person it is assigned to (the Practice Manager and their line manager)"],
    asks: [{ text: "How many SARs are outstanding?", needs: "governance.read" }], help: ["new-sar", "sar-reminder-bell"],
  },
  {
    path: "/sars-to-chase", title: "SARs to chase",
    about: "The open SARs assigned to the people you manage, most urgent first, with no patient details.",
    can: ["See which are close to their due date or overdue", "Press the bell to remind the person it needs prioritising (one a day for each SAR)"],
    asks: [], help: ["sar-reminder-bell"],
  },
  {
    path: "/governance/concerns", title: "Concerns",
    about: "Complaints and concerns from first contact to closing, with each deadline and step along the way.",
    can: ["Record a new concern", "Update a case and record what has been done", "Close a case once it is finished"],
    asks: [{ text: "Where are we up to with concerns?", needs: "governance.read" }], help: ["new-concern", "update-concern-case", "close-concern-case"],
  },
  {
    path: "/governance/significant-events", title: "Significant events",
    about: "Things that went wrong, or nearly did, and what the practice learned from them.",
    can: ["Report an event", "Follow an event through review and learning actions"],
    asks: [{ text: "How many significant events are open?" }], help: ["report-significant-event", "run-significant-event"],
  },
  {
    path: "/my-timesheet", title: "Timesheet",
    about: "Send your hours for each pay period. If you manage people, you sign off theirs here too.",
    can: ["Send your timesheet to your line manager", "If you manage people, sign off theirs under To sign off"],
    asks: [{ text: "Have I sent my timesheet?" }], tries: [{ text: "Send my timesheet" }], help: ["send-timesheet", "sign-off-timesheets"],
  },
  { path: "/mileage", title: "Mileage", about: "Claim for work journeys, and approve your team's.", can: ["Add a journey from the places and routes saved", "If you manage people, approve their claims under To approve"], asks: [{ text: "How much mileage have I claimed?" }], tries: [{ text: "I drove from Main Surgery to District Hospital and back yesterday" }], help: ["claim-mileage", "approve-mileage"] },
  { path: "/annual-leave", title: "Annual leave", about: "Your leave entitlement, worked out from your contract.", can: ["See how much you have and how much is left"], asks: [{ text: "How much annual leave do I have?" }], help: ["annual-leave-entitlement"] },
  { path: "/my-training", title: "My training", about: "Your own training records and when each is due.", can: ["See what is due or running out"], asks: [{ text: "What training is due for me?" }], help: ["my-training"] },
  { path: "/training", title: "Staff training", about: "The training matrix for the whole practice.", can: ["See who is out of date on what", "Import the matrix"], help: ["staff-training-matrix", "import-training-matrix"] },
  {
    path: "/reception-rota", title: "Reception rota",
    about: "The coordinator's page: the rules for each person, who is off, building the week and publishing it to the team.",
    can: ["Set each person's rules and enter who is off", "Build the week and change any place by hand", "Answer swap and change requests under Requests"], help: ["reception-rota"],
  },
  {
    path: "/my-rota", title: "My rota",
    about: "Your shifts, who is on, and swaps and change requests, from the weeks your coordinator has published.",
    can: ["See your shifts and who is on each day", "Swap a shift with a colleague", "Ask for a change: finish early, start late or a day off"],
    asks: [{ text: "Show my shifts" }, { text: "How many lates do I have?" }], tries: [{ text: "Swap my Friday shift" }], help: ["my-rota"],
  },
  { path: "/notifications", title: "Notifications", about: "Everything sent to you: tasks, reminders and messages.", can: ["Open, complete or snooze each one"], help: ["find-notifications"] },
  { path: "/waste", title: "Clinical waste", about: "Waste notes and the quarterly return.", can: ["Keep a waste note", "Check the quarterly return"], help: ["keep-waste-note", "check-waste-quarterly-return"] },
  { path: "/inspection", title: "Inspection pack", about: "Evidence for an inspection visit, gathered from the rest of Primovex.", can: ["Choose the visit and print the pack"], help: ["inspection-pack"] },
];

export function guideFor(pathname) {
  const path = String(pathname || "").split("?")[0].replace(/\/+$/, "") || "/";
  return PAGE_GUIDE.find((page) => path === page.path || path.startsWith(`${page.path}/`)) || null;
}

const allowed = (item, can) => !item.needs || can(item.needs);

// What to offer on this page: up to `max` examples to send at once, and examples to put in the box, only those this person can use
export function pageStarters(pathname, { can = () => false, max = 2 } = {}) {
  const page = guideFor(pathname);
  if (!page) return null;
  return {
    title: page.title,
    asks: (page.asks || []).filter((a) => allowed(a, can)).slice(0, max),
    tries: (page.tries || []).filter((a) => allowed(a, can)).slice(0, 1),
  };
}

// "Explain this page": what it is for, what you can do here, and what to try. { found, text, followUps }
export function explainPage(pathname, { can = () => false, helpTitleOf = helpButton } = {}) {
  const page = guideFor(pathname);
  if (!page) return { found: false, text: "I don't have a guide for this page yet. You can ask me how to do something (for example “how do I add a new product to stock?”), or open Help from the menu.", followUps: [] };
  const lines = [`${page.title}: ${page.about}`, "", "Here you can:", ...page.can.map((item) => `• ${item}`)];
  const followUps = [];
  for (const a of (page.asks || []).filter((x) => allowed(x, can))) followUps.push({ label: a.text, ask: a.text, color: "#0ea5e9" });
  for (const id of page.help || []) {
    const entry = helpTitleOf(id);
    if (entry) followUps.push({ label: entry.title, ask: entry.ask, color: "#8b5cf6" });
  }
  return { found: true, text: lines.join("\n"), followUps: followUps.slice(0, 6) };
}

// "explain this page", "what can I do here?", "what is this page for?"
export function looksLikeExplainPage(prompt) {
  const text = String(prompt || "").toLowerCase().replace(/[’‘]/g, "'").trim().replace(/[?.!]+$/g, "");
  if (!text) return false;
  return [
    /^(?:please\s+)?(?:explain|describe|summari[sz]e)\s+(?:this|the\s+current|the)\s+(?:page|screen)$/,
    /^(?:what(?:'s| is| does)|tell me about)\s+(?:this|the\s+current)\s+(?:page|screen)(?:\s+(?:for|do|about|show))?$/,
    /^what\s+can\s+i\s+do\s+(?:here|on\s+this\s+(?:page|screen))$/,
    /^how\s+does\s+this\s+(?:page|screen)\s+work$/,
    /^(?:help\s+(?:me\s+)?with\s+this\s+(?:page|screen)|where\s+am\s+i|what\s+am\s+i\s+looking\s+at)$/,
  ].some((pattern) => pattern.test(text));
}
