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
