import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, MessageSquarePlus, Package, Thermometer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import OperationsCentre from "@/components/dashboard/OperationsCentre";
import WhoIsWhereWidget from "@/components/dashboard/WhoIsWhereWidget";
import OperationsBrief from "@/operations/components/OperationsBrief";
import OperationsTimeline from "@/operations/components/OperationsTimeline";
import DashboardCustomizer from "@/dashboard/DashboardCustomizer";
import { normaliseDashboardPreferences, saveDashboardPreferences } from "@/dashboard/dashboardPreferences";
import NeedsYou from "@/components/dashboard/NeedsYou";
import HealthStrip from "@/components/dashboard/HealthStrip";
import ComingUp from "@/components/dashboard/ComingUp";
import InToday from "@/components/dashboard/InToday";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { filterNeedsYou } from "@/dashboard/needsYou";
import { useNeedsYou } from "@/dashboard/useNeedsYou";
import { useAhead } from "@/dashboard/useAhead";
import { useAuth } from "@/contexts/AuthContext";
import HomeMetricCard from "@/smart-home/components/HomeMetricCard";
import HomeShell from "@/smart-home/components/HomeShell";
import HomeWidget from "@/smart-home/components/HomeWidget";
import UseStockDialog from "@/smart-home/components/UseStockDialog";
import useSmartHomeData, { formatStockMovement } from "@/smart-home/hooks/useSmartHomeData";
import useRoomOperationalContext from "@/operations/hooks/useRoomOperationalContext";
import QuickNotesSheet from "@/mobile/QuickNotesSheet";
import { subscribeQuickNotes } from "@/services/quickNotesService";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile, role, roleHomeType, displayName } = useAuth();
  const data = useSmartHomeData();
  const rooms = useRoomOperationalContext();
  const [useStockOpen, setUseStockOpen] = useState(false);
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState(() => normaliseDashboardPreferences(profile?.dashboardPreferences, role, roleHomeType));
  const [quickNotesOpen, setQuickNotesOpen] = useState(false);
  const [quickNotes, setQuickNotes] = useState([]);
  useEffect(() => subscribeQuickNotes((notes) => setQuickNotes(notes.filter((note) => note.status !== "completed"))), []);

  useEffect(() => setPreferences(normaliseDashboardPreferences(profile?.dashboardPreferences, role, roleHomeType)), [profile?.dashboardPreferences, role, roleHomeType]);
  const visible = useMemo(() => new Set(preferences.visible), [preferences.visible]);
  // only reads what is waiting on this person while one of the two widgets that show it is on
  const needs = useNeedsYou(visible.has("needsYou") || visible.has("healthStrip"));
  const settings = preferences.settings;
  const ahead = useAhead(visible.has("comingUp") || visible.has("inToday"), { days: settings.comingUpDays, hide: settings.comingUpHide });
  // what the person has chosen to leave out of Needs you and the health strip, and how many rows to show
  const needsShown = useMemo(() => filterNeedsYou(needs.rows, { hide: settings.needsYouHide, max: settings.needsYouMax }), [needs.rows, settings.needsYouHide, settings.needsYouMax]);
  const tiles = useMemo(() => (needs.tiles || []).filter((tile) => !settings.healthHide.includes(tile.area)), [needs.tiles, settings.healthHide]);
  const urgent = needsShown.rows.filter((row) => row.tone === "critical").length;
  const waiting = needsShown.rows.length + needsShown.more;
  const summary = !needs.ready ? "Checking what is waiting…" : waiting === 0 ? "Nothing is waiting on you." : `${waiting} ${waiting === 1 ? "thing needs" : "things need"} you${urgent ? `, ${urgent} urgent` : ""}.`;
  const tone = !needs.ready ? "wait" : waiting === 0 ? "clear" : urgent ? "urgent" : "some";
  const firstName = String(displayName || "").trim().split(" ")[0] || "";

  async function savePreferences() {
    setSaving(true);
    try { await saveDashboardPreferences(user?.uid, preferences); }
    catch (error) { console.error("Could not sync dashboard preferences", error); }
    finally { setSaving(false); setCustomiseOpen(false); }
  }

  const temperatureContext = { loading: data.loading.tempLoading, hasReading: data.temperature.hasReading, within: data.temperature.within, detail: data.temperature.detail, readingAt: data.temperature.readingAt };

  const widgets = {
    healthStrip: <HealthStrip tiles={tiles} />,
    needsYou: <NeedsYou rows={needsShown.rows} more={needsShown.more} ready={needs.ready} onSars={needs.reloadSars} />,
    comingUp: <ComingUp coming={ahead.coming} days={settings.comingUpDays} />,
    inToday: <InToday today={ahead.today} seesRota={ahead.seesRota} />,
    brief: <OperationsBrief inventory={{ totalItems: data.totalItems, lowStockItems: data.lowStockItems, expiringSoon: data.expiringSoon.length, loading: data.loading.stock || data.loading.itemsLoading }} temperature={temperatureContext} recentMoves={data.recentMoves} rooms={rooms} />,
    timeline: <OperationsTimeline context={{ recentMoves: data.recentMoves, temperature: temperatureContext, rooms }} compact />,
    // the inbox is its own widget now; the MedAI overview leaves it out when both are on, so it is not shown twice
    management: <OperationsCentre part={visible.has("priorities") ? "overview" : "all"} />,
    priorities: <OperationsCentre part="priorities" />,
    whoIsWhere: <WhoIsWhereWidget />,
    stockSummary: <section className="grid grid-cols-1 gap-3 sm:grid-cols-3"><HomeMetricCard label="Total items" value={data.loading.stock ? "—" : data.totalItems} detail="Across all locations and categories." icon={Package} /><HomeMetricCard label="Low stock" value={data.loading.stock ? "—" : data.lowStockItems} detail="Items at or below minimum level." icon={AlertTriangle} tone={data.lowStockItems > 0 ? "warning" : "default"} /><HomeMetricCard label="Temperature" value={data.temperature.headline} detail={data.temperature.detail} icon={Thermometer} tone={!data.temperature.within ? "danger" : "default"} /></section>,
    stockActivity: <HomeWidget title="Recent stock activity" description="Latest movements recorded." action={<Button variant="ghost" className="rounded-full text-xs" onClick={() => navigate("/inventory")}>View inventory</Button>}><div className="space-y-2 text-sm">{data.loading.movesLoading ? <p className="text-[color:var(--medtrak-muted)]">Loading activity…</p> : data.recentMoves.length ? data.recentMoves.map((move) => <p key={move.id}>• {formatStockMovement(move)}</p>) : <p className="text-[color:var(--medtrak-muted)]">No recent movements yet.</p>}</div></HomeWidget>,
    issues: <HomeWidget title="Warnings" description="Only exceptions that may need attention." icon={Package}><div className="space-y-2 text-sm">{data.loading.itemsLoading || data.loading.tempLoading ? <p className="text-[color:var(--medtrak-muted)]">Loading issues…</p> : data.issues.length ? data.issues.map((issue) => <div key={issue.key} className={`rounded-xl border px-3 py-2 ${issue.tone === "danger" ? "border-rose-500/30 bg-rose-500/10" : issue.tone === "warning" ? "border-amber-500/30 bg-amber-500/10" : "border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)]"}`}>{issue.text}</div>) : <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">No issues detected.</div>}</div><div className="mt-3 flex gap-2"><Button variant="ghost" className="rounded-full text-xs" onClick={() => navigate("/inventory")}>Inventory</Button><Button variant="ghost" className="rounded-full text-xs" onClick={() => navigate("/temperature")}>Temperature</Button></div></HomeWidget>,
    quickNotes: <HomeWidget title="Quick notes" description="Your open reminders and shared practice tasks." action={<Button variant="ghost" className="rounded-full text-xs" onClick={() => setQuickNotesOpen(true)}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" />Add note</Button>}><div className="space-y-2 text-sm">{quickNotes.length ? quickNotes.slice(0, 5).map((note) => <div key={note.id} className="rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] px-3 py-2"><p className="truncate">{note.text}</p><p className="mt-0.5 text-xs text-[color:var(--medtrak-muted)]">{note.scope === "practice" ? "Practice" : "Private"}{note.dueAt ? ` • ${new Date(note.dueAt).toLocaleDateString("en-GB")}` : ""}</p></div>) : <p className="text-[color:var(--medtrak-muted)]">No open quick notes.</p>}</div></HomeWidget>,
  };

  const errors = Object.values(data.errors).filter(Boolean);
  // Side by side: Needs you on the left and Coming up with In today stacked beside it. Stacked (or when Needs you is off), each runs the width it needs.
  const pair = settings.layout !== "stacked" && visible.has("needsYou") && (visible.has("comingUp") || visible.has("inToday"));
  const SPAN = { healthStrip: "xl:col-span-12", comingUp: "xl:col-span-6", inToday: "xl:col-span-6" };
  return <HomeShell>
    <DashboardHeader name={firstName} summary={summary} tone={tone} onCustomise={() => setCustomiseOpen(true)} onUseStock={() => setUseStockOpen(true)} />
    {errors.length > 0 && <HomeWidget title="Some live data could not be loaded" className="border-rose-500/30">{errors.map((error, index) => <p key={index} className="text-sm text-rose-700">{String(error?.message || error)}</p>)}</HomeWidget>}
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      {preferences.order.map((id) => {
        if (!visible.has(id) || !widgets[id]) return null;
        if (pair && (id === "comingUp" || id === "inToday")) return null;
        if (pair && id === "needsYou") {
          return (
            <div key={id} className="grid min-w-0 grid-cols-1 gap-5 xl:col-span-12 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-7">{widgets.needsYou}</div>
              <div className="min-w-0 space-y-5 xl:col-span-5">{visible.has("comingUp") ? widgets.comingUp : null}{visible.has("inToday") ? widgets.inToday : null}</div>
            </div>
          );
        }
        return <div key={id} className={`min-w-0 ${SPAN[id] || "xl:col-span-12"}`}>{widgets[id]}</div>;
      })}
    </div>
    <DashboardCustomizer open={customiseOpen} onClose={() => setCustomiseOpen(false)} preferences={preferences} role={role} homeType={roleHomeType} onChange={setPreferences} onSave={savePreferences} saving={saving} />
    <UseStockDialog open={useStockOpen} onClose={() => setUseStockOpen(false)} />
    <QuickNotesSheet open={quickNotesOpen} onClose={() => setQuickNotesOpen(false)} />
  </HomeShell>;
}
