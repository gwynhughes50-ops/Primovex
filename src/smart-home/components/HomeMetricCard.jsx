import React from "react";
import HomeWidget from "./HomeWidget";

export default function HomeMetricCard({ label, value, detail, icon, tone = "default" }) {
  const toneClass = tone === "danger" ? "text-rose-600" : tone === "warning" ? "text-amber-600" : "text-[color:var(--medtrak-text)]";
  return (
    <HomeWidget icon={icon}>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--medtrak-muted)]">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-[color:var(--medtrak-muted)]">{detail}</p>
    </HomeWidget>
  );
}
