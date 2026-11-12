import { useEffect, useMemo, useState } from "react";
import { CalendarDays, SlidersHorizontal, UserMinus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { emptyRules, mondayOf } from "@/modules/rota/rotaModel";
import { subscribeAbsences, subscribeRules, subscribeWeeks } from "@/modules/rota/rotaService";
import RotaWeekPanel from "@/components/rota/RotaWeekPanel";
import RotaRulesPanel from "@/components/rota/RotaRulesPanel";
import RotaAbsencesPanel from "@/components/rota/RotaAbsencesPanel";

// Reception rota (Operations > Reception rota). One person (given the permission) enters the rules for each member of the reception team and who is off, and Primovex builds the rota in the background.
// She can change any place by hand: Primovex checks it and keeps it when the week is built again. The Practice Manager can see all of it.
const TABS = [["rota", "Rota", CalendarDays], ["off", "Who is off", UserMinus], ["rules", "People and rules", SlidersHorizontal]];

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[color:color-mix(in_srgb,var(--medtrak-accent)_18%,transparent)] text-[var(--medtrak-accent)]"><CalendarDays className="h-6 w-6" aria-hidden="true" /></span>
          <div>
            <h1 className="text-2xl font-black leading-tight text-slate-50">Reception rota</h1>
            <p className="max-w-2xl text-sm text-slate-400">Primovex builds the rota from each person's rules and who is off. Click a name to change it by hand; if a shift can't be covered, it says so.</p>
          </div>
        </div>
        <div className="inline-flex rounded-2xl border border-[var(--medtrak-border)] p-1" role="tablist">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === id ? "bg-[var(--medtrak-accent)] text-slate-950 shadow-sm" : "text-[var(--medtrak-text)] hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,transparent)]"}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>}
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
