import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToSharedSpaceRegistry } from '../services/sharedSpaceRegistry';

export default function SpaceRegistrySync() {
  const { user, loading, isSyntheticMode } = useAuth();

  useEffect(() => {
    if (loading || !user || isSyntheticMode) return undefined;

    const unsubscribe = subscribeToSharedSpaceRegistry((status) => {
      document.documentElement.dataset.spaceSync = status?.state || 'unknown';
    });

    return () => unsubscribe?.();
  }, [user?.uid, loading, isSyntheticMode]);

  return null;
}
