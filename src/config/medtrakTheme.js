export const medtrakTheme = {
  app: {
    background: "bg-slate-950 text-slate-100",
    backgroundGlow: "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950",
    page: "space-y-5 text-slate-100",
  },
  surface: {
    base: "rounded-2xl border border-slate-800 bg-slate-900/80 text-slate-100 shadow-xl shadow-black/20",
    subtle: "rounded-2xl border border-slate-800 bg-slate-950/70 text-slate-100",
    elevated: "rounded-3xl border border-slate-800 bg-slate-900/90 text-slate-100 shadow-2xl shadow-black/30",
  },
  text: {
    heading: "text-slate-50",
    body: "text-slate-200",
    muted: "text-slate-400",
    faint: "text-slate-500",
    inverse: "text-slate-950",
  },
  border: {
    default: "border-slate-800",
    soft: "border-slate-800/70",
    focus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
  },
  button: {
    primary: "rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30 hover:from-teal-400 hover:to-emerald-300",
    ghost: "rounded-full text-slate-200 hover:bg-slate-800/80 hover:text-white",
    outline: "rounded-full border border-slate-700 bg-slate-950/40 text-slate-200 hover:bg-slate-800 hover:text-white",
    danger: "rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
  },
  input: {
    base: "rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/20",
  },
  status: {
    success: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    danger: "bg-rose-500/15 text-rose-200 border-rose-500/30",
    info: "bg-cyan-500/15 text-cyan-200 border-cyan-500/30",
    neutral: "bg-slate-800/70 text-slate-200 border-slate-700",
  },
};

export function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}
