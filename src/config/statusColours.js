export const statusColours = {
  active: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200",
  approved: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200",
  completed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200",
  success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200",
  pending: "border-amber-500/30 bg-amber-500/15 text-amber-200",
  draft: "border-slate-700 bg-slate-800/70 text-slate-200",
  warning: "border-amber-500/30 bg-amber-500/15 text-amber-200",
  rejected: "border-rose-500/30 bg-rose-500/15 text-rose-200",
  overdue: "border-rose-500/30 bg-rose-500/15 text-rose-200",
  critical: "border-rose-500/30 bg-rose-500/15 text-rose-200",
  info: "border-cyan-500/30 bg-cyan-500/15 text-cyan-200",
  inactive: "border-slate-700 bg-slate-800/60 text-slate-400",
  neutral: "border-slate-700 bg-slate-800/70 text-slate-200",
};

export function getStatusColour(status) {
  return statusColours[String(status || "neutral").toLowerCase()] || statusColours.neutral;
}
