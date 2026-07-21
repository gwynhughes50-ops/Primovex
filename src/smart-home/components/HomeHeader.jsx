import React from "react";
export default function HomeHeader({ eyebrow = "Primovex Home", title, actions }) {
  return <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--medtrak-accent)]">{eyebrow}</p><h1 className="mt-1 text-2xl font-semibold text-[color:var(--medtrak-text)]">{title}</h1></div>{actions}</div>;
}
