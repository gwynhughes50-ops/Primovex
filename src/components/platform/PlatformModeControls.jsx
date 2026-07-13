import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getLastPlatformResetAt,
  getPlatformModeConfig,
  getStoredPlatformMode,
  PLATFORM_MODE_LIST,
  resetPlatformTrainingData,
  setPlatformMode,
} from "@/config/platformMode";
import { getActiveDemoProfile, setActiveDemoProfile, DEMO_PROFILES } from "@/config/demoMode";
import { Button } from "@/components/ui/button";
import { Icons } from "@/config/medtrakIcons";

function isSyntheticMode(mode) {
  return ["demo", "training", "staging"].includes(mode);
}

function ModeCard({ mode, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(mode.id)}
      className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${
        active
          ? `${mode.badgeClass} shadow-lg`
          : "border-slate-800/70 bg-slate-950/50 text-slate-300 hover:border-slate-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${mode.dotClass}`} />
            <p className="text-sm font-black">{mode.label}</p>
          </div>
          <p className="mt-2 text-xs leading-5 opacity-80">{mode.description}</p>
        </div>
        {active && (
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-semibold">
            Active
          </span>
        )}
      </div>
    </button>
  );
}

export default function PlatformModeControls({ showLaunchButtons = true, compact = false }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(() => getStoredPlatformMode());
  const [profile, setProfile] = useState(() => getActiveDemoProfile());
  const [lastReset, setLastReset] = useState(() => getLastPlatformResetAt());

  const activeConfig = useMemo(() => getPlatformModeConfig(mode), [mode]);

  function chooseMode(nextMode) {
    const selectedProfile = profile?.id || "gp-practice";
    setPlatformMode(nextMode, { scenarioId: selectedProfile });
    if (isSyntheticMode(nextMode)) {
      setActiveDemoProfile(selectedProfile, nextMode);
    }
    setMode(nextMode);
  }

  function chooseScenario(profileId) {
    const nextMode = mode === "live" ? "demo" : mode;
    const nextProfile = setActiveDemoProfile(profileId, nextMode);
    setProfile(nextProfile);
    if (mode === "live") setMode("demo");
  }

  function resetData() {
    const resetAt = resetPlatformTrainingData();
    setLastReset(resetAt);
  }

  function launch() {
    if (mode === "live") {
      navigate("/dashboard");
      return;
    }
    navigate("/demo");
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-3xl border p-4 ${activeConfig.bannerClass}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em]">Current platform mode</p>
            <h3 className="mt-1 text-2xl font-black">{activeConfig.shortLabel}</h3>
            <p className="mt-1 text-sm opacity-90">{activeConfig.dataPolicy}</p>
          </div>
          {showLaunchButtons && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={launch}
                className="rounded-full bg-slate-50 px-5 font-black text-slate-950 hover:bg-white"
              >
                {mode === "live" ? "Go to live system" : "Open Demo Centre"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={resetData}
                className="rounded-full border border-white/15 text-current hover:bg-white/10"
              >
                Reset demo/training data
              </Button>
            </div>
          )}
        </div>
        {lastReset && <p className="mt-3 text-xs opacity-75">Last reset: {new Date(lastReset).toLocaleString()}</p>}
      </div>

      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4"}`}>
        {PLATFORM_MODE_LIST.map((item) => (
          <ModeCard key={item.id} mode={item} active={item.id === mode} onSelect={chooseMode} />
        ))}
      </div>

      <div className="rounded-3xl border border-slate-800/70 bg-slate-950/50 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Demo and training scenario</p>
            <h3 className="mt-1 text-lg font-bold text-slate-100">Choose the story you want to show</h3>
          </div>
          <p className="text-xs text-slate-500">Selecting a scenario automatically switches out of Live mode.</p>
        </div>
        <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4"}`}>
          {DEMO_PROFILES.map((item) => {
            const active = item.id === profile.id && mode !== "live";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseScenario(item.id)}
                className={`rounded-2xl border p-3 text-left transition hover:border-teal-300/50 ${
                  active ? "border-teal-300/60 bg-teal-400/10" : "border-slate-800/70 bg-slate-900/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{item.label}</p>
                  <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
                    {item.badge}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{item.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
        <div className="flex gap-2">
          <Icons.security className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Live mode is for real operational work. Demo, Training and Staging are designed for presentations, staff onboarding and safe testing. Never enter live patient-identifiable data into synthetic modes.
          </p>
        </div>
      </div>
    </div>
  );
}
