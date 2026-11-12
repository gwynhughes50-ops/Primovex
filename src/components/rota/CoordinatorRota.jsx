import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isoOf } from "@/modules/rota/rotaModel";
import { projectPublished } from "@/modules/rota/rotaPublish";
import { subscribeRules, subscribeWeeks } from "@/modules/rota/rotaService";
import { subscribeRequests, subscribeTeamAccess } from "@/modules/rota/rotaTeamService";
import { TeamDay } from "./MyRota";
import RotaRequestsPanel from "./RotaRequestsPanel";

// The Reception rota on the phone for the Practice Manager and the person who builds the rota (anyone with the rota permission): see who is on each shift each day, in the weeks that have been built,
// and answer the requests that are waiting for you. Building the rota, the rules and who is off stay on the desktop. The team only see the weeks that have been published.
const CARD = "rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel,rgba(15,23,42,0.6))]";

export default function CoordinatorRota() {
  const { user, displayName, can } = useAuth();
  const actor = useMemo(() => ({ uid: user?.uid || "", displayName: displayName || user?.email || "" }), [user, displayName]);
  const [rules, setRules] = useState(null);
  const [weeks, setWeeks] = useState({});
  const [requests, setRequests] = useState([]);
  const [teamAccess, setTeamAccess] = useState(false);
  const [tab, setTab] = useState("rota");
  const [error, setError] = useState("");

  useEffect(() => {
    const onError = (e) => setError(e?.code === "permission-denied" ? "You don't have permission to see the reception rota." : e?.message || "The rota could not be loaded.");
    const stops = [subscribeRules(setRules, onError), subscribeWeeks(setWeeks, onError), subscribeRequests(setRequests, onError), subscribeTeamAccess(setTeamAccess, () => {})];
    return () => stops.forEach((s) => s());
  }, []);

  // the built weeks, shown the way the team see a published one
  const shown = useMemo(() => (rules ? Object.fromEntries(Object.values(weeks).filter((w) => w.days).map((w) => [w.mondayIso, projectPublished(w, rules)])) : {}), [weeks, rules]);
  const waiting = requests.filter((r) => r.status === "awaiting_coordinator").length;
  const tabs = [["rota", "Rota", Users], ["requests", waiting ? `Requests (${waiting})` : "Requests", ArrowLeftRight]];

  if (error) return <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>;
  if (rules === null) return <p className="text-sm text-[var(--medtrak-muted)]">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--medtrak-border)] p-1" role="tablist">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold ${tab === id ? "bg-[var(--medtrak-accent)] text-slate-950" : "text-[var(--medtrak-text)]"}`}><Icon className="h-4 w-4" aria-hidden="true" />{label}</button>
        ))}
      </div>
      {tab === "rota" && (
        <>
          <p className={`${CARD} p-3 text-xs text-[var(--medtrak-muted)]`}>This is the rota as built. The team only see the weeks you have published. To build the rota, change the rules or enter who is off, use the desktop app.</p>
          <TeamDay published={shown} uid="" today={isoOf(new Date())} />
        </>
      )}
      {tab === "requests" && <RotaRequestsPanel requests={requests} teamAccess={teamAccess} canSwitch={false} actor={actor} showAccess={false} can={can} />}
    </div>
  );
}
