import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { normalizeStockItemCategory } from '@/services/stockService';
import { summariseStockAlerts } from '@/lib/stockAlerts';
import useExpirySettings from '@/hooks/useExpirySettings';
import { getOperationalEscalations } from '@/operations/escalations/operationalEscalationService';
import { detectChange, highPriorityTaskCount, nextBaseline, overdueSarCount, readBaseline, takeSnapshot, writeBaseline } from '@/lib/orbSignal';

// Tells the Pulse orb whether there has been a substantial change since someone last looked
// (see src/lib/orbSignal.js for the rule). `acknowledge()` is called when the orb is opened.
export default function useOrbSignal({ score, loading, stockItems = [], userId, canSeeSars = false }) {
  const settings = useExpirySettings();
  const [sars, setSars] = useState([]);
  const [tasksTick, setTasksTick] = useState(0);
  const [baseline, setBaseline] = useState(() => readBaseline(globalThis.localStorage, userId));
  const acknowledgeRef = useRef(false);

  // SARs (only for people allowed to read them).
  useEffect(() => {
    if (!canSeeSars) { setSars([]); return undefined; }
    return onSnapshot(collection(db, 'governance_sars'), (snap) => setSars(snap.docs.map((d) => d.data())), () => setSars([]));
  }, [canSeeSars]);

  // Operational tasks live on this device; look again when they change.
  useEffect(() => {
    const bump = () => setTasksTick((n) => n + 1);
    window.addEventListener('primovex:operational-escalations-changed', bump);
    const timer = setInterval(bump, 60000);
    return () => { window.removeEventListener('primovex:operational-escalations-changed', bump); clearInterval(timer); };
  }, []);

  const current = useMemo(() => {
    if (loading) return null;
    const counts = summariseStockAlerts(stockItems, { categoryOf: (item) => normalizeStockItemCategory(item).category, settings }).counts;
    return takeSnapshot({ score, stockCounts: counts, highTasks: highPriorityTaskCount(getOperationalEscalations()), overdueSars: overdueSarCount(sars) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, score, stockItems, settings, sars, tasksTick]);

  // Keep the remembered baseline in step: set it the first time, lower it as things improve,
  // and reset it to "now" when the orb is opened.
  useEffect(() => {
    if (!current) return;
    const acknowledged = acknowledgeRef.current;
    const next = nextBaseline(current, baseline, { acknowledged });
    acknowledgeRef.current = false;
    if (!baseline || JSON.stringify(next) !== JSON.stringify(baseline)) {
      setBaseline(next);
      writeBaseline(globalThis.localStorage, userId, next);
    }
  }, [current, baseline, userId]);

  const acknowledge = useCallback(() => {
    acknowledgeRef.current = true;
    if (current) {
      setBaseline(current);
      writeBaseline(globalThis.localStorage, userId, current);
      acknowledgeRef.current = false;
    }
  }, [current, userId]);

  const result = useMemo(() => (current ? detectChange(current, baseline) : { changed: false, reasons: [] }), [current, baseline]);
  return { ...result, acknowledge };
}
