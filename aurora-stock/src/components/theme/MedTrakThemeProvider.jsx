import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "medtrak-theme";

export const MEDTRAK_THEMES = [
  {
    id: "aurora",
    name: "Aurora Teal",
    description: "Original MedTrak+ dark teal.",
    light: false,
    bg: "#020617",
    panel: "#0f172a",
    panelSoft: "rgba(15, 23, 42, 0.72)",
    border: "rgba(148, 163, 184, 0.22)",
    text: "#f8fafc",
    muted: "#94a3b8",
    accent: "#2dd4bf",
    accent2: "#34d399",
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
  const [themeId, setThemeId] = useState(() => {
    if (typeof localStorage === "undefined") return "aurora";
    return localStorage.getItem(STORAGE_KEY) || "aurora";
  });

  useEffect(() => {
    applyTheme(themeId);
    localStorage.setItem(STORAGE_KEY, themeId);
  }, [themeId]);

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
