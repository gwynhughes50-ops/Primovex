import { useEffect, useMemo, useState } from 'react';
import { getSenseProvider } from '../providers/providerRegistry';
import { confirmSpaceContext, loadSenseState, saveSenseState } from '../services/senseStore';

export default function useSenseContext() {
  const [state, setState] = useState(() => loadSenseState());
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const refresh = () => setState(loadSenseState());
    window.addEventListener('primovex:sense-changed', refresh);
    return () => window.removeEventListener('primovex:sense-changed', refresh);
  }, []);

  const activeSpace = useMemo(() => state.spaces.find((space) => space.id === state.activeContext?.spaceId) || null, [state]);

  async function scan(providerId = 'mock-ble') {
    setScanning(true);
    try {
      const provider = getSenseProvider(providerId);
      const result = await provider.scan(state.spaces);
      if (!result.detected) return result;
      const next = confirmSpaceContext(state, result.spaceId, 'Primovex Sense', result.provider, result.confidence);
      saveSenseState(next);
      setState(next);
      return result;
    } finally {
      setScanning(false);
    }
  }

  return { state, activeSpace, scanning, scan };
}
