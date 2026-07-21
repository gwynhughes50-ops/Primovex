import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

const STORAGE_KEY = "primovex-theme";
const LEGACY_STORAGE_KEY = "medtrak-theme";
const DEFAULT_THEME_ID = "nhs-blue";

export const MEDTRAK_THEMES = [
  {
    id: "aurora",
    name: "Primovex Midnight",
    description: "Official Primovex blue, violet and cyan dark theme.",
    light: false,
    bg: "#020617",
    panel: "#0f172a",
    panelSoft: "rgba(15, 23, 42, 0.72)",
    border: "rgba(148, 163, 184, 0.22)",
    text: "#f8fafc",
    muted: "#94a3b8",
    accent: "#2563eb",
    accent2: "#7c3aed",
  },
  {
    id: "nhs-blue",
    name: "NHS Blue",
    description: "Clean clinical blue.",
    light: true,
    bg: "#f8fafc",
    panel: "#ffffff",
    panelSoft: "rgba(255, 255, 255, 0.95)",
    border: "rgba(0, 94, 184, 0.20)",
    text: "#0f172a",
    muted: "#475569",
    accent: "#005eb8",
    accent2: "#41b6e6",
  },
  {
    id: "clinical-green",
    name: "Clinical Green",
    description: "Calm green medical style.",
    light: true,
    bg: "#f9fffb",
    panel: "#ffffff",
    panelSoft: "rgba(255, 255, 255, 0.95)",
    border: "rgba(34, 197, 94, 0.20)",
    text: "#0f172a",
    muted: "#475569",
    accent: "#16a34a",
    accent2: "#86efac",
  },
  {
    id: "midnight-purple",
    name: "Midnight Purple",
    description: "Dark purple night mode.",
    light: false,
    bg: "#10051f",
    panel: "#1e1233",
    panelSoft: "rgba(30, 18, 51, 0.78)",
    border: "rgba(192, 132, 252, 0.24)",
    text: "#f8fafc",
    muted: "#d8b4fe",
    accent: "#a855f7",
    accent2: "#c084fc",
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    description: "Maximum contrast accessibility.",
    light: false,
    bg: "#000000",
    panel: "#111111",
    panelSoft: "rgba(17, 17, 17, 0.92)",
    border: "#ffffff",
    text: "#ffffff",
    muted: "#ffffff",
    accent: "#facc15",
    accent2: "#ffffff",
  },
];

const ThemeContext = createContext(null);

function getTheme(themeId) {
  return MEDTRAK_THEMES.find((theme) => theme.id === themeId) || MEDTRAK_THEMES[0];
}

function injectThemeStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("medtrak-theme-style")) return;

  const style = document.createElement("style");
  style.id = "medtrak-theme-style";
  style.innerHTML = `
    :root {
      --medtrak-bg: #020617;
      --medtrak-panel: #0f172a;
      --medtrak-panel-soft: rgba(15, 23, 42, 0.72);
      --medtrak-border: rgba(148, 163, 184, 0.22);
      --medtrak-text: #f8fafc;
      --medtrak-muted: #94a3b8;
      --medtrak-accent: #2dd4bf;
      --medtrak-accent-2: #34d399;
    }

    html[data-medtrak-theme] body {
      background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--medtrak-accent) 15%, transparent), transparent 30rem),
        var(--medtrak-bg) !important;
      color: var(--medtrak-text) !important;
    }

    html[data-medtrak-theme] .bg-slate-950,
    html[data-medtrak-theme] .bg-slate-950\\/90,
    html[data-medtrak-theme] .bg-slate-950\\/85,
    html[data-medtrak-theme] .bg-slate-950\\/80,
    html[data-medtrak-theme] .bg-slate-950\\/70,
    html[data-medtrak-theme] .bg-slate-950\\/60,
    html[data-medtrak-theme] .bg-slate-950\\/50,
    html[data-medtrak-theme] .bg-slate-950\\/40,
    html[data-medtrak-theme] .bg-slate-950\\/30 {
      background-color: var(--medtrak-bg) !important;
    }

    html[data-medtrak-theme] .bg-slate-900,
    html[data-medtrak-theme] .bg-slate-900\\/95,
    html[data-medtrak-theme] .bg-slate-900\\/90,
    html[data-medtrak-theme] .bg-slate-900\\/80,
    html[data-medtrak-theme] .bg-slate-900\\/70,
    html[data-medtrak-theme] .bg-slate-900\\/60,
    html[data-medtrak-theme] .bg-slate-900\\/50,
    html[data-medtrak-theme] .bg-slate-900\\/40,
    html[data-medtrak-theme] .bg-slate-900\\/30 {
      background-color: var(--medtrak-panel-soft) !important;
    }

    html[data-medtrak-theme] .bg-slate-800,
    html[data-medtrak-theme] .bg-slate-800\\/90,
    html[data-medtrak-theme] .bg-slate-800\\/80,
    html[data-medtrak-theme] .bg-slate-800\\/70,
    html[data-medtrak-theme] .bg-slate-800\\/60,
    html[data-medtrak-theme] .bg-slate-800\\/50,
    html[data-medtrak-theme] .bg-slate-800\\/40 {
      background-color: color-mix(in srgb, var(--medtrak-panel) 82%, var(--medtrak-accent) 10%) !important;
    }

    html[data-medtrak-theme] .border-slate-800,
    html[data-medtrak-theme] .border-slate-800\\/80,
    html[data-medtrak-theme] .border-slate-800\\/70,
    html[data-medtrak-theme] .border-slate-800\\/60,
    html[data-medtrak-theme] .border-slate-700,
    html[data-medtrak-theme] .border-slate-700\\/80,
    html[data-medtrak-theme] .border-slate-700\\/70,
    html[data-medtrak-theme] .border-slate-700\\/60,
    html[data-medtrak-theme] .border-white\\/10 {
      border-color: var(--medtrak-border) !important;
    }

    html[data-medtrak-theme] .text-slate-50,
    html[data-medtrak-theme] .text-slate-100 {
      color: var(--medtrak-text) !important;
    }

    html[data-medtrak-theme] .text-slate-200,
    html[data-medtrak-theme] .text-slate-300,
    html[data-medtrak-theme] .text-slate-300\\/80,
    html[data-medtrak-theme] .text-slate-400 {
      color: var(--medtrak-muted) !important;
    }

    html[data-medtrak-theme] .text-teal-300,
    html[data-medtrak-theme] .text-teal-200,
    html[data-medtrak-theme] .text-emerald-300,
    html[data-medtrak-theme] .text-emerald-200,
    html[data-medtrak-theme] .text-sky-200,
    html[data-medtrak-theme] .text-sky-100\\/90 {
      color: var(--medtrak-accent) !important;
    }

    html[data-medtrak-theme] .from-teal-500,
    html[data-medtrak-theme] .from-emerald-400,
    html[data-medtrak-theme] .from-emerald-500,
    html[data-medtrak-theme] .from-sky-500 {
      --tw-gradient-from: var(--medtrak-accent) var(--tw-gradient-from-position) !important;
      --tw-gradient-to: rgb(255 255 255 / 0) var(--tw-gradient-to-position) !important;
      --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
    }

    html[data-medtrak-theme] .to-emerald-400,
    html[data-medtrak-theme] .to-emerald-300,
    html[data-medtrak-theme] .to-teal-400,
    html[data-medtrak-theme] .to-cyan-500 {
      --tw-gradient-to: var(--medtrak-accent-2) var(--tw-gradient-to-position) !important;
    }

    html[data-medtrak-theme] .bg-teal-500,
    html[data-medtrak-theme] .bg-emerald-400 {
      background-color: var(--medtrak-accent) !important;
    }

    html[data-medtrak-theme] .hover\\:bg-teal-400:hover {
      background-color: var(--medtrak-accent-2) !important;
    }

    html[data-medtrak-theme] input,
    html[data-medtrak-theme] select,
    html[data-medtrak-theme] textarea {
      background-color: color-mix(in srgb, var(--medtrak-bg) 86%, var(--medtrak-panel) 14%) !important;
      color: var(--medtrak-text) !important;
      border-color: var(--medtrak-border) !important;
    }


    html.medtrak-light body {
      background: var(--medtrak-bg) !important;
      color: #0f172a !important;
    }

    html.medtrak-light .bg-slate-950,
    html.medtrak-light .bg-slate-950\/90,
    html.medtrak-light .bg-slate-950\/85,
    html.medtrak-light .bg-slate-950\/80,
    html.medtrak-light .bg-slate-950\/70,
    html.medtrak-light .bg-slate-950\/60,
    html.medtrak-light .bg-slate-950\/50,
    html.medtrak-light .bg-slate-950\/40,
    html.medtrak-light .bg-slate-950\/30 {
      background-color: #f8fafc !important;
    }

    html.medtrak-light .bg-slate-900,
    html.medtrak-light .bg-slate-900\/95,
    html.medtrak-light .bg-slate-900\/90,
    html.medtrak-light .bg-slate-900\/80,
    html.medtrak-light .bg-slate-900\/70,
    html.medtrak-light .bg-slate-900\/60,
    html.medtrak-light .bg-slate-900\/50,
    html.medtrak-light .bg-slate-900\/40,
    html.medtrak-light .bg-slate-900\/30 {
      background-color: #ffffff !important;
    }

    html.medtrak-light .bg-slate-800,
    html.medtrak-light .bg-slate-800\/90,
    html.medtrak-light .bg-slate-800\/80,
    html.medtrak-light .bg-slate-800\/70,
    html.medtrak-light .bg-slate-800\/60,
    html.medtrak-light .bg-slate-800\/50,
    html.medtrak-light .bg-slate-800\/40 {
      background-color: #eef6ff !important;
    }

    html.medtrak-light .border-slate-800,
    html.medtrak-light .border-slate-800\/80,
    html.medtrak-light .border-slate-800\/70,
    html.medtrak-light .border-slate-800\/60,
    html.medtrak-light .border-slate-700,
    html.medtrak-light .border-slate-700\/80,
    html.medtrak-light .border-slate-700\/70,
    html.medtrak-light .border-slate-700\/60,
    html.medtrak-light .border-white\/10 {
      border-color: var(--medtrak-border) !important;
    }

    html.medtrak-light .text-slate-50,
    html.medtrak-light .text-slate-100,
    html.medtrak-light .text-slate-200 {
      color: #0f172a !important;
    }

    html.medtrak-light .text-slate-300,
    html.medtrak-light .text-slate-300\/80,
    html.medtrak-light .text-slate-400,
    html.medtrak-light .text-slate-500 {
      color: #475569 !important;
    }

    html.medtrak-light input,
    html.medtrak-light select,
    html.medtrak-light textarea {
      background-color: #ffffff !important;
      color: #0f172a !important;
      border-color: var(--medtrak-border) !important;
    }

    html.medtrak-light .shadow-emerald-500\/25,
    html.medtrak-light .shadow-emerald-500\/30 {
      --tw-shadow-color: color-mix(in srgb, var(--medtrak-accent) 18%, transparent) !important;
    }

    html.medtrak-light .from-amber-500\/10,
    html.medtrak-light .from-sky-500\/10 {
      --tw-gradient-from: rgba(255, 255, 255, 0.95) var(--tw-gradient-from-position) !important;
    }

    html[data-medtrak-theme="high-contrast"] .text-slate-500 {
      color: #d4d4d4 !important;
    }

    /* Dashboard + alert readable cards for light themes */

html.medtrak-light .medtrak-low-stock-card {
  background: #fffbeb !important;
  border: 1px solid #fcd34d !important;
  color: #78350f !important;
}

html.medtrak-light .medtrak-low-stock-card,
html.medtrak-light .medtrak-low-stock-card p,
html.medtrak-light .medtrak-low-stock-card svg,
html.medtrak-light .medtrak-low-stock-card * {
  color: #78350f !important;
}

html.medtrak-light .medtrak-temperature-card {
  background: #eff6ff !important;
  border: 1px solid #93c5fd !important;
  color: #0c4a6e !important;
}

html.medtrak-light .medtrak-temperature-card,
html.medtrak-light .medtrak-temperature-card p,
html.medtrak-light .medtrak-temperature-card svg,
html.medtrak-light .medtrak-temperature-card * {
  color: #0c4a6e !important;
}

html.medtrak-light .bg-rose-500\/10 {
  background: #fef2f2 !important;
}

html.medtrak-light .text-rose-50,
html.medtrak-light .text-rose-100,
html.medtrak-light .text-rose-200 {
  color: #991b1b !important;
}

html.medtrak-light .bg-amber-500\/10 {
  background: #fffbeb !important;
}

html.medtrak-light .text-amber-50,
html.medtrak-light .text-amber-100,
html.medtrak-light .text-amber-200 {
  color: #92400e !important;
}

html.medtrak-light .bg-emerald-500\/10 {
  background: #ecfdf5 !important;
}

html.medtrak-light .text-emerald-50,
html.medtrak-light .text-emerald-100,
html.medtrak-light .text-emerald-200 {
  color: #166534 !important;
}

/* High contrast theme only */

html[data-medtrak-theme="high-contrast"] .text-slate-500 {
  color: #d4d4d4 !important;
}

html[data-medtrak-theme="high-contrast"] button {
  outline-color: #ffffff;
}
html:not(.medtrak-light) .medtrak-low-stock-card {
  background: linear-gradient(to bottom right, rgba(245, 158, 11, 0.10), rgba(249, 115, 22, 0.05), #0f172a) !important;
  border: 1px solid rgba(251, 191, 36, 0.25) !important;
  color: #fef3c7 !important;
}

html:not(.medtrak-light) .medtrak-low-stock-card * {
  color: #fef3c7 !important;
}

html:not(.medtrak-light) .medtrak-temperature-card {
  background: linear-gradient(to bottom right, rgba(14, 165, 233, 0.10), rgba(6, 182, 212, 0.05), #0f172a) !important;
  border: 1px solid rgba(56, 189, 248, 0.25) !important;
  color: #e0f2fe !important;
}

html:not(.medtrak-light) .medtrak-temperature-card * {
  color: #e0f2fe !important;
}

    /* ------------------------------------------------------------------
       Sprint 21A Theme Hardening
       These token aliases allow new components to avoid brittle Tailwind
       colour classes while we gradually refactor legacy screens.
    ------------------------------------------------------------------ */
    :root {
      --mt-bg: var(--medtrak-bg);
      --mt-card: var(--medtrak-panel-soft);
      --mt-card-strong: var(--medtrak-panel);
      --mt-border: var(--medtrak-border);
      --mt-text-primary: var(--medtrak-text);
      --mt-text-secondary: var(--medtrak-muted);
      --mt-text-muted: color-mix(in srgb, var(--medtrak-muted) 82%, var(--medtrak-bg) 18%);
      --mt-accent: var(--medtrak-accent);
      --mt-accent-2: var(--medtrak-accent-2);
      --mt-on-accent: #020617;
      --mt-danger: #fb7185;
      --mt-warning: #f59e0b;
      --mt-success: #10b981;
      --mt-info: #38bdf8;
    }

    html.medtrak-light {
      --mt-text-primary: #0f172a;
      --mt-text-secondary: #334155;
      --mt-text-muted: #475569;
      --mt-on-accent: #ffffff;
    }

    html[data-medtrak-theme="high-contrast"] {
      --mt-text-primary: #ffffff;
      --mt-text-secondary: #ffffff;
      --mt-text-muted: #ffffff;
      --mt-on-accent: #000000;
    }

    html[data-medtrak-theme] .mt-theme-page {
      background: var(--mt-bg) !important;
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] .mt-card,
    html[data-medtrak-theme] .mt-surface {
      background: var(--mt-card) !important;
      border-color: var(--mt-border) !important;
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] .mt-card-strong {
      background: var(--mt-card-strong) !important;
      border-color: var(--mt-border) !important;
      color: var(--mt-text-primary) !important;
    }

    /* Sprint 38.2: shared themed hero system. */
    html[data-medtrak-theme] .mt-hero {
      position: relative;
      overflow: hidden;
      background:
        radial-gradient(circle at 82% 18%, color-mix(in srgb, var(--mt-accent-2) 30%, transparent), transparent 23rem),
        linear-gradient(135deg, color-mix(in srgb, var(--mt-accent) 82%, #001b35 18%), color-mix(in srgb, var(--mt-accent) 54%, #06182d 46%)) !important;
      border-color: color-mix(in srgb, var(--mt-accent-2) 35%, transparent) !important;
      color: #ffffff !important;
    }

    html[data-medtrak-theme] .mt-hero::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(110deg, rgba(255,255,255,0.08), transparent 42%);
    }

    html[data-medtrak-theme] .mt-hero-badge {
      background: rgba(255,255,255,0.12) !important;
      border-color: rgba(255,255,255,0.24) !important;
      color: #ffffff !important;
      backdrop-filter: blur(10px);
    }

    html[data-medtrak-theme] .mt-hero-aside {
      background: rgba(2, 15, 32, 0.28) !important;
      border-color: rgba(255,255,255,0.20) !important;
      color: #ffffff !important;
      backdrop-filter: blur(14px);
    }

    html[data-medtrak-theme="clinical-green"] .mt-hero {
      background:
        radial-gradient(circle at 82% 18%, rgba(134,239,172,0.28), transparent 23rem),
        linear-gradient(135deg, #08783f, #064e3b) !important;
    }

    html[data-medtrak-theme="midnight-purple"] .mt-hero {
      background:
        radial-gradient(circle at 82% 18%, rgba(216,180,254,0.24), transparent 23rem),
        linear-gradient(135deg, #581c87, #24113f) !important;
    }

    html[data-medtrak-theme="aurora"] .mt-hero {
      background:
        radial-gradient(circle at 82% 18%, rgba(124,58,237,0.28), transparent 23rem),
        linear-gradient(135deg, #123b88, #111827) !important;
    }

    html[data-medtrak-theme="high-contrast"] .mt-hero {
      background: #000000 !important;
      border-color: #ffffff !important;
      border-width: 2px !important;
    }

    html[data-medtrak-theme] .mt-text-primary { color: var(--mt-text-primary) !important; }
    html[data-medtrak-theme] .mt-text-secondary { color: var(--mt-text-secondary) !important; }
    html[data-medtrak-theme] .mt-text-muted { color: var(--mt-text-muted) !important; }
    html[data-medtrak-theme] .mt-accent { color: var(--mt-accent) !important; }

    html[data-medtrak-theme] .mt-button-primary {
      background: linear-gradient(135deg, var(--mt-accent), var(--mt-accent-2)) !important;
      color: var(--mt-on-accent) !important;
      border-color: color-mix(in srgb, var(--mt-accent) 45%, transparent) !important;
    }

    html[data-medtrak-theme] .mt-button-secondary {
      background: color-mix(in srgb, var(--mt-card-strong) 78%, var(--mt-accent) 12%) !important;
      border-color: var(--mt-border) !important;
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] .mt-input,
    html[data-medtrak-theme] input,
    html[data-medtrak-theme] select,
    html[data-medtrak-theme] textarea {
      background: color-mix(in srgb, var(--mt-bg) 74%, var(--mt-card-strong) 26%) !important;
      color: var(--mt-text-primary) !important;
      border-color: var(--mt-border) !important;
    }

    html[data-medtrak-theme] .mt-input::placeholder,
    html[data-medtrak-theme] input::placeholder,
    html[data-medtrak-theme] textarea::placeholder {
      color: var(--mt-text-muted) !important;
      opacity: 1 !important;
    }

    /* Legacy safety net: stop white-on-white and dark-on-dark after theme switches. */
    html.medtrak-light .text-white,
    html.medtrak-light .text-slate-50,
    html.medtrak-light .text-slate-100,
    html.medtrak-light .text-slate-200,
    html.medtrak-light .text-zinc-50,
    html.medtrak-light .text-neutral-50 {
      color: var(--mt-text-primary) !important;
    }

    html.medtrak-light .text-slate-300,
    html.medtrak-light .text-slate-400,
    html.medtrak-light .text-slate-500,
    html.medtrak-light .text-gray-300,
    html.medtrak-light .text-gray-400,
    html.medtrak-light .text-gray-500 {
      color: var(--mt-text-secondary) !important;
    }

    html.medtrak-light .bg-white\/5,
    html.medtrak-light .bg-white\/10,
    html.medtrak-light .bg-black\/20,
    html.medtrak-light .bg-black\/30,
    html.medtrak-light .bg-black\/40 {
      background-color: color-mix(in srgb, var(--mt-card-strong) 92%, var(--mt-accent) 8%) !important;
    }

    html:not(.medtrak-light) .text-slate-900,
    html:not(.medtrak-light) .text-slate-950,
    html:not(.medtrak-light) .text-gray-900,
    html:not(.medtrak-light) .text-black {
      color: var(--mt-text-primary) !important;
    }

    html:not(.medtrak-light) .bg-white,
    html:not(.medtrak-light) .bg-slate-50,
    html:not(.medtrak-light) .bg-gray-50 {
      background-color: var(--mt-card-strong) !important;
      color: var(--mt-text-primary) !important;
      border-color: var(--mt-border) !important;
    }

    html[data-medtrak-theme] table,
    html[data-medtrak-theme] th,
    html[data-medtrak-theme] td {
      color: inherit;
      border-color: var(--mt-border) !important;
    }

    html[data-medtrak-theme] [data-theme-critical-text="true"] {
      color: var(--mt-text-primary) !important;
    }

    /* Sprint 25: typography and control-state hardening. */
    html[data-medtrak-theme],
    html[data-medtrak-theme] body,
    html[data-medtrak-theme] button,
    html[data-medtrak-theme] input,
    html[data-medtrak-theme] select,
    html[data-medtrak-theme] textarea {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }

    html[data-medtrak-theme] body {
      font-weight: 400;
      letter-spacing: -0.005em;
    }

    html[data-medtrak-theme] h1,
    html[data-medtrak-theme] h2,
    html[data-medtrak-theme] h3,
    html[data-medtrak-theme] h4,
    html[data-medtrak-theme] h5,
    html[data-medtrak-theme] h6 {
      color: var(--mt-text-primary);
      text-wrap: balance;
    }

    html[data-medtrak-theme] button {
      font-weight: 650;
    }

    html[data-medtrak-theme] [data-mt-button] {
      border-color: var(--mt-border) !important;
      color: var(--mt-text-primary) !important;
      box-shadow: none;
    }

    html[data-medtrak-theme] [data-mt-button="default"] {
      background: linear-gradient(135deg, var(--mt-accent), var(--mt-accent-2)) !important;
      color: var(--mt-on-accent) !important;
      border-color: color-mix(in srgb, var(--mt-accent) 55%, transparent) !important;
      box-shadow: 0 10px 28px color-mix(in srgb, var(--mt-accent) 20%, transparent) !important;
    }

    html[data-medtrak-theme] [data-mt-button="default"]:hover {
      filter: brightness(1.08) saturate(1.04);
      transform: translateY(-1px);
    }

    html[data-medtrak-theme] [data-mt-button="outline"],
    html[data-medtrak-theme] [data-mt-button="secondary"] {
      background: color-mix(in srgb, var(--mt-card-strong) 86%, var(--mt-accent) 8%) !important;
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] [data-mt-button="outline"]:hover,
    html[data-medtrak-theme] [data-mt-button="secondary"]:hover,
    html[data-medtrak-theme] [data-mt-button="ghost"]:hover {
      background: color-mix(in srgb, var(--mt-card-strong) 72%, var(--mt-accent) 18%) !important;
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] [data-mt-button="ghost"] {
      background: transparent !important;
      color: var(--mt-text-secondary) !important;
      border-color: transparent !important;
    }

    html[data-medtrak-theme] [data-mt-button="link"] {
      background: transparent !important;
      color: var(--mt-accent) !important;
      border-color: transparent !important;
    }

    html[data-medtrak-theme] [data-mt-button="destructive"] {
      background: #e11d48 !important;
      color: #ffffff !important;
      border-color: #be123c !important;
    }

    html[data-medtrak-theme] [data-mt-button]:focus-visible,
    html[data-medtrak-theme] button:focus-visible,
    html[data-medtrak-theme] input:focus-visible,
    html[data-medtrak-theme] select:focus-visible,
    html[data-medtrak-theme] textarea:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--mt-accent) 72%, white 28%) !important;
      outline-offset: 2px !important;
      box-shadow: none !important;
    }

    html[data-medtrak-theme] [data-mt-button]:disabled,
    html[data-medtrak-theme] button:disabled {
      opacity: 0.52 !important;
      cursor: not-allowed !important;
      filter: grayscale(0.18);
      transform: none !important;
    }

    html.medtrak-light .text-white:not([data-preserve-colour]),
    html.medtrak-light .text-black:not([data-preserve-colour]) {
      color: var(--mt-text-primary) !important;
    }

    html.medtrak-light .font-black { font-weight: 800 !important; }
    html.medtrak-light .font-bold { font-weight: 700 !important; }
    html.medtrak-light .font-semibold { font-weight: 600 !important; }

    html[data-medtrak-theme="high-contrast"] [data-mt-button] {
      border-width: 2px !important;
    }

    html[data-medtrak-theme="high-contrast"] [data-mt-button="default"] {
      background: #facc15 !important;
      color: #000000 !important;
      border-color: #ffffff !important;
    }

    /* Sprint 26A: semantic pills, tabs and AI surfaces. */
    html[data-medtrak-theme] .mt-pill {
      background: color-mix(in srgb, var(--mt-card-strong) 84%, var(--mt-accent) 10%) !important;
      border-color: var(--mt-border) !important;
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] .mt-pill-muted {
      background: color-mix(in srgb, var(--mt-card-strong) 92%, var(--mt-accent) 5%) !important;
      border-color: var(--mt-border) !important;
      color: var(--mt-text-secondary) !important;
    }

    html[data-medtrak-theme] .mt-tab {
      background: color-mix(in srgb, var(--mt-card-strong) 90%, var(--mt-accent) 5%) !important;
      border-color: var(--mt-border) !important;
      color: var(--mt-text-secondary) !important;
    }

    html[data-medtrak-theme] .mt-tab:hover {
      background: color-mix(in srgb, var(--mt-card-strong) 76%, var(--mt-accent) 18%) !important;
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] .mt-tab-active {
      background: linear-gradient(135deg, var(--mt-accent), var(--mt-accent-2)) !important;
      border-color: color-mix(in srgb, var(--mt-accent) 65%, transparent) !important;
      color: var(--mt-on-accent) !important;
      box-shadow: 0 8px 22px color-mix(in srgb, var(--mt-accent) 18%, transparent) !important;
    }

    html[data-medtrak-theme] .mt-ai-badge {
      background: color-mix(in srgb, var(--mt-card-strong) 82%, var(--mt-accent-2) 14%) !important;
      border-color: color-mix(in srgb, var(--mt-accent-2) 38%, var(--mt-border)) !important;
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] .mt-ai-surface {
      background: linear-gradient(135deg,
        color-mix(in srgb, var(--mt-card-strong) 88%, var(--mt-accent-2) 12%),
        color-mix(in srgb, var(--mt-card-strong) 94%, var(--mt-accent) 6%)) !important;
      border-color: color-mix(in srgb, var(--mt-accent-2) 30%, var(--mt-border)) !important;
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] .mt-ai-surface .mt-ai-heading,
    html[data-medtrak-theme] .mt-ai-surface .mt-ai-body,
    html[data-medtrak-theme] .mt-ai-surface .mt-ai-focus {
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] .mt-ai-surface .mt-ai-kicker,
    html[data-medtrak-theme] .mt-ai-surface .mt-ai-label {
      color: var(--mt-text-secondary) !important;
    }

    html.medtrak-light .mt-tab-active,
    html.medtrak-light .mt-button-primary,
    html.medtrak-light .mt-brand-gradient {
      color: #ffffff !important;
    }

    html[data-medtrak-theme="high-contrast"] .mt-tab-active,
    html[data-medtrak-theme="high-contrast"] .mt-ai-badge {
      border-width: 2px !important;
    }

    /* Sprint 32.3: semantic badges and light-theme contrast hardening. */
    html[data-medtrak-theme] .mt-role-badge,
    html[data-medtrak-theme] .mt-role-badge-admin,
    html[data-medtrak-theme] .mt-notification-badge,
    html[data-medtrak-theme] .mt-stock-badge {
      border-style: solid !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }

    html[data-medtrak-theme] .mt-role-badge {
      background: color-mix(in srgb, var(--mt-card-strong) 82%, var(--mt-accent) 12%) !important;
      border-color: color-mix(in srgb, var(--mt-accent) 35%, var(--mt-border)) !important;
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] .mt-role-badge-admin {
      background: color-mix(in srgb, var(--mt-card-strong) 78%, var(--mt-accent-2) 18%) !important;
      border-color: color-mix(in srgb, var(--mt-accent-2) 48%, var(--mt-border)) !important;
      color: var(--mt-text-primary) !important;
    }

    html[data-medtrak-theme] .mt-notification-badge {
      background: var(--mt-accent) !important;
      border-color: color-mix(in srgb, var(--mt-accent) 72%, var(--mt-border)) !important;
      color: var(--mt-on-accent) !important;
    }

    html[data-medtrak-theme] .mt-stock-badge-low {
      background: #fee2e2 !important;
      border-color: #f87171 !important;
      color: #991b1b !important;
    }

    html[data-medtrak-theme] .mt-stock-badge-ok {
      background: #dcfce7 !important;
      border-color: #4ade80 !important;
      color: #166534 !important;
    }

    html:not(.medtrak-light) .mt-stock-badge-low {
      background: rgba(244, 63, 94, 0.18) !important;
      border-color: rgba(251, 113, 133, 0.58) !important;
      color: #fecdd3 !important;
    }

    html:not(.medtrak-light) .mt-stock-badge-ok {
      background: rgba(34, 197, 94, 0.16) !important;
      border-color: rgba(74, 222, 128, 0.52) !important;
      color: #bbf7d0 !important;
    }

    html[data-medtrak-theme="high-contrast"] .mt-role-badge,
    html[data-medtrak-theme="high-contrast"] .mt-role-badge-admin,
    html[data-medtrak-theme="high-contrast"] .mt-notification-badge,
    html[data-medtrak-theme="high-contrast"] .mt-stock-badge {
      background: #000000 !important;
      border-color: #ffffff !important;
      color: #ffffff !important;
      border-width: 2px !important;
    }

    /* Sprint 34.4: full light-theme/NHS Blue contrast safety net.
       Legacy screens still use colour-specific Tailwind utilities. These
       mappings keep semantic meaning while preventing pale-on-pale text. */
    html.medtrak-light .text-teal-50,
    html.medtrak-light .text-teal-100,
    html.medtrak-light .text-teal-200,
    html.medtrak-light .text-teal-300,
    html.medtrak-light .text-cyan-50,
    html.medtrak-light .text-cyan-100,
    html.medtrak-light .text-cyan-200,
    html.medtrak-light .text-cyan-300,
    html.medtrak-light .text-sky-50,
    html.medtrak-light .text-sky-100,
    html.medtrak-light .text-sky-200,
    html.medtrak-light .text-blue-100,
    html.medtrak-light .text-blue-200 {
      color: #075985 !important;
    }

    html.medtrak-light .text-emerald-50,
    html.medtrak-light .text-emerald-100,
    html.medtrak-light .text-emerald-200,
    html.medtrak-light .text-emerald-300,
    html.medtrak-light .text-emerald-400,
    html.medtrak-light .text-green-100,
    html.medtrak-light .text-green-200,
    html.medtrak-light .text-green-300 {
      color: #166534 !important;
    }

    html.medtrak-light .text-amber-50,
    html.medtrak-light .text-amber-100,
    html.medtrak-light .text-amber-200,
    html.medtrak-light .text-amber-300,
    html.medtrak-light .text-amber-400,
    html.medtrak-light .text-yellow-100,
    html.medtrak-light .text-yellow-200,
    html.medtrak-light .text-orange-100,
    html.medtrak-light .text-orange-200 {
      color: #92400e !important;
    }

    html.medtrak-light .text-rose-50,
    html.medtrak-light .text-rose-100,
    html.medtrak-light .text-rose-200,
    html.medtrak-light .text-rose-300,
    html.medtrak-light .text-rose-400,
    html.medtrak-light .text-red-100,
    html.medtrak-light .text-red-200,
    html.medtrak-light .text-red-300,
    html.medtrak-light .text-pink-100,
    html.medtrak-light .text-pink-200 {
      color: #991b1b !important;
    }

    html.medtrak-light .bg-teal-400\/10,
    html.medtrak-light .bg-teal-500\/10,
    html.medtrak-light .bg-cyan-400\/10,
    html.medtrak-light .bg-cyan-500\/10,
    html.medtrak-light .bg-sky-400\/10,
    html.medtrak-light .bg-sky-500\/10,
    html.medtrak-light .bg-blue-500\/10 {
      background-color: #eff6ff !important;
      border-color: #93c5fd !important;
    }

    html.medtrak-light .bg-emerald-400\/10,
    html.medtrak-light .bg-emerald-500\/10,
    html.medtrak-light .bg-green-500\/10 {
      background-color: #ecfdf5 !important;
      border-color: #86efac !important;
    }

    html.medtrak-light .bg-amber-400\/10,
    html.medtrak-light .bg-amber-500\/10,
    html.medtrak-light .bg-yellow-500\/10,
    html.medtrak-light .bg-orange-500\/10 {
      background-color: #fffbeb !important;
      border-color: #fcd34d !important;
    }

    html.medtrak-light .bg-rose-400\/10,
    html.medtrak-light .bg-rose-500\/10,
    html.medtrak-light .bg-red-500\/10,
    html.medtrak-light .bg-pink-500\/10 {
      background-color: #fef2f2 !important;
      border-color: #fca5a5 !important;
    }

    /* Solid accent/semantic actions must retain an on-colour foreground. */
    html.medtrak-light .bg-teal-500,
    html.medtrak-light .bg-teal-600,
    html.medtrak-light .bg-cyan-500,
    html.medtrak-light .bg-sky-500,
    html.medtrak-light .bg-blue-500,
    html.medtrak-light .bg-blue-600,
    html.medtrak-light .bg-emerald-500,
    html.medtrak-light .bg-green-600,
    html.medtrak-light .bg-rose-500,
    html.medtrak-light .bg-red-500,
    html.medtrak-light .bg-red-600 {
      color: #ffffff !important;
    }

    html.medtrak-light .bg-teal-500 *,
    html.medtrak-light .bg-teal-600 *,
    html.medtrak-light .bg-cyan-500 *,
    html.medtrak-light .bg-sky-500 *,
    html.medtrak-light .bg-blue-500 *,
    html.medtrak-light .bg-blue-600 *,
    html.medtrak-light .bg-emerald-500 *,
    html.medtrak-light .bg-green-600 *,
    html.medtrak-light .bg-rose-500 *,
    html.medtrak-light .bg-red-500 *,
    html.medtrak-light .bg-red-600 * {
      color: inherit !important;
    }

    html.medtrak-light .bg-gradient-to-r.from-teal-500,
    html.medtrak-light .bg-gradient-to-br.from-teal-500,
    html.medtrak-light .bg-gradient-to-r.from-sky-500,
    html.medtrak-light .bg-gradient-to-br.from-sky-500,
    html.medtrak-light .mt-brand-gradient {
      color: #ffffff !important;
    }

    html.medtrak-light .bg-gradient-to-r.from-teal-500 *,
    html.medtrak-light .bg-gradient-to-br.from-teal-500 *,
    html.medtrak-light .bg-gradient-to-r.from-sky-500 *,
    html.medtrak-light .bg-gradient-to-br.from-sky-500 *,
    html.medtrak-light .mt-brand-gradient * {
      color: inherit !important;
    }

    /* Opacity-based status labels were too faint on NHS Blue. */
    html.medtrak-light [class*="text-teal-"][class*="/"],
    html.medtrak-light [class*="text-cyan-"][class*="/"],
    html.medtrak-light [class*="text-sky-"][class*="/"] {
      color: #075985 !important;
      opacity: 1 !important;
    }

    html.medtrak-light [class*="text-emerald-"][class*="/"],
    html.medtrak-light [class*="text-green-"][class*="/"] {
      color: #166534 !important;
      opacity: 1 !important;
    }

    html.medtrak-light [class*="text-amber-"][class*="/"],
    html.medtrak-light [class*="text-yellow-"][class*="/"],
    html.medtrak-light [class*="text-orange-"][class*="/"] {
      color: #92400e !important;
      opacity: 1 !important;
    }

    html.medtrak-light [class*="text-rose-"][class*="/"],
    html.medtrak-light [class*="text-red-"][class*="/"],
    html.medtrak-light [class*="text-pink-"][class*="/"] {
      color: #991b1b !important;
      opacity: 1 !important;
    }

    html.medtrak-light button:disabled,
    html.medtrak-light [aria-disabled="true"] {
      opacity: 0.68 !important;
    }

    html.medtrak-light button:disabled *,
    html.medtrak-light [aria-disabled="true"] * {
      opacity: 1 !important;
    }

  `;

  document.head.appendChild(style);
}

