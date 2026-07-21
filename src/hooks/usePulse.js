import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import {
  calculateCompliancePulse,
  calculateInventoryPulse,
  calculateOverallPulse,
  calculatePurchasingPulse,
  placeholderModule,
} from '@/services/pulseService';

export default function usePulse() {
  const [stockItems, setStockItems] = useState([]);
  const [reorderRequests, setReorderRequests] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [temperatureIncidents, setTemperatureIncidents] = useState([]);
  const [loadingMap, setLoadingMap] = useState({
    stock: true,
    reorders: true,
    orders: true,
    incidents: true,
  });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'stock_items'), limit(500)),
      (snap) => {
        setStockItems(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoadingMap((prev) => ({ ...prev, stock: false }));
      },
      (err) => {
        console.error('Pulse stock query failed:', err);
        setLoadingMap((prev) => ({ ...prev, stock: false }));
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'reorder_requests'), limit(500)),
      (snap) => {
        setReorderRequests(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoadingMap((prev) => ({ ...prev, reorders: false }));
      },
      (err) => {
        console.error('Pulse reorder query failed:', err);
        setLoadingMap((prev) => ({ ...prev, reorders: false }));
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'purchase_orders'), limit(500)),
      (snap) => {
        setPurchaseOrders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoadingMap((prev) => ({ ...prev, orders: false }));
      },
      (err) => {
        console.error('Pulse purchase order query failed:', err);
        setLoadingMap((prev) => ({ ...prev, orders: false }));
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'temperature_incidents'), limit(300)),
      (snap) => {
        setTemperatureIncidents(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoadingMap((prev) => ({ ...prev, incidents: false }));
      },
      (err) => {
        console.error('Pulse temperature incident query failed:', err);
        setLoadingMap((prev) => ({ ...prev, incidents: false }));
      }
    );

    return () => unsub();
  }, []);

  const loading = Object.values(loadingMap).some(Boolean);

  return useMemo(() => {
    const inventory = calculateInventoryPulse(stockItems);
    const purchasing = calculatePurchasingPulse({ reorderRequests, purchaseOrders });
    const compliance = calculateCompliancePulse({ temperatureIncidents });

    const pulse = calculateOverallPulse([
      inventory,
      purchasing,
      compliance,
      placeholderModule('assets', 'Assets', 100),
      placeholderModule('estates', 'Estates', 100),
      placeholderModule('workforce', 'Workforce', 100),
      placeholderModule('governance', 'Governance', 100),
    ]);

    return {
      ...pulse,
      loading,
    };
  }, [stockItems, reorderRequests, purchaseOrders, temperatureIncidents, loading]);
}
