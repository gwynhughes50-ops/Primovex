import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, LifeBuoy, ChevronRight, BookOpen, Tag } from "lucide-react";

const cardBase =
  "rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 shadow-sm backdrop-blur";

const HELP_ARTICLES = [
  {
    id: "use-stock-scan",
    title: "Use Stock (Barcode Scan)",
    category: "Use Stock",
    keywords: ["use", "issue", "stock", "barcode", "scan", "deduct", "reduce"],
    steps: [
      "Go to Dashboard and click USE STOCK.",
      "Scan the barcode (most scanners auto-press Enter).",
      "Enter quantity used.",
      "Press Confirm use.",
      "Check Recent stock activity to confirm it logged.",
    ],
    notes: [
      "If scanning fails, use Manual override to search and select the item.",
      "If you get an error, check you’re signed in and the item exists.",
    ],
  },
  {
    id: "use-stock-manual",
    title: "Use Stock (Manual Override)",
    category: "Use Stock",
    keywords: ["manual", "override", "search", "no barcode", "can't scan"],
    steps: [
      "Dashboard → USE STOCK.",
      "Switch to Manual override.",
      "Search by name, barcode, site, location, or category.",
      "Select the correct item from the list.",
      "Enter quantity used → Confirm use.",
    ],
    notes: [
      "Manual override is for when barcodes are damaged or missing.",
      "Always double-check site/location before confirming.",
    ],
  },
  {
    id: "receive-stock",
    title: "Receive Stock",
    category: "Inventory",
    keywords: ["receive", "add", "delivery", "increase", "stock in"],
    steps: [
      "Go to Inventory.",
      "Find the item (search by name/barcode/location).",
      "Choose Receive.",
      "Enter the quantity received and confirm.",
    ],
  },
  {
    id: "low-stock",
    title: "Low Stock: What it means and what to do",
    category: "Inventory",
    keywords: ["low", "minimum", "min", "threshold", "reorder"],
    steps: [
      "Low stock means current stock is at or below the minimum level.",
      "Go to Inventory and filter/search for the item.",
      "Confirm the location and current stock.",
      "Order/replenish as per your local process.",
    ],
  },
  {
    id: "temperature-log",
    title: "Record a Temperature",
    category: "Temperature",
    keywords: ["temperature", "log", "fridge", "freezer", "record", "range"],
    steps: [
      "Go to Temperature.",
      "Select the unit (fridge/freezer).",
      "Enter the measured temperature.",
      "Save the record.",
    ],
    notes: [
      "If a reading is out of range, follow your local SOP and record an incident if required.",
    ],
  },
  {
    id: "temperature-incidents",
    title: "Temperature Incidents: Create and Resolve",
    category: "Temperature",
    keywords: ["incident", "out of range", "resolve", "investigation"],
    steps: [
      "Go to Temperature → Incidents tab.",
      "Create an incident if a reading is out of range or stock safety is at risk.",
      "Add details: unit, site, what happened, actions taken.",
      "Resolve when complete (practice-wide resolution is allowed for signed-in users).",
    ],
  },
  {
    id: "alerts",
    title: "Alerts: What they are",
    category: "Alerts",
    keywords: ["alerts", "notifications", "warning", "issue"],
    steps: [
      "Alerts are generated to highlight potential risks (like low stock or temperature issues).",
      "Open Alerts to review and act on them.",
      "Use Inventory/Temperature to fix the underlying issue.",
    ],
  },
  {
    id: "reports",
    title: "Reports: Filters and exporting",
    category: "Reports",
    keywords: ["reports", "filter", "export", "download", "csv"],
    steps: [
      "Go to Reports.",
      "Use the dropdown filters (site/category/location).",
      "Review results and export if available in your build.",
    ],
  },
  {
    id: "admin",
    title: "Admin: Users and access",
    category: "Admin",
    keywords: ["admin", "users", "roles", "access", "permissions"],
    steps: [
      "Go to Admin (admins only).",
      "Manage users and roles according to practice policy.",
      "Only existing admins can promote/admin-enable other users.",
    ],
  },
  {
    id: "se-report",
    title: "Significant events: report one",
    category: "Significant events",
    keywords: ["significant", "event", "incident", "near miss", "report", "se", "learning", "harm", "mistake"],
    steps: [
      "Anyone can report one. On a computer: Significant events in the left menu → Report. On the phone: Home → Significant events → Report.",
      "Or tell the Orb: “Report a significant event: …” and say what happened. It sets the report up and asks how much harm was caused (tap green, yellow, orange or red). Nothing is sent until you press Report event.",
      "Give a short title, the date, the room (pick it from the list), the kind of event and how much harm: green = no harm (a near miss), yellow = low, orange = moderate, red = severe.",
      "Say what happened and what was done straight away.",
      "Press Report event. The significant events team is told.",
    ],
    notes: [
      "Never use anyone's name. Use roles (the nurse, a receptionist).",
      "If a patient was involved, give their EMIS number only (or initials and date of birth if there isn't one). Never a name, and never type a patient's name into the Orb.",
      "You can follow the events you reported under “Reported by me” and add notes to them.",
    ],
  },
  {
    id: "se-who-sees",
    title: "Significant events: who can see what",
    category: "Significant events",
    keywords: ["significant", "event", "who", "see", "access", "permission", "privacy", "partners", "reviewers"],
    steps: [
      "You can open the events you reported, the ones you lead, the ones you are named on and the ones you have been asked to review.",
      "The significant events team (a permission, held by the Practice Manager by default) sees and runs every event. Partners can see them all but not change them.",
      "A reviewer sees only their own review, not other reviewers'.",
      "Notes and the history of an event can't be edited or deleted.",
    ],
    notes: ["To give someone the significant events team permission, add “Significant events team” to their role (Admin → Roles & Permissions)."],
  },
  {
    id: "se-investigate",
    title: "Significant events: triage and investigate (team)",
    category: "Significant events",
    keywords: ["significant", "event", "triage", "investigate", "investigation", "lead", "findings", "team"],
    steps: [
      "Open the event from Significant events. New ones are marked Reported.",
      "Press Investigate, or No investigation needed (you will be asked why).",
      "Choose who leads the investigation. They are told, and can record the findings: what happened, why, what contributed and the evidence.",
      "When the investigation is done, the lead presses Finish investigation and the event moves to In review.",
      "Name any staff who were involved. They can then follow the event and add notes.",
    ],
  },
  {
    id: "se-review",
    title: "Significant events: ask for and write reviews",
    category: "Significant events",
    keywords: ["significant", "event", "review", "reviewer", "reviewers", "roles", "settings"],
    steps: [
      "On an event that is In review, press Ask for reviews. People in your practice's usual reviewer roles are ticked for you; add or remove anyone for this event.",
      "Each reviewer is told, opens the event and writes their own review: what they think happened and why, what to learn and what they would recommend.",
      "You can see who has replied (for example “2 of 3 in”). Reviewers only ever see their own review; the team sees them all.",
      "To change the usual reviewer roles: Significant events → Settings → tick the roles → Save.",
    ],
    notes: ["Different practices do this differently, so nothing forces every reviewer to reply: press Ready for the meeting when you are ready."],
  },
  {
    id: "se-meeting",
    title: "Significant events: run a meeting and record the minutes",
    category: "Significant events",
    keywords: ["significant", "event", "meeting", "minutes", "attendees", "agenda", "discussion", "held"],
    steps: [
      "Significant events → Meetings → New meeting. Choose the date, the chair and who is expected.",
      "Put events on the agenda (from the meeting, or from the event: Add to a planned meeting). One meeting can cover several events.",
      "At the meeting, write the discussion for each event and the general minutes. Record who was present and any apologies.",
      "Add actions for each event: what, who and by when. The person is told.",
      "Press The meeting has been held. Events that were waiting move to Actions open.",
      "Use Copy minutes or Print to share them.",
    ],
    notes: ["Only the team can edit minutes. People who attended can read them."],
  },
  {
    id: "se-actions",
    title: "Significant events: actions and closing an event",
    category: "Significant events",
    keywords: ["significant", "event", "action", "actions", "overdue", "close", "closed", "reopen"],
    steps: [
      "Actions are on the event, in the meeting and under Significant events → Actions. Filter by Open, Mine, Done or All.",
      "If an action is yours, tick it when it's done. The team can tick any.",
      "When no actions are open, press Close on the event. You can't close an event with open actions; if there was no meeting, use Close without a meeting and say why.",
      "A closed event can be reopened if something comes up.",
    ],
  },
  {
    id: "se-orb",
    title: "Significant events: ask the Orb",
    category: "Significant events",
    keywords: ["significant", "event", "orb", "ask", "how many", "reviews", "overdue", "meeting", "status"],
    steps: [
      "“How many significant events are open?” gives the numbers (the whole practice for the team, your own events for everyone else).",
      "“Do I have any significant event reviews to do?” and “What significant event actions do I have?” are about you.",
      "“Which significant event actions are overdue?” and “When is the next significant event meeting?” work for the team and for people who attend.",
      "“What is the status of SE-2026-…?” gives the stage, who leads it and what is still open.",
      "“Report a significant event: …” helps you report one (see the first guide).",
    ],
    notes: ["The Orb only tells you about events you are allowed to open, and never sends them to the language assistant."],
  },
];

