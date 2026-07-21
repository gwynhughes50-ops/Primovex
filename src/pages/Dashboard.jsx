import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Barcode, Package, Settings2, Thermometer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemePickerButton } from "@/components/theme/MedTrakThemeProvider";
import OperationsCentre from "@/components/dashboard/OperationsCentre";
import OperationsBrief from "@/operations/components/OperationsBrief";
import OperationsTimeline from "@/operations/components/OperationsTimeline";
import DashboardCustomizer from "@/dashboard/DashboardCustomizer";
import { normaliseDashboardPreferences, saveDashboardPreferences } from "@/dashboard/dashboardPreferences";
import { useAuth } from "@/contexts/AuthContext";
import HomeHeader from "@/smart-home/components/HomeHeader";
import HomeMetricCard from "@/smart-home/components/HomeMetricCard";
import HomeShell from "@/smart-home/components/HomeShell";
import HomeWidget from "@/smart-home/components/HomeWidget";
import UseStockDialog from "@/smart-home/components/UseStockDialog";
import useSmartHomeData, { formatStockMovement } from "@/smart-home/hooks/useSmartHomeData";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile, role } = useAuth();
  const data = useSmartHomeData();
  const [useStockOpen, setUseStockOpen] = useState(false);
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState(() => normaliseDashboardPreferences(profile?.dashboardPreferences, role));

  useEffect(() => setPreferences(normaliseDashboardPreferences(profile?.dashboardPreferences, role)), [profile?.dashboardPreferences, role]);
  const visible = useMemo(() => new Set(preferences.visible), [preferences.visible]);

  async function savePreferences() {
    setSaving(true);
    try { await saveDashboardPreferences(user?.uid, preferences); }
    catch (error) { console.error("Could not sync dashboard preferences", error); }
    finally { setSaving(false); setCustomiseOpen(false); }
  }

  const temperatureContext = { loading: data.loading.tempLoading, hasReading: data.temperature.hasReading, within: data.temperature.within, detail: data.temperature.detail, readingAt: data.temperature.readingAt };

  const widgets = {
    brief: <OperationsBrief inventory={{ totalItems: data.totalItems, lowStockItems: data.lowStockItems, expiringSoon: data.expiringSoon.length, loading: data.loading.stock || data.loading.itemsLoading }} temperature={temperatureContext} recentMoves={data.recentMoves} />,
    timeline: <OperationsTimeline context={{ recentMoves: data.recentMoves, temperature: temperatureContext }} compact />,
    management: <OperationsCentre />,
    quickActions: <HomeWidget><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">Home</h2><p className="text-sm text-[color:var(--medtrak-muted)]">Your personal view of what matters today.</p></div><div className="flex flex-wrap gap-2"><ThemePickerButton /><Button variant="outline" className="rounded-xl" onClick={() => setCustomiseOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Customise Home</Button><Button className="rounded-xl bg-[color:var(--medtrak-accent)] text-white" onClick={() => setUseStockOpen(true)}><Barcode className="mr-2 h-4 w-4" />Use stock</Button></div></div></HomeWidget>,
    stockSummary: <section className="grid grid-cols-1 gap-3 sm:grid-cols-3"><HomeMetricCard label="Total items" value={data.loading.stock ? "—" : data.totalItems} detail="Across all locations and categories." icon={Package} /><HomeMetricCard label="Low stock" value={data.loading.stock ? "—" : data.lowStockItems} detail="Items at or below minimum level." icon={AlertTriangle} tone={data.lowStockItems > 0 ? "warning" : "default"} /><HomeMetricCard label="Temperature" value={data.temperature.headline} detail={data.temperature.detail} icon={Thermometer} tone={!data.temperature.within ? "danger" : "default"} /></section>,
    stockActivity: <HomeWidget title="Recent stock activity" description="Latest movements recorded." action={<Button variant="ghost" className="rounded-full text-xs" onClick={() => navigate("/inventory")}>View inventory</Button>}><div className="space-y-2 text-sm">{data.loading.movesLoading ? <p className="text-[color:var(--medtrak-muted)]">Loading activity…</p> : data.recentMoves.length ? data.recentMoves.map((move) => <p key={move.id}>• {formatStockMovement(move)}</p>) : <p className="text-[color:var(--medtrak-muted)]">No recent movements yet.</p>}</div></HomeWidget>,
    issues: <HomeWidget title="Warnings" description="Only exceptions that may need attention." icon={Package}><div className="space-y-2 text-sm">{data.loading.itemsLoading || data.loading.tempLoading ? <p className="text-[color:var(--medtrak-muted)]">Loading issues…</p> : data.issues.length ? data.issues.map((issue) => <div key={issue.key} className={`rounded-xl border px-3 py-2 ${issue.tone === "danger" ? "border-rose-500/30 bg-rose-500/10" : issue.tone === "warning" ? "border-amber-500/30 bg-amber-500/10" : "border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)]"}`}>{issue.text}</div>) : <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">No issues detected.</div>}</div><div className="mt-3 flex gap-2"><Button variant="ghost" className="rounded-full text-xs" onClick={() => navigate("/inventory")}>Inventory</Button><Button variant="ghost" className="rounded-full text-xs" onClick={() => navigate("/temperature")}>Temperature</Button></div></HomeWidget>,
  };

  const errors = Object.values(data.errors).filter(Boolean);
  return <HomeShell>
    <HomeHeader title="A calm view of your practice" actions={!visible.has("quickActions") ? <Button variant="outline" className="rounded-xl" onClick={() => setCustomiseOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Customise</Button> : null} />
    {errors.length > 0 && <HomeWidget title="Some live data could not be loaded" className="border-rose-500/30">{errors.map((error, index) => <p key={index} className="text-sm text-rose-700">{String(error?.message || error)}</p>)}</HomeWidget>}
    {preferences.order.map((id) => visible.has(id) ? <React.Fragment key={id}>{widgets[id]}</React.Fragment> : null)}
    <DashboardCustomizer open={customiseOpen} onClose={() => setCustomiseOpen(false)} preferences={preferences} role={role} onChange={setPreferences} onSave={savePreferences} saving={saving} />
    <UseStockDialog open={useStockOpen} onClose={() => setUseStockOpen(false)} />
  </HomeShell>;
}
