import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrbStatus } from "@/orb/OrbStatusContext";
import { useSarsToChase } from "@/modules/governance/useSarsToChase";
import { subscribeConcerns } from "@/modules/governance/services/concernService";
import { useCertificates } from "@/modules/certificates/certificateService";
import { certLabel } from "@/modules/certificates/certificates";
import { useCoshhSubstances } from "@/modules/coshh/coshhService";
import { subscribeAbsences, subscribeRules, subscribeWeeks } from "@/modules/rota/rotaService";
import { buildComingUp, buildInToday } from "@/dashboard/comingUp";

// What is coming up in the next fortnight and who is in today, read from the places that already hold them (SARs the reminder bell lists,
// concerns, certificates, COSHH reviews, the reception rota). Only reads what this person's role may see.
export function useAhead(enabled = true) {
  const { can } = useAuth();
  const orb = useOrbStatus();
  const chase = useSarsToChase({ enabled });
  const areas = orb.scope?.areas || [];
  const seesGovernance = areas.includes("governance");
  const seesCompliance = areas.includes("compliance");
  const seesRota = can("rota.read") || can("rota.manage");

  const [concerns, setConcerns] = useState([]);
  useEffect(() => {
    if (!enabled || !seesGovernance) { setConcerns([]); return undefined; }
    return subscribeConcerns((list) => setConcerns(list || []), () => setConcerns([]));
  }, [enabled, seesGovernance]);
  const certificates = useCertificates(enabled && seesCompliance);
  const coshh = useCoshhSubstances(enabled && seesCompliance);

  const [rules, setRules] = useState(null);
  const [weeks, setWeeks] = useState({});
  const [absences, setAbsences] = useState([]);
  useEffect(() => {
    if (!enabled || !seesRota) { setRules(null); setWeeks({}); setAbsences([]); return undefined; }
    const stops = [
      subscribeRules((r) => setRules(r || null), () => setRules(null)),
      subscribeWeeks((w) => setWeeks(w || {}), () => setWeeks({})),
      subscribeAbsences((a) => setAbsences(a || []), () => setAbsences([])),
    ];
    return () => stops.forEach((stop) => typeof stop === "function" && stop());
  }, [enabled, seesRota]);

  // "now" is taken again whenever the data changes, so the day rolls over without a reload
  const now = useMemo(() => new Date(), [concerns, certificates.list, coshh.list, rules, weeks, absences, chase.rows]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => ({
    coming: buildComingUp({
      now,
      sarRows: chase.canChase ? chase.rows : [],
      concerns,
      certificates: (certificates.list || []).map((c) => ({ ...c, label: certLabel(c) })),
      coshh: coshh.list || [],
      absences: seesRota ? absences : [],
    }),
    today: buildInToday({ now, weeks, rules, absences }),
    seesRota,
  }), [now, chase.canChase, chase.rows, concerns, certificates.list, coshh.list, absences, weeks, rules, seesRota]);
}
