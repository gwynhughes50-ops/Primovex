import { useEffect, useState } from "react";
import { subscribeToActivity } from "@/services/activityService";

export function useActivity({ max = 50 } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = subscribeToActivity(
      (data) => {
        setRows(data);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
      { max }
    );

    return () => unsub?.();
  }, [max]);

  return { rows, loading, error };
}
