import { Barcode, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemePickerButton } from "@/components/theme/MedTrakThemeProvider";

// The top of the Dashboard: the date, a greeting, one line saying how things stand, and the two things everyone does from here.
const TONE = { clear: "#10b981", some: "#d97706", urgent: "#e11d48", wait: "#64748b" };

export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardHeader({ name, summary, tone = "wait", onCustomise, onUseStock, now = new Date() }) {
  const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--medtrak-accent)]">{date}</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[color:var(--medtrak-text)]">{greeting(now)}{name ? `, ${name}` : ""}</h1>
        <p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-[color:var(--medtrak-muted)]">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TONE[tone] || TONE.wait, boxShadow: `0 0 0 4px color-mix(in srgb, ${TONE[tone] || TONE.wait} 22%, transparent)` }} aria-hidden="true" />
          <span>{summary}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ThemePickerButton />
        <Button variant="outline" className="rounded-xl" onClick={onCustomise}><Settings2 className="mr-2 h-4 w-4" />Customise</Button>
        <Button className="rounded-xl bg-[color:var(--medtrak-accent)] text-white" onClick={onUseStock}><Barcode className="mr-2 h-4 w-4" />Use stock</Button>
      </div>
    </header>
  );
}
