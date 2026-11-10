import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { emptyRules, mondayOf } from "@/modules/rota/rotaModel";
import { subscribeAbsences, subscribeRules, subscribeWeeks } from "@/modules/rota/rotaService";
import RotaWeekPanel from "@/components/rota/RotaWeekPanel";
import RotaRulesPanel from "@/components/rota/RotaRulesPanel";
import RotaAbsencesPanel from "@/components/rota/RotaAbsencesPanel";

// Reception rota (Operations > Reception rota). One person (given the permission) enters the rules for each member of the reception team and who is off, and Primovex builds the rota in the
// background. She can change any place by hand: Primovex checks the change and keeps it when the week is built again. The Practice Manager can see all of it.
const TABS = [["rota", "Rota"], ["off", "Who is off"], ["rules", "People and rules"]];

export default function ReceptionRota() {
  const { can, user, displayName } = useAuth();
  const canManage = can("rota.manage");
  const actor = useMemo(() => ({ uid: user?.uid || "", displayName: displayName || user?.email || "" }), [user, displayName]);
  const [tab, setTab] = useState("rota");
  const [rules, setRules] = useState(null); // null while loading
  const [weeks, setWeeks] = useState({});
  const [absences, setAbsences] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const onError = (e) => setError(e?.code === "permission-denied" ? "You don't have permission to see the reception rota." : e?.message || "The rota could not be loaded.");
    const stops = [
      subscribeRules((r) => setRules(r || emptyRules()), onError),
      subscribeWeeks(setWeeks, onError),
      subscribeAbsences(setAbsences, onError),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  const startMonday = useMemo(() => mondayOf(new Date()), []);
  const ready = rules !== null;
  const noTeam = ready && !(rules.people || []).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><CalendarDays className="h-6 w-6 text-teal-300" aria-hidden="true" /> Reception rota</h1>
        <p className="max-w-3xl text-sm text-slate-400">Enter the rules for each person once, and who is off, and Primovex builds the rota. You can change any place by hand; Primovex checks it and keeps it when the week is built again. If a shift can't be covered it says so.</p>
      </div>
      {error && <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>}
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === id ? "bg-[var(--medtrak-accent)] text-slate-950" : "border border-[var(--medtrak-border)] text-[var(--medtrak-text)]"}`}>{label}</button>
        ))}
      </div>
      {!ready ? <p className="text-sm text-slate-400">Loading…</p> : (
        <>
          {noTeam && tab !== "rules" && (
            <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">No one is on the rota yet. {canManage ? <>Add the reception team under <button type="button" className="underline" onClick={() => setTab("rules")}>People and rules</button>.</> : "Ask whoever builds the rota to add the team."}</p>
          )}
          {tab === "rota" && <RotaWeekPanel rules={rules} weeks={weeks} absences={absences} actor={actor} canManage={canManage} startMonday={startMonday} />}
          {tab === "off" && <RotaAbsencesPanel rules={rules} absences={absences} actor={actor} canManage={canManage} />}
          {tab === "rules" && <RotaRulesPanel rules={rules} actor={actor} canManage={canManage} />}
        </>
      )}
    </div>
  );
}
