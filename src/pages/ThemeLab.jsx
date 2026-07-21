import { useMemo } from "react";
import { ThemePickerButton, useMedTrakTheme } from "@/components/theme/MedTrakThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Icons, iconGroups } from "@/config/medtrakIcons";

function hexToRgb(hex) {
  const normalised = String(hex || "").replace("#", "").trim();
  if (normalised.length !== 6) return null;
  const value = Number.parseInt(normalised, 16);
  if (Number.isNaN(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function luminance(rgb) {
  if (!rgb) return 0;
  const convert = (channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(rgb.r) + 0.7152 * convert(rgb.g) + 0.0722 * convert(rgb.b);
}

function contrastRatio(foreground, background) {
  const l1 = luminance(hexToRgb(foreground));
  const l2 = luminance(hexToRgb(background));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function passLabel(ratio, large = false) {
  const target = large ? 3 : 4.5;
  return ratio >= target ? "Pass" : "Review";
}

function LabCard({ title, children, className = "" }) {
  return (
    <section className={`mt-card rounded-3xl border p-5 shadow-xl shadow-black/10 ${className}`}>
      <h2 className="mt-text-primary text-base font-semibold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ContrastRow({ label, foreground, background, large = false }) {
  const ratio = contrastRatio(foreground, background);
  const passed = passLabel(ratio, large) === "Pass";

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/30 p-3">
      <div>
        <p className="mt-text-primary text-sm font-medium">{label}</p>
        <p className="mt-text-secondary text-xs">WCAG target {large ? "3.0" : "4.5"}:1</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="mt-text-primary font-mono text-sm">{ratio.toFixed(2)}:1</span>
        <Badge className={passed ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200" : "border-amber-500/30 bg-amber-500/15 text-amber-200"}>
          {passed ? "Pass" : "Review"}
        </Badge>
      </div>
    </div>
  );
}


function IconLab() {
  const entries = Object.entries(iconGroups);

  return (
    <LabCard title="Icon Lab">
      <p className="mt-text-secondary mb-4 text-sm">
        Central icon preview. Missing navigation icons now fall back safely instead of crashing the app.
      </p>
      <div className="space-y-5">
        {entries.map(([group, names]) => (
          <div key={group}>
            <p className="mt-text-secondary mb-2 text-xs font-semibold uppercase tracking-[0.22em]">{group}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
              {names.map((name) => {
                const Icon = Icons[name] || Icons.helpCircle;
                return (
                  <div key={`${group}-${name}`} className="mt-button-secondary rounded-2xl border p-3 text-center">
                    <Icon className="mt-accent mx-auto h-5 w-5" />
                    <p className="mt-text-primary mt-2 truncate text-xs font-medium">{name}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </LabCard>
  );
}

export default function ThemeLab() {
  const { theme, themes, setThemeId } = useMedTrakTheme();

  const checks = useMemo(
    () => [
      { label: "Primary text on background", foreground: theme.text, background: theme.bg },
      { label: "Primary text on card", foreground: theme.text, background: theme.panel },
      { label: "Muted text on background", foreground: theme.muted, background: theme.bg },
      { label: "Accent on background", foreground: theme.accent, background: theme.bg, large: true },
    ],
    [theme]
  );

  return (
    <div className="mt-theme-page min-h-screen space-y-6 pb-10">
      <header className="mt-card rounded-3xl border p-6 shadow-2xl shadow-black/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mt-accent text-xs font-semibold uppercase tracking-[0.3em]">Sprint 21A</p>
            <h1 className="mt-text-primary mt-2 text-3xl font-bold tracking-tight">Theme Lab</h1>
            <p className="mt-text-secondary mt-2 max-w-3xl text-sm leading-6">
              A quality-control page for checking every MedTrak+ theme across desktop, tablet and mobile components.
              Use this before each release to catch hidden text, weak contrast and awkward component states.
            </p>
          </div>
          <ThemePickerButton />
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <LabCard title="Theme selector and contrast checks">
          <div className="grid gap-3 md:grid-cols-2">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setThemeId(t.id)}
                className="mt-button-secondary rounded-2xl border p-4 text-left transition hover:scale-[1.01]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="mt-text-primary text-sm font-semibold">{t.name}</p>
                    <p className="mt-text-secondary mt-1 text-xs">{t.description}</p>
                  </div>
                  <div className="flex gap-1">
                    {[t.bg, t.panel, t.accent].map((colour) => (
                      <span key={colour} className="h-5 w-5 rounded-full border border-white/20" style={{ background: colour }} />
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {checks.map((check) => (
              <ContrastRow key={check.label} {...check} />
            ))}
          </div>
        </LabCard>

        <LabCard title="Desktop component states">
          <div className="space-y-4">
            <div className="mt-card-strong rounded-2xl border p-4">
              <p className="mt-text-primary text-lg font-semibold">Operations Centre card</p>
              <p className="mt-text-secondary mt-1 text-sm">Primary, secondary and muted text must remain visible in every theme.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="mt-button-primary rounded-full">Primary action</Button>
                <Button className="mt-button-secondary rounded-full border">Secondary</Button>
                <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-200">Healthy</Badge>
                <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-200">Review</Badge>
                <Badge className="border-rose-500/30 bg-rose-500/15 text-rose-200">Critical</Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Practice Pulse", "95", "Excellent"],
                ["Inventory Confidence", "98%", "Verified"],
                ["Cold Chain", "Live", "4 devices"],
              ].map(([label, value, detail]) => (
                <div key={label} className="mt-card rounded-2xl border p-4">
                  <p className="mt-text-secondary text-xs uppercase tracking-wide">{label}</p>
                  <p className="mt-text-primary mt-2 text-2xl font-bold">{value}</p>
                  <p className="mt-text-muted mt-1 text-xs">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </LabCard>
      </div>

      <IconLab />

      <div className="grid gap-5 lg:grid-cols-3">
        <LabCard title="Forms and inputs">
          <div className="space-y-3">
            <label className="block">
              <span className="mt-text-secondary text-xs font-medium">Search MedTrak+</span>
              <Input className="mt-input mt-1" placeholder="Search stock, devices or tasks" />
            </label>
            <label className="block">
              <span className="mt-text-secondary text-xs font-medium">Assigned to</span>
              <select className="mt-input mt-1 w-full rounded-xl border px-3 py-3 text-sm">
                <option>HCA team</option>
                <option>Nursing team</option>
                <option>Practice manager</option>
              </select>
            </label>
            <Button className="mt-button-primary w-full rounded-xl">Save test record</Button>
          </div>
        </LabCard>

        <LabCard title="Mobile card preview">
          <div className="mx-auto max-w-xs rounded-[2rem] border border-slate-800/70 bg-slate-950/40 p-3">
            <div className="mt-card rounded-[1.6rem] border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mt-accent text-xs font-semibold uppercase tracking-wide">MedTrak Mobile</p>
                  <p className="mt-text-primary mt-1 text-lg font-bold">Cold Chain OK</p>
                </div>
                <Icons.connect className="mt-accent h-6 w-6" />
              </div>
              <div className="mt-4 space-y-2">
                <div className="mt-button-secondary flex items-center justify-between rounded-2xl border px-3 py-2 text-sm">
                  <span>Vaccine Fridge 1</span>
                  <strong>4.2°C</strong>
                </div>
                <div className="mt-button-secondary flex items-center justify-between rounded-2xl border px-3 py-2 text-sm">
                  <span>Session</span>
                  <strong>01h 12m</strong>
                </div>
              </div>
            </div>
          </div>
        </LabCard>

        <LabCard title="Theme release checklist">
          <ul className="space-y-3 text-sm">
            {[
              "All headings readable",
              "Muted text visible",
              "Inputs and placeholders visible",
              "Mobile cards readable",
              "Warning and danger states obvious",
              "Buttons contrast against cards",
              "High Contrast theme usable",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Icons.check className="h-4 w-4 text-emerald-300" />
                <span className="mt-text-primary">{item}</span>
              </li>
            ))}
          </ul>
        </LabCard>
      </div>
    </div>
  );
}
