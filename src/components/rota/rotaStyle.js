// Colours for the reception rota: one colour for each kind of shift, and a steady colour for each person, so the rota reads at a glance. Pure, no screens.
const GROUP_COLOURS = {
  early: "#f59e0b", // amber
  mid: "#14b8a6", // teal
  late: "#8b5cf6", // violet
  admin1: "#3b82f6", // blue
  admin2: "#64748b", // slate
  admin3: "#94a3b8", // light slate
  desk: "#0ea5e9", // sky
  tyelan: "#10b981", // green
};
const SPARE = ["#ec4899", "#f97316", "#84cc16", "#06b6d4", "#a855f7", "#eab308"];

export const groupColour = (group, order = 0) => GROUP_COLOURS[group] || SPARE[Math.abs(order) % SPARE.length];

// A steady hue for a person, from their id, so the same person is always the same colour
export function personColour(uid) {
  let h = 2166136261;
  for (const ch of String(uid || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return `hsl(${(h >>> 0) % 360} 58% 44%)`;
}

export const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";

// a colour at a given strength on whatever is behind it, so it works on the light and the dark theme
export const tint = (colour, percent) => `color-mix(in srgb, ${colour} ${percent}%, transparent)`;
