import { useEffect, useMemo, useState } from "react";
import { buildConnectIntelligence, MOCK_CONNECTED_DEVICES, subscribeConnectedDevices } from "@/services/connectService";

export default function useConnectedDevices() {
  const [devices, setDevices] = useState(MOCK_CONNECTED_DEVICES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = subscribeConnectedDevices(
      (rows) => {
        setDevices(rows);
        setLoading(false);
      },
      (err) => {
        setError(err?.message || "Unable to load connected devices");
        setLoading(false);
      }
    );

    return () => unsub?.();
  }, []);

  const intelligence = useMemo(() => buildConnectIntelligence(devices), [devices]);

  return { devices, loading, error, intelligence };
}