function applyTheme(themeId) {
  if (typeof document === "undefined") return;
  const theme = getTheme(themeId);

  injectThemeStyles();

  const root = document.documentElement;

  if (theme.light) {
    root.classList.add("medtrak-light");
  } else {
    root.classList.remove("medtrak-light");
  }

  root.setAttribute("data-medtrak-theme", theme.id);
  root.style.setProperty("--medtrak-bg", theme.bg);
  root.style.setProperty("--medtrak-panel", theme.panel);
  root.style.setProperty("--medtrak-panel-soft", theme.panelSoft);
  root.style.setProperty("--medtrak-border", theme.border);
  root.style.setProperty("--medtrak-text", theme.text);
  root.style.setProperty("--medtrak-muted", theme.muted);
  root.style.setProperty("--medtrak-accent", theme.accent);
  root.style.setProperty("--medtrak-accent-2", theme.accent2);
}

export function MedTrakThemeProvider({ children }) {
  const { user, profile, isSyntheticMode } = useAuth();
  const applyingCloudRef = useRef(false);
  const pendingLocalThemeRef = useRef(null);
  const hydratedUserRef = useRef(null);
  const [themeId, setThemeIdState] = useState(() => {
    if (typeof localStorage === "undefined") return DEFAULT_THEME_ID;
    return localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || DEFAULT_THEME_ID;
  });

  useEffect(() => {
    const userId = user?.uid || "anonymous";
    if (hydratedUserRef.current !== userId) {
      hydratedUserRef.current = userId;
      pendingLocalThemeRef.current = null;
    }

    const cloudTheme = profile?.themePreference;
    if (!cloudTheme || !MEDTRAK_THEMES.some((item) => item.id === cloudTheme)) return;

    const pendingTheme = pendingLocalThemeRef.current;
    if (pendingTheme) {
      if (cloudTheme === pendingTheme) pendingLocalThemeRef.current = null;
      return;
    }

    if (cloudTheme === themeId) return;
    applyingCloudRef.current = true;
    setThemeIdState(cloudTheme);
  }, [profile?.themePreference, themeId, user?.uid]);

  useEffect(() => {
    applyTheme(themeId);
    localStorage.setItem(STORAGE_KEY, themeId);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("primovex:theme-changed", { detail: { themeId } }));

    if (applyingCloudRef.current) {
      applyingCloudRef.current = false;
      return;
    }
    if (!user?.uid || isSyntheticMode || profile?.themePreference === themeId) return;
    updateDoc(doc(db, "users", user.uid), { themePreference: themeId, themeUpdatedAt: new Date().toISOString() }).catch((error) => {
      console.warn("Theme preference could not be synced to the user profile.", error);
    });
  }, [themeId, user?.uid, isSyntheticMode, profile?.themePreference]);

  const setThemeId = (nextThemeId) => {
    const safeThemeId = MEDTRAK_THEMES.some((item) => item.id === nextThemeId) ? nextThemeId : DEFAULT_THEME_ID;
    pendingLocalThemeRef.current = safeThemeId;
    setThemeIdState(safeThemeId);
  };

  const value = useMemo(() => {
    const theme = getTheme(themeId);
    return {
      theme,
      themeId,
      themes: MEDTRAK_THEMES,
      setThemeId,
    };
  }, [themeId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useMedTrakTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useMedTrakTheme must be used inside MedTrakThemeProvider");
  }
  return ctx;
}

export function ThemePickerButton() {
  const { themeId, theme, themes, setThemeId } = useMedTrakTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-3 text-sm font-medium text-slate-100 shadow-sm backdrop-blur hover:bg-slate-800/60"
      >
        <span
          className="h-3.5 w-3.5 rounded-full border border-white/20"
          style={{ background: theme.accent }}
        />
        Theme
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
          <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Choose colour scheme
          </div>

          <div className="space-y-1">
            {themes.map((t) => {
              const active = t.id === themeId;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setThemeId(t.id);
                    setOpen(false);
                  }}
                  className={[
                    "w-full rounded-xl px-3 py-2 text-left transition",
                    active ? "bg-slate-800/80 text-slate-50" : "text-slate-200 hover:bg-slate-900/70",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-[11px] text-slate-400">{t.description}</div>
                    </div>

                    <div className="flex gap-1">
                      <span className="h-4 w-4 rounded-full border border-white/10" style={{ background: t.bg }} />
                      <span className="h-4 w-4 rounded-full border border-white/10" style={{ background: t.panel }} />
                      <span className="h-4 w-4 rounded-full border border-white/10" style={{ background: t.accent }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
