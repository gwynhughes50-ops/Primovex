import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { loadSpaceRegistry, saveSpaceRegistry } from '@/modules/sense/services/sharedSpaceRegistry';

const REGISTRY_DOC_ID = 'main';
const REGISTRY_COLLECTION = 'practice_space_registry';
const SpaceRegistrySyncContext = createContext(null);

function registryPayload(registry, actor) {
  return {
    schemaVersion: 2,
    sites: registry.sites || [],
    floors: registry.floors || [],
    zones: registry.zones || [],
    spaces: registry.spaces || [],
    updatedAt: serverTimestamp(),
    updatedBy: actor || null,
  };
}

export function SpaceRegistrySyncProvider({ children }) {
  const { user, displayName, isSyntheticMode } = useAuth();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const hydratedRef = useRef(false);
  const writeTimerRef = useRef(null);
  const applyingRemoteRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = false;
    applyingRemoteRef.current = false;
    setError('');

    if (!user?.uid || isSyntheticMode) {
      setStatus(isSyntheticMode ? 'local-only' : 'idle');
      return undefined;
    }

    const registryRef = doc(db, REGISTRY_COLLECTION, REGISTRY_DOC_ID);
    setStatus('connecting');

    const unsubscribe = onSnapshot(
      registryRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          try {
            const local = loadSpaceRegistry();
            setStatus('uploading');
            await setDoc(registryRef, registryPayload(local, user.uid));
            hydratedRef.current = true;
            setStatus('synced');
          } catch (uploadError) {
            console.error('Unable to create shared Digital Space Registry', uploadError);
            setError(uploadError?.message || String(uploadError));
            setStatus('error');
          }
          return;
        }

        const remote = snapshot.data();
        applyingRemoteRef.current = true;
        saveSpaceRegistry(
          {
            schemaVersion: 2,
            sites: Array.isArray(remote.sites) ? remote.sites : [],
            floors: Array.isArray(remote.floors) ? remote.floors : [],
            zones: Array.isArray(remote.zones) ? remote.zones : [],
            spaces: Array.isArray(remote.spaces) ? remote.spaces : [],
            updatedAt: remote.updatedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          },
          { source: 'remote' }
        );
        hydratedRef.current = true;
        setStatus('synced');
        window.setTimeout(() => { applyingRemoteRef.current = false; }, 0);
      },
      (snapshotError) => {
        console.error('Digital Space Registry sync failed', snapshotError);
        setError(snapshotError?.message || String(snapshotError));
        setStatus('error');
      }
    );

    const handleLocalChange = (event) => {
      if (!hydratedRef.current || applyingRemoteRef.current || event?.detail?.source === 'remote') return;
      const next = event?.detail?.registry || loadSpaceRegistry();
      window.clearTimeout(writeTimerRef.current);
      writeTimerRef.current = window.setTimeout(async () => {
        try {
          setStatus('saving');
          await setDoc(registryRef, registryPayload(next, displayName || user.uid), { merge: true });
          setStatus('synced');
        } catch (writeError) {
          console.error('Unable to save Digital Space Registry', writeError);
          setError(writeError?.message || String(writeError));
          setStatus('error');
        }
      }, 350);
    };

    window.addEventListener('primovex:space-registry-changed', handleLocalChange);
    return () => {
      unsubscribe();
      window.removeEventListener('primovex:space-registry-changed', handleLocalChange);
      window.clearTimeout(writeTimerRef.current);
    };
  }, [user?.uid, displayName, isSyntheticMode]);

  const value = useMemo(() => ({ status, error, isSynced: status === 'synced' }), [status, error]);
  return <SpaceRegistrySyncContext.Provider value={value}>{children}</SpaceRegistrySyncContext.Provider>;
}

export function useSpaceRegistrySync() {
  return useContext(SpaceRegistrySyncContext) || { status: 'idle', error: '', isSynced: false };
}
