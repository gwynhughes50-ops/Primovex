import { useEffect, useMemo, useState } from "react";
import { subscribeConcerns, getConcernMetrics, getDeadlineTone, CONCERN_PRIORITIES, CONCERN_STATUSES } from "@/modules/governance/services/concernService";

function classifyConcern(concern) {
  if ([CONCERN_STATUSES.closed, CONCERN_STATUSES.archived].includes(concern?.status)) return "closed";
  const deadline = getDeadlineTone(concern);
  const external = Boolean(concern?.externalReference || concern?.mddusRequired || concern?.dutyOfCandourTriggered);
  if (concern?.priority === CONCERN_PRIORITIES.high || external || deadline.status === "critical") return "executive";
  if (concern?.priority === CONCERN_PRIORITIES.medium || concern?.clinicalReviewRequired || deadline.status === "warning") return "management";
  return "operational";
}

export default function usePracticeManagerOverview() {
  const [concerns, setConcerns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => subscribeConcerns(
    (rows) => { setConcerns(rows || []); setLoading(false); },
    (err) => { setError(err?.message || "Concerns unavailable"); setLoading(false); }
  ), []);

  return useMemo(() => {
    const active = concerns.filter((item) => classifyConcern(item) !== "closed");
    const buckets = active.reduce((acc, item) => {
      acc[classifyConcern(item)].push(item);
      return acc;
    }, { operational: [], management: [], executive: [] });
    return { concerns, active, buckets, metrics: getConcernMetrics(concerns), loading, error };
  }, [concerns, loading, error]);
}
