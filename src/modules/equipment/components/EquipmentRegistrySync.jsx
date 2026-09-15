import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToSharedEquipmentRegistry } from '../services/equipmentRegistry';

export default function EquipmentRegistrySync() {
  const { user, loading, isSyntheticMode } = useAuth();

  useEffect(() => {
    if (loading || !user || isSyntheticMode) return undefined;

    const unsubscribe = subscribeToSharedEquipmentRegistry((status) => {
      document.documentElement.dataset.equipmentSync = status?.state || 'unknown';
    });

    return () => unsubscribe?.();
  }, [user?.uid, loading, isSyntheticMode]);

  return null;
}
