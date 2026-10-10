// "What needs attention before I leave?" -> one short briefing built from the headline of each lookup the
// person is allowed to use. Pure: the tool runs the lookups and hands in their answers.

export const BRIEFING_SECTIONS = [
  { id: "alerts.summary", label: "Alerts", lines: 1 },
  { id: "inventory.expiring", label: "Expiry", lines: 1 },
  { id: "inventory.lowStock", label: "Low stock", lines: 1 },
  { id: "coldChain.latestStatus", label: "Fridges", lines: 1 },
  { id: "coldChain.checksToday", label: "Fridge checks", lines: 2 },
  { id: "facilities.cleaningStatus", label: "Cleaning", lines: 2 },
  { id: "compliance.lastCheck", label: "Fire alarm test", input: { kind: "fire_alarm" }, lines: 2 },
  { id: "tasks.quickNotes", label: "Your notes", lines: 1 },
  { id: "governance.sarOverview", label: "SARs", lines: 2 },
  { id: "governance.concernsOverview", label: "Concerns", lines: 2 },
  { id: "governance.seLookup", label: "Significant events", input: { question: "how many significant events are open" }, lines: 1 },
];

export const BRIEFING_TRIGGER = /\b(?:briefing|brief me|before i (?:leave|go home|head off|finish|lock up)|end of (?:the )?day|start of (?:the )?day|handover|hand over|wrap(?:ping)? up|anything i need to know|what(?:'s| is) outstanding|round up|daily (?:summary|round-?up))\b/i;

export function looksLikeBriefing(text) {
  const t = String(text || "").toLowerCase().replace(/[’‘]/g, "'");
  return BRIEFING_TRIGGER.test(t) && !/\b(?:how do i|how to|where is|where are)\b/.test(t);
}

// The first line or two of an answer, tidied.
export function headlineOf(text, lines = 1) {
  const rows = String(text || "").split("\n").map((row) => row.trim()).filter(Boolean).filter((row) => !/^(?:•|-|…)/.test(row));
  return rows.slice(0, lines).join(" ").replace(/\s+/g, " ").slice(0, 220);
}

const FINE = /\b(?:no active alerts|nothing (?:has expired|expires|needs|in stock|is)|no (?:open|outstanding)|none (?:are )?overdue|every room|all \d+|all .* (?:in range|ok|fine)|up to date|no items|is up to date|0 )/i;
const WORRY = /\b(?:overdue|expired|low\b|out of stock|haven't been|has not been|not been cleaned|outside|failed|not yet acknowledged|not checked|incidents? open|out of range|alert|unavailable|needs? (?:attention|checking))/i;

export function needsAttention(text) {
  const t = String(text || "");
  if (!t) return false;
  if (/\b[1-9]\d* (?:are |is )?overdue\b|\boverdue by\b|so it is overdue|already expired|have already expired|out of stock|running low|outside the safe range|out of range/i.test(t)) return true;
  if (FINE.test(t)) return false;
  return WORRY.test(t);
}

// sections: [{ label, text }] in order. Returns { text, attention: n }
export function composeBriefing(sections = [], { when = "now" } = {}) {
  const rows = sections.filter((s) => s && s.text);
  if (!rows.length) return { text: "I couldn't read anything for a briefing just now. Try again in a moment.", attention: 0 };
  const flagged = rows.filter((row) => row.attention);
  const lines = [
    flagged.length
      ? `${flagged.length === 1 ? "One thing needs" : `${flagged.length} things need`} your attention ${when === "morning" ? "today" : "before you go"}:`
      : "Nothing needs your attention right now.",
    ...flagged.map((row) => `• ${row.label}: ${row.text}`),
  ];
  const fine = rows.filter((row) => !row.attention);
  if (fine.length) lines.push("", "All fine:", ...fine.map((row) => `• ${row.label}: ${row.text}`));
  return { text: lines.join("\n"), attention: flagged.length };
}
