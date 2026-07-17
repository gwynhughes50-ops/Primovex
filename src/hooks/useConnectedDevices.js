import { useCallback, useEffect, useMemo, useState } from "react";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { demoConnectDevices } from "@/data/demoDataset";
import {
  buildConnectIntelligence,
  DEFAULT_CONNECT_PROVIDER,
  getConnectProviderSettings,
  getProviderSummary,
  MOCK_CONNECTED_DEVICES,
  saveConnectProviderSettings,
  subscribeConnectedDevices,
} from "@/services/connectService";

export default function useConnectedDevices() {
  const [providerSettings, setProviderSettings] = useState(() => getConnectProviderSettings());
  const [devices, setDevices] = useState(MOCK_CONNECTED_DEVICES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const activeProvider = providerSettings.activeProvider || DEFAULT_CONNECT_PROVIDER;

  useEffect(() => {
    if (isSafeSyntheticMode()) {
      setDevices(demoConnectDevices);
      setLoading(false);
      setError("");
      return () => {};
    }

    setLoading(true);
    setError("");
    const unsub = subscribeConnectedDevices(
      (rows) => {
        setDevices(rows);
        setLoading(false);
      },
      (err) => {
        setError(err?.message || "Unable to load connected devices");
        setLoading(false);
      },
      { providerId: activeProvider, providerSettings }
    );

    return () => unsub?.();
  }, [activeProvider, providerSettings]);

  const updateProviderSettings = useCallback((nextSettings) => {
    const resolved = typeof nextSettings === "function" ? nextSettings(getConnectProviderSettings()) : nextSettings;
    const saved = saveConnectProviderSettings(resolved);
    setProviderSettings(saved);
    return saved;
  }, []);

  const setActiveProvider = useCallback(
    (providerId) => {
      updateProviderSettings((current) => ({
        ...current,
        activeProvider: providerId || DEFAULT_CONNECT_PROVIDER,
      }));
    },
    [updateProviderSettings]
  );

  const intelligence = useMemo(() => buildConnectIntelligence(devices, activeProvider), [devices, activeProvider]);
  const provider = useMemo(() => getProviderSummary(activeProvider), [activeProvider]);

  return {
    devices,
    loading,
    error,
    intelligence,
    provider,
    providerSettings,
    activeProvider,
    setActiveProvider,
    updateProviderSettings,
  };
}
