import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  demoActivity,
  demoConnectDevices,
  demoGovernanceCases,
  demoSecuritySignals,
  demoStockItems,
  getDemoOperationsSnapshot,
  getDemoScenario,
} from "@/data/demoDataset";
import {
  DEMO_ORGANISATION,
  DEMO_PROFILES,
  demoBannerText,
  getActiveDemoProfile,
  getLastDemoResetAt,
  resetDemoState,
  setActiveDemoProfile,
} from "@/config/demoMode";
import { Icons } from "@/config/medtrakIcons";
import PlatformModeControls from "@/components/platform/PlatformModeControls";

function StatusDot({ status }) {
  const cls = status === "green" ? "bg-emerald-400" : status === "amber" ? "bg-amber-300" : "bg-rose-400";
  return <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />;
}

function MiniCard({ title, value, note, icon: Icon }) {
  return (
    <Card className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100 shadow-sm backdrop-blur">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</p>
            <p className="mt-2 text-3xl font-black text-slate-50">{value}</p>
            <p className="mt-1 text-sm text-slate-400">{note}</p>
          </div>
          {Icon && <div className="rounded-2xl bg-teal-400/10 p-3 text-teal-200"><Icon className="h-5 w-5" /></div>}
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileCard({ profile, active, onSelect }) {
  return (
    <button type="button" onClick={() => onSelect(profile.id)} className={`rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-300/50 ${active ? "border-teal-300/60 bg-teal-400/10 shadow-lg shadow-teal-950/20" : "border-slate-800/70 bg-slate-950/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-slate-100">{profile.label}</p><p className="mt-1 text-xs leading-5 text-slate-400">{profile.description}</p></div>
        <span className="rounded-full border border-slate-700/70 px-2 py-1 text-[11px] font-semibold text-slate-300">{profile.badge}</span>
      </div>
    </button>
  );
}

export default function DemoMode() {
  const navigate = useNavigate();
  const [activeProfile, setActiveProfile] = useState(() => getActiveDemoProfile());
  const [lastResetAt, setLastResetAt] = useState(() => getLastDemoResetAt());
  const scenario = useMemo(() => getDemoScenario(activeProfile.id), [activeProfile.id]);
  const snapshot = useMemo(() => getDemoOperationsSnapshot(activeProfile.id), [activeProfile.id]);
  const lowStock = demoStockItems.filter((item) => Number(item.current_stock) <= Number(item.min_stock)).slice(0, 5);

  function handleSelectProfile(profileId) {
    const mode = profileId === "training-mode" ? "training" : "demo";
    setActiveProfile(setActiveDemoProfile(profileId, mode));
  }

  function handleReset() {
    const resetAt = resetDemoState();
    setActiveProfile(getActiveDemoProfile());
    setLastResetAt(resetAt);
  }

  function enterWorkspace() {
    handleSelectProfile(activeProfile.id);
    navigate("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_8%,rgba(45,212,191,0.16),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.12),transparent_28%)]" />
      <div className="relative mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-[2rem] border border-teal-400/20 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/40 p-6 shadow-2xl shadow-teal-950/20 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-100">
                <Icons.security className="h-3.5 w-3.5" /> Experience MedTrak+
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{scenario.organisationName || DEMO_ORGANISATION.name}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{DEMO_ORGANISATION.subtitle}. This environment is deliberately synthetic, anonymised and safe for demonstrations or staff training.</p>
              <p className="mt-4 max-w-3xl rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">{demoBannerText()}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={enterWorkspace} className="rounded-full bg-gradient-to-r from-teal-300 to-emerald-300 px-6 font-black text-slate-950">Enter demo workspace</Button>
              <Button onClick={handleReset} variant="ghost" className="rounded-full border border-slate-700/70 text-slate-100">Reset demo data</Button>
              <Link to="/login"><Button variant="ghost" className="rounded-full border border-slate-700/70 text-slate-100">Back to login</Button></Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <MiniCard title="Practice Pulse" value={`${scenario.pulse}%`} note={scenario.focus} icon={Icons.pulse} />
          {scenario.stats.slice(0, 3).map((item) => <MiniCard key={item.title} title={item.title} value={item.value} note={item.note} icon={Icons.gauge} />)}
        </section>

        <section className="rounded-[2rem] border border-slate-800/70 bg-slate-900/70 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Scenario</p><h2 className="mt-1 text-xl font-semibold">Choose what you want to show</h2></div>
            <p className="text-xs text-slate-500">Active: <span className="text-slate-200">{activeProfile.organisationName}</span>{lastResetAt ? ` • Reset ${new Date(lastResetAt).toLocaleString()}` : ""}</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {DEMO_PROFILES.map((profile) => <ProfileCard key={profile.id} profile={profile} active={profile.id === activeProfile.id} onSelect={handleSelectProfile} />)}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/15 via-slate-900/70 to-teal-500/10 text-slate-100">
            <CardContent className="p-5">
              <div className="flex items-center gap-2"><Icons.pulse className="h-5 w-5 text-violet-200" /><h2 className="text-lg font-semibold">MedAI demonstration brief</h2></div>
              <div className="mt-4 space-y-3">
                {scenario.brief.map((line) => <div key={line} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-200">{line}</div>)}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100">
            <CardContent className="p-5">
              <h2 className="text-lg font-semibold">Demo data coverage</h2>
              <div className="mt-4 grid gap-3 text-sm">
                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/40 p-3"><span>Stock records</span><strong>{demoStockItems.length}</strong></div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/40 p-3"><span>Governance cases</span><strong>{demoGovernanceCases.length}</strong></div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/40 p-3"><span>Connect devices</span><strong>{demoConnectDevices.length}</strong></div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/40 p-3"><span>Activity events</span><strong>{demoActivity.length}</strong></div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100 lg:col-span-1">
            <CardContent className="p-5"><h2 className="text-lg font-semibold">Low stock showcase</h2><div className="mt-4 space-y-3">{lowStock.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-100">{item.name}</p><span className="text-sm text-amber-100">{item.current_stock}/{item.min_stock}</span></div><p className="mt-1 text-xs text-slate-500">{item.location} • {item.supplier_name}</p></div>)}</div></CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100 lg:col-span-1">
            <CardContent className="p-5"><h2 className="text-lg font-semibold">Governance cases</h2><div className="mt-4 space-y-3">{demoGovernanceCases.slice(0,4).map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-100">{item.reference}</p><p className="text-xs text-slate-400">{item.identifier} • {item.patientInitials}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.priority === "high" ? "bg-rose-500/15 text-rose-100" : item.priority === "medium" ? "bg-amber-500/15 text-amber-100" : "bg-emerald-500/15 text-emerald-100"}`}>{item.priority.toUpperCase()}</span></div><p className="mt-3 text-sm text-slate-300">{item.summary}</p><p className="mt-2 text-xs text-slate-500">{item.stage} • Case health {item.health}% • {item.due}</p></div>)}</div></CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100 lg:col-span-1">
            <CardContent className="p-5"><h2 className="text-lg font-semibold">Connected devices</h2><div className="mt-4 space-y-3">{demoConnectDevices.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-100">{item.name}</p><p className="text-xs text-slate-400">{item.location} • {item.range}</p></div><p className="text-2xl font-semibold text-teal-100">{item.reading}</p></div><p className="mt-2 text-xs text-slate-500">{item.status} • Device health {item.health}% • Battery {item.battery}%</p></div>)}</div></CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100"><CardContent className="p-5"><h2 className="text-lg font-semibold">Live-looking activity</h2><div className="mt-4 space-y-3">{demoActivity.map((item) => <div key={item.id} className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-sm"><span className="font-mono text-teal-200">{item.time}</span><span className="text-slate-300"><strong className="text-slate-100">{item.user}</strong> {item.action}</span><span className="ml-auto text-xs text-slate-500">{item.module}</span></div>)}</div></CardContent></Card>
          <Card className="rounded-3xl border border-slate-800/70 bg-slate-900/70 text-slate-100"><CardContent className="p-5"><h2 className="text-lg font-semibold">Security posture</h2><div className="mt-4 space-y-3">{demoSecuritySignals.map((item) => <div key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-800/70 bg-slate-950/40 p-3 text-sm"><span className="flex items-center gap-2 text-slate-300"><StatusDot status={item.status} />{item.label}</span><span className="font-medium text-slate-100">{item.value}</span></div>)}</div></CardContent></Card>
        </section>

        <section className="rounded-[2rem] border border-slate-800/70 bg-slate-900/70 p-5">
          <PlatformModeControls />
        </section>
      </div>
    </div>
  );
}
