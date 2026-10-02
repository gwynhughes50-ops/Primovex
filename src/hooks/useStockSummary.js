import { useEffect, useState } from "react";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { getDemoStockSummary } from "@/data/demoDataset";
import { collection, onSnapshot } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { stockLevelStatus } from "@/lib/stockAlerts";

const ITEMS_COL = "stock_items";

export default function useStockSummary() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [summary, setSummary] = useState({
    totalItems: 0,
    lowStockItems: 0,
  });

  useEffect(() => {
    if (isSafeSyntheticMode()) {
      setSummary(getDemoStockSummary());
      setLoading(false);
      setError(null);
      return () => {};
    }

    setLoading(true);

    const unsub = onSnapshot(
      collection(db, ITEMS_COL),
      (snap) => {
        let total = 0;
        let low = 0;

        snap.forEach((doc) => {
          const d = doc.data();

          // skip archived
          if (d.archived_at) return;

          total += 1;

          // Out of stock or at/below its minimum: the same rule as the stock
          // card badge, the Alerts page and the pop-up (src/lib/stockAlerts.js).
          if (stockLevelStatus(d)) {
            low += 1;
          }
        });

        setSummary({
          totalItems: total,
          lowStockItems: low,
        });

        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return { ...summary, loading, error };
}

