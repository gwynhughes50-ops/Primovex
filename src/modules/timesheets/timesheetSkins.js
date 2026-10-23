// The look of the timesheet screens: "desktop" (dark panels) and "phone" (the app's own variables). Shared by every timesheet screen.

export const SKINS = {
  desktop: {
    field: "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60",
    label: "block text-xs font-semibold uppercase tracking-wide text-slate-400",
    card: "rounded-2xl border border-white/10 bg-slate-900/70 p-4", muted: "text-slate-400", strong: "text-slate-100", body: "text-slate-200",
    btn: "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40",
    primary: "inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40",
    big: "flex-1 rounded-2xl border border-white/15 p-4 text-left hover:bg-white/5", bigOn: "flex-1 rounded-2xl border border-teal-300/60 bg-teal-500/10 p-4 text-left",
    warn: "rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100", ok: "rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100", bad: "text-rose-300",
    note: "rounded-lg bg-white/5 p-3 text-sm text-slate-300", line: "border-t border-white/5",
    chip: { submitted: "bg-amber-400/25 text-amber-100", approved: "bg-sky-500/20 text-sky-100", sent: "bg-emerald-500/20 text-emerald-100", declined: "bg-rose-500/20 text-rose-100", returned: "bg-rose-500/20 text-rose-100", draft: "bg-white/10 text-slate-200" },
  },
  phone: {
    field: "mt-1 min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 text-base",
    label: "block text-sm font-bold", card: "rounded-2xl border border-[var(--medtrak-border)] p-3", muted: "text-[var(--medtrak-muted)]", strong: "", body: "",
    btn: "min-h-12 rounded-2xl border border-[var(--medtrak-border)] px-4 font-bold disabled:opacity-40", primary: "min-h-12 rounded-2xl bg-[var(--medtrak-accent)] px-4 font-bold text-white disabled:opacity-40",
    big: "rounded-2xl border border-[var(--medtrak-border)] p-4 text-left", bigOn: "rounded-2xl border-2 border-[var(--medtrak-accent)] bg-black/5 p-4 text-left",
    warn: "rounded-2xl bg-amber-400/20 p-3 text-sm font-semibold text-amber-900", ok: "rounded-2xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-800", bad: "text-rose-700",
    note: "rounded-2xl bg-black/5 p-3 text-sm", line: "border-t border-[var(--medtrak-border)]",
    chip: { submitted: "bg-amber-400/25 text-amber-800", approved: "bg-sky-500/15 text-sky-800", sent: "bg-emerald-500/15 text-emerald-700", declined: "bg-rose-500/15 text-rose-700", returned: "bg-rose-500/15 text-rose-700", draft: "bg-black/5" },
  },
};