const CATEGORIES = ["All", ...Array.from(new Set(HELP_ARTICLES.map((a) => a.category)))];

function scoreMatch(article, q) {
  if (!q) return 0;
  const query = q.toLowerCase().trim();
  if (!query) return 0;

  const hayTitle = article.title.toLowerCase();
  const hayCat = article.category.toLowerCase();
  const hayKw = (article.keywords || []).join(" ").toLowerCase();
  const haySteps = (article.steps || []).join(" ").toLowerCase();

  let score = 0;
  if (hayTitle.includes(query)) score += 8;
  if (hayCat.includes(query)) score += 3;
  if (hayKw.includes(query)) score += 5;
  if (haySteps.includes(query)) score += 2;

  // partial token matching
  const tokens = query.split(/\s+/).filter(Boolean);
  tokens.forEach((t) => {
    if (hayTitle.includes(t)) score += 2;
    if (hayKw.includes(t)) score += 1;
  });

  return score;
}

export default function Help() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All");
  const [openId, setOpenId] = useState(null);

  const results = useMemo(() => {
    const base =
      category === "All" ? HELP_ARTICLES : HELP_ARTICLES.filter((a) => a.category === category);

    const ranked = base
      .map((a) => ({ a, score: scoreMatch(a, q) }))
      .filter(({ score }) => (q.trim() ? score > 0 : true))
      .sort((x, y) => (y.score ?? 0) - (x.score ?? 0))
      .map(({ a }) => a);

    return ranked;
  }, [q, category]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xl font-semibold text-slate-50 flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-emerald-200" />
            Help
          </div>
          <div className="text-sm text-slate-400">
            Search guides for common tasks across the app.
          </div>
        </div>
      </div>

      <Card className={`${cardBase} p-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search help… (e.g. use stock, temperature incident, receive stock)"
              className="pl-9 bg-slate-950/40 border-slate-800/70 text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((c) => {
              const active = c === category;
              return (
                <Button
                  key={c}
                  type="button"
                  variant="ghost"
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-3 text-xs ${
                    active
                      ? "bg-slate-100 text-slate-950 hover:bg-white"
                      : "text-slate-200 hover:bg-slate-800/60 hover:text-slate-50"
                  }`}
                >
                  <Tag className="h-3.5 w-3.5 mr-2" />
                  {c}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          {results.length} article{results.length === 1 ? "" : "s"} found
          {category !== "All" ? ` in ${category}` : ""}.
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className={`${cardBase} p-4`}>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Articles
          </div>

          <div className="mt-3 space-y-2">
            {results.length === 0 ? (
              <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-3 text-sm text-slate-300">
                No matches. Try different keywords like{" "}
                <span className="text-slate-200">barcode</span>,{" "}
                <span className="text-slate-200">manual override</span>,{" "}
                <span className="text-slate-200">receive</span>,{" "}
                <span className="text-slate-200">incident</span>.
              </div>
            ) : (
              results.map((a) => {
                const active = a.id === openId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setOpenId(a.id)}
                    className={`w-full text-left rounded-xl border px-3 py-3 transition ${
                      active
                        ? "border-emerald-400/25 bg-emerald-500/10"
                        : "border-slate-800/70 bg-slate-950/30 hover:bg-slate-900/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-50 truncate">
                          {a.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          Category: {a.category}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-500 mt-0.5" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <Card className={`${cardBase} p-4`}>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            <BookOpen className="h-4 w-4" />
            Article
          </div>

          <div className="mt-3">
            {!openId ? (
              <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-3 text-sm text-slate-300">
                Select an article to view steps.
              </div>
            ) : (
              (() => {
                const a = HELP_ARTICLES.find((x) => x.id === openId);
                if (!a) return null;

                return (
                  <div className="space-y-4">
                    <div>
                      <div className="text-lg font-semibold text-slate-50">
                        {a.title}
                      </div>
                      <div className="text-sm text-slate-400">
                        Category: {a.category}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Steps
                      </div>
                      <ol className="mt-2 space-y-2 text-sm text-slate-200 list-decimal list-inside">
                        {(a.steps || []).map((s, i) => (
                          <li key={i} className="leading-relaxed">
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {Array.isArray(a.notes) && a.notes.length > 0 && (
                      <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-amber-100/90">
                          Notes
                        </div>
                        <ul className="mt-2 space-y-1 text-sm text-amber-50/90 list-disc list-inside">
                          {a.notes.map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
