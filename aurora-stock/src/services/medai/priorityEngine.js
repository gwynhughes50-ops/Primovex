export const MEDAI_PRIORITIES = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
};

export function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(Number(score || 0))));
}

export function classifyScore(score) {
  const s = clampScore(score);
  if (s >= 90) return MEDAI_PRIORITIES.critical;
  if (s >= 75) return MEDAI_PRIORITIES.high;
  if (s >= 50) return MEDAI_PRIORITIES.medium;
  if (s >= 25) return MEDAI_PRIORITIES.low;
  return MEDAI_PRIORITIES.info;
}

export function priorityLabel(priority) {
  const labels = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
  };
  return labels[priority] || "Info";
}

export function priorityTone(priority) {
  const tones = {
    critical: {
      badge: "border-rose-400/40 bg-rose-500/10 text-rose-100",
      card: "border-rose-400/25 bg-rose-500/10 text-rose-50",
      dot: "bg-rose-400",
    },
    high: {
      badge: "border-orange-400/40 bg-orange-500/10 text-orange-100",
      card: "border-orange-400/25 bg-orange-500/10 text-orange-50",
      dot: "bg-orange-400",
    },
    medium: {
      badge: "border-amber-400/40 bg-amber-500/10 text-amber-100",
      card: "border-amber-400/25 bg-amber-500/10 text-amber-50",
      dot: "bg-amber-300",
    },
    low: {
      badge: "border-sky-400/40 bg-sky-500/10 text-sky-100",
      card: "border-sky-400/25 bg-sky-500/10 text-sky-50",
      dot: "bg-sky-300",
    },
    info: {
      badge: "border-slate-500/40 bg-slate-500/10 text-slate-100",
      card: "border-slate-700 bg-slate-900/70 text-slate-100",
      dot: "bg-slate-400",
    },
  };
  return tones[priority] || tones.info;
}

export function buildPriorityItem({ id, domain, title, summary, action, score, estimate = "1 min", sourceUrl, reasons = [] }) {
  const safeScore = clampScore(score);
  const priority = classifyScore(safeScore);
  return {
    id: id || `${domain || "medai"}-${title || "item"}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    domain: domain || "operations",
    title: title || "Operational item",
    summary: summary || "Review this item.",
    action: action || "Review",
    score: safeScore,
    priority,
    estimate,
    sourceUrl,
    reasons: reasons.filter(Boolean),
  };
}

export function sortByPriority(items = []) {
  return [...items].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}
