import { useEffect, useMemo, useState } from 'react';
import { getOperationalFacts, subscribeOperationalMemory } from '../engine/operationalMemoryStore';
import { runOperationalIntelligence } from '../engine/operationalIntelligenceEngine';

export default function useOperationalMemory(context = {}) {
  const [facts, setFacts] = useState(() => getOperationalFacts());
  useEffect(() => subscribeOperationalMemory(setFacts), []);
  return useMemo(() => runOperationalIntelligence(facts, context), [facts, context]);
}
