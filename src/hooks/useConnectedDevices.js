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
import { listEquipment } from "@/modules/equipment/services/equipmentRegistry";

export default function useConnectedDevices() {
  const [providerSettings, setProviderSettings] = useState(() => getConnectProviderSettings());
  const [devices, setDevices] = useState(MOCK_CONNECTED_DEVICES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [equipmentRevision, setEquipmentRevision] = useState(0);

  const activeProvider = providerSettings.activeProvider || DEFAULT_CONNECT_PROVIDER;

  useEffect(() => {
    const refresh = () => setEquipmentRevision((value) => value + 1);
    window.addEventListener("primovex:equipment-registry-changed", refresh);
    return () => window.removeEventListener("primovex:equipment-registry-changed", refresh);
  }, []);

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

  const provider = useMemo(() => getProviderSummary(activeProvider), [activeProvider]);
  const linkedDevices = useMemo(() => {
    const equipment = listEquipment();
    return devices.map((device) => {
      const asset = equipment.find((item) => item.connected?.deviceId === device.id);
      if (!asset) return device;
      return {
        ...device,
        equipmentId: asset.equipmentId,
        equipment: asset.name,
        spaceId: asset.currentSpaceId,
        fridgeId: asset.monitoring?.fridgeId || device.fridgeId,
        min: asset.monitoring?.min ?? device.min,
        max: asset.monitoring?.max ?? device.max,
        integrationStatus: "active",
      };
    });
  }, [devices, equipmentRevision]);

  return {
    devices: linkedDevices,
    loading,
    error,
    intelligence: buildConnectIntelligence(linkedDevices, activeProvider),
    provider,
    providerSettings,
    activeProvider,
    setActiveProvider,
    updateProviderSettings,
  };
}
