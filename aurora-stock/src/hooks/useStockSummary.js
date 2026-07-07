import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db, auth } from "../lib/firebase";

const ITEMS_COL = "stock_items";

export default function useStockSummary() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [summary, setSummary] = useState({
    totalItems: 0,
    lowStockItems: 0,
  });

  useEffect(() => {
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

          const current = Number(d.current_stock ?? 0);
          const min = Number(d.min_stock ?? 0);

          if (min > 0 && current <= min) {
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

