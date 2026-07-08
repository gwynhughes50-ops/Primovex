import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Battery,
  CheckCircle2,
  Cloud,
  Code2,
  Database,
  KeyRound,
  LockKeyhole,
  RadioTower,
  Router,
  ShieldCheck,
  Signal,
  Sparkles,
  Thermometer,
  Wifi,
  Zap,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import useConnectedDevices from "@/hooks/useConnectedDevices";
import { useAuth } from "@/contexts/AuthContext";
import AccessDenied from "@/components/security/AccessDenied";
import { buildDeviceHistory, getDeviceStatus, listProviders } from "@/services/connectService";
import { buildTuyaBackendContract } from "@/services/connect/providers/TuyaProvider";
import { getConnectCloudHealth, syncConnectProvider, buildConnectCloudDeploymentNotes } from "@/services/connect/connectCloudClient";

function ConnectBadge({ device }) {
  const status = getDeviceStatus(device);
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${status.className}`}>
      <span className={`h-2 w-2 rounded-full ${status.dotClassName}`} />
      {status.label}
    </span>
  );
}

function ProviderBadge({ provider }) {
  const statusMap = {
    online: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    "backend-required": "border-sky-400/30 bg-sky-500/10 text-sky-100",
    planned: "border-slate-500/30 bg-slate-500/10 text-slate-200",
  };

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusMap[provider?.status] || statusMap.planned}`}>
      {provider?.status === "online" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
      {provider?.status === "backend-required" ? "Backend required" : provider?.status || "planned"}
    </span>
  );
}

function MiniChart({ device }) {
  const history = useMemo(() => buildDeviceHistory(device, 20), [device]);
  const values = history.map((p) => p.value);
  const minValue = Math.min(...values, Number(device.min ?? 0));
  const maxValue = Math.max(...values, Number(device.max ?? 10));
  const spread = Math.max(1, maxValue - minValue);
  const points = history
    .map((point, index) => {
      const x = (index / Math.max(1, history.length - 1)) * 100;
      const y = 42 - ((point.value - minValue) / spread) * 34;
      return `${x},${y}`;
    })
    .join(" ");

  const rangeTop = 42 - ((Number(device.max) - minValue) / spread) * 34;
  const rangeBottom = 42 - ((Number(device.min) - minValue) / spread) * 34;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>24h trend</span>
        <span>{device.min}-{device.max}{device.unit}</span>
      </div>
      <svg viewBox="0 0 100 44" className="h-24 w-full overflow-visible">
        <rect x="0" y={Math.min(rangeTop, rangeBottom)} width="100" height={Math.abs(rangeBottom - rangeTop)} rx="2" className="fill-emerald-400/10" />
        <polyline fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} className="text-teal-300" />
        {history.map((point, index) => {
          if (index % 5 !== 0 && index !== history.length - 1) return null;
          const x = (index / Math.max(1, history.length - 1)) * 100;
          const y = 42 - ((point.value - minValue) / spread) * 34;
          return <circle key={`${point.label}-${index}`} cx={x} cy={y} r="1.4" className="fill-teal-200" />;
        })}
      </svg>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, caption, tone = "teal" }) {
  const tones = {
    teal: "border-teal-400/20 bg-teal-500/10 text-teal-100",
    emerald: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-400/20 bg-amber-500/10 text-amber-100",
    sky: "border-sky-400/20 bg-sky-500/10 text-sky-100",
  };
  return (
    <Card className={`border p-4 ${tones[tone] || tones.teal}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</span>
        <Icon className="h-4 w-4 opacity-80" />
      </div>
      <div className="mt-3 text-3xl font-black tracking-tight text-white">{value}</div>
      {caption && <div className="mt-1 text-xs opacity-75">{caption}</div>}
    </Card>
  );
}

function ConnectCloudPanel({ activeProvider, providerSettings, canManageDevices }) {
  const [health, setHealth] = useState({ status: "checking", message: "Checking Connect Cloud..." });
  const [syncing, setSyncing] = useState(false);

  async function refreshHealth() {
    const result = await getConnectCloudHealth({ providerId: activeProvider, settings: providerSettings?.[activeProvider] || {} });
    setHealth({
      status: result.ok ? result.data?.status || "online" : "not-deployed",
      message: result.message,
      providerHealth: result.data?.providerHealth,
      checkedAt: result.data?.checkedAt,
    });
  }

  async function runSync() {
    setSyncing(true);
    const result = await syncConnectProvider({ providerId: activeProvider, settings: providerSettings?.[activeProvider] || {} });
    setHealth((current) => ({
      ...current,
      status: result.ok ? "online" : "sync-error",
      message: result.message,
      lastSyncResult: result.data,
    }));
    setSyncing(false);
  }

  useEffect(() => {
    refreshHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProvider]);

  const isOnline = health.status === "online";
  const notes = buildConnectCloudDeploymentNotes();

  return (
    <Card className="border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className={`grid h-11 w-11 place-items-center rounded-2xl border ${isOnline ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-sky-400/30 bg-sky-500/10 text-sky-200"}`}>
            <Cloud className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-white">MedTrak Connect Cloud</h2>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${isOnline ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-sky-400/30 bg-sky-500/10 text-sky-100"}`}>
                {health.status}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Backend layer for provider sync, device ingestion, alert creation and future webhooks. React talks to Connect Cloud, not directly to Tuya or other vendors.
            </p>
            <p className="mt-2 text-sm text-slate-300">{health.message}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={refreshHealth} className="rounded-full border-white/15 bg-slate-950/40 text-slate-100 hover:bg-slate-800">
            Check health
          </Button>
          <Button type="button" disabled={!canManageDevices || syncing} onClick={runSync} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 px-4 font-semibold text-slate-950">
            {syncing ? "Syncing..." : "Run sync"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Provider</p>
          <p className="mt-1 font-bold text-white">{activeProvider}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Provider health</p>
          <p className="mt-1 font-bold text-white">{health.providerHealth?.healthScore ?? "—"}%</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Last result</p>
          <p className="mt-1 font-bold text-white">{health.lastSyncResult?.deviceCount ?? "—"} devices</p>
        </div>
      </div>

      <details className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
        <summary className="cursor-pointer font-semibold text-slate-100">Deployment notes</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-400">
          {notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </details>
    </Card>
  );
}

function ProviderManager({ activeProvider, providerSettings, setActiveProvider, updateProviderSettings, canManageDevices }) {
  const providers = listProviders();
  const tuya = providerSettings?.tuya || { region: "eu", accessId: "", projectId: "", deviceId: "" };
  const [draftTuya, setDraftTuya] = useState(tuya);

  useEffect(() => {
    setDraftTuya(tuya);
  }, [tuya.region, tuya.accessId, tuya.projectId, tuya.deviceId]);

  const contract = buildTuyaBackendContract(draftTuya);

  function saveTuyaDraft() {
    updateProviderSettings({
      ...providerSettings,
      tuya: draftTuya,
    });
  }

  return (
    <Card className="border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Router className="h-5 w-5 text-teal-200" />
            <h2 className="text-lg font-bold text-white">Connect Providers</h2>
          </div>
          <p className="mt-1 text-sm text-slate-400">Hardware is accessed through providers so Tuya, ESP32, MQTT or Home Assistant can plug into the same MedTrak dashboard.</p>
        </div>
        <span className="rounded-full border border-teal-400/20 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-100">Active: {activeProvider}</span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
        {providers.map((provider) => {
          const isActive = provider.id === activeProvider;
          return (
            <button
              key={provider.id}
              type="button"
              disabled={!canManageDevices || provider.status === "planned"}
              onClick={() => setActiveProvider(provider.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                isActive ? "border-teal-300/50 bg-teal-500/10" : "border-white/10 bg-slate-950/40 hover:border-teal-300/30"
              } ${!canManageDevices || provider.status === "planned" ? "cursor-not-allowed opacity-70" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl border border-teal-400/20 bg-teal-500/10 text-teal-200">
                  {provider.mode?.includes("cloud") ? <Cloud className="h-5 w-5" /> : provider.id === "mqtt" ? <Database className="h-5 w-5" /> : <RadioTower className="h-5 w-5" />}
                </div>
                {isActive && <CheckCircle2 className="h-5 w-5 text-emerald-300" />}
              </div>
              <h3 className="mt-3 font-semibold text-white">{provider.shortLabel || provider.label}</h3>
              <p className="mt-1 line-clamp-3 text-xs text-slate-400">{provider.description}</p>
              <div className="mt-3"><ProviderBadge provider={provider} /></div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 text-sky-200" />
            <div>
              <h3 className="font-semibold text-white">Tuya backend-ready configuration</h3>
              <p className="mt-1 text-sm text-slate-300">
                Store only non-secret metadata here. The Tuya Access Secret must live in Firebase Functions or Secret Manager, not in the browser.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Region
              <Input disabled={!canManageDevices} value={draftTuya.region} onChange={(e) => setDraftTuya((current) => ({ ...current, region: e.target.value }))} placeholder="eu" className="mt-1" />
            </label>
            <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Access ID
              <Input disabled={!canManageDevices} value={draftTuya.accessId} onChange={(e) => setDraftTuya((current) => ({ ...current, accessId: e.target.value }))} placeholder="Client ID only" className="mt-1" />
            </label>
            <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Project ID
              <Input disabled={!canManageDevices} value={draftTuya.projectId} onChange={(e) => setDraftTuya((current) => ({ ...current, projectId: e.target.value }))} placeholder="Tuya project ID" className="mt-1" />
            </label>
            <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Test Device ID
              <Input disabled={!canManageDevices} value={draftTuya.deviceId} onChange={(e) => setDraftTuya((current) => ({ ...current, deviceId: e.target.value }))} placeholder="Device ID" className="mt-1" />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400"><KeyRound className="mr-1 inline h-3.5 w-3.5" /> Never paste Access Secret into MedTrak+ frontend settings.</p>
            <Button disabled={!canManageDevices} onClick={saveTuyaDraft} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 px-4 font-semibold text-slate-950">
              Save provider metadata
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-teal-200" />
            <h3 className="font-semibold text-white">Backend contract</h3>
          </div>
          <div className="mt-3 space-y-2 text-xs text-slate-400">
            <div className="rounded-xl bg-slate-900/80 p-3"><span className="text-slate-500">Function</span><br /><span className="font-mono text-slate-100">{contract.cloudFunction}</span></div>
            <div className="rounded-xl bg-slate-900/80 p-3"><span className="text-slate-500">Secret storage</span><br /><span className="font-mono text-slate-100">{contract.secretStorage}</span></div>
            <div className="rounded-xl bg-slate-900/80 p-3"><span className="text-slate-500">Writes to</span><br /><span className="font-mono text-slate-100">connected_devices + readings + alerts</span></div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function DeviceCard({ device, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(device)}
      className={`w-full rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-300/40 hover:bg-slate-900/80 ${
        selected ? "border-teal-300/50 bg-teal-500/10" : "border-white/10 bg-slate-900/60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl border border-teal-400/20 bg-teal-500/10 text-teal-200">
            {device.type === "environment" ? <Activity className="h-5 w-5" /> : <Thermometer className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="font-semibold text-white">{device.name}</h3>
            <p className="text-xs text-slate-400">{device.room} • {device.site}</p>
          </div>
        </div>
        <ConnectBadge device={device} />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-4xl font-black tracking-tight text-white">
            {Number(device.currentValue).toFixed(1)}<span className="text-lg text-slate-400">{device.unit}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Safe range {device.min}-{device.max}{device.unit}</p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div className="flex items-center justify-end gap-1"><Battery className="h-3.5 w-3.5" /> {device.battery}%</div>
          <div className="mt-1 flex items-center justify-end gap-1"><Signal className="h-3.5 w-3.5" /> {device.signal}%</div>
          <div className="mt-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">{device.providerLabel}</div>
        </div>
      </div>
    </button>
  );
}

function DeviceDetail({ device }) {
  if (!device) return null;
  const status = getDeviceStatus(device);
  return (
    <Card className="h-full border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-400 text-slate-950 shadow-lg shadow-teal-500/20">
              <Thermometer className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{device.name}</h2>
              <p className="text-sm text-slate-400">{device.providerLabel} • {device.room}</p>
            </div>
          </div>
        </div>
        <ConnectBadge device={device} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Current</p>
          <p className="mt-2 text-4xl font-black text-white">{Number(device.currentValue).toFixed(1)}<span className="text-lg text-slate-500">{device.unit}</span></p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Last update</p>
          <p className="mt-2 text-xl font-bold text-white">{device.lastSeenLabel}</p>
          <p className="mt-1 text-xs text-slate-500">Provider: {device.providerLabel}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${status.className}`}>
          <p className="text-xs uppercase tracking-wide opacity-75">Device health</p>
          <p className="mt-2 text-xl font-bold text-white">{status.label}</p>
          <p className="mt-1 text-xs opacity-75">Battery {device.battery}% • Signal {device.signal}%</p>
        </div>
      </div>

      <div className="mt-5"><MiniChart device={device} /></div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-400"><span className="text-slate-500">Equipment</span><br /><span className="font-semibold text-slate-100">{device.equipment}</span></div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-400"><span className="text-slate-500">Firmware</span><br /><span className="font-semibold text-slate-100">{device.firmware}</span></div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-400"><span className="text-slate-500">Humidity</span><br /><span className="font-semibold text-slate-100">{device.humidity ?? "—"}{device.humidity ? "%" : ""}</span></div>
      </div>

      <div className="mt-5 rounded-2xl border border-teal-400/20 bg-teal-500/10 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-teal-200" />
          <div>
            <h3 className="font-semibold text-white">MedAI Connect Note</h3>
            <p className="mt-1 text-sm text-slate-300">
              {status.key === "online"
                ? `${device.name} is reporting normally and remains within the configured range.`
                : status.key === "critical"
                  ? `${device.name} is outside range. Check the device and review affected stock or samples if exposure continues.`
                  : `${device.name} should be checked during the next room round.`}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Connect() {
  const { can } = useAuth();
  const canViewConnect = can("connect.view");
  const canManageDevices = can("connect.manageDevices");
  const { devices, loading, error, intelligence, provider, activeProvider, providerSettings, setActiveProvider, updateProviderSettings } = useConnectedDevices();
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!selectedId && devices?.[0]?.id) setSelectedId(devices[0].id);
  }, [devices, selectedId]);

  const selectedDevice = devices.find((d) => d.id === selectedId) || devices[0];

  if (!canViewConnect) {
    return <AccessDenied title="MedTrak Connect access restricted" message="You do not currently have permission to view connected devices. Ask a System Admin or Practice Manager to grant the connect.view capability." />;
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-100">
            <RadioTower className="h-3.5 w-3.5" /> MedTrak Connect
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Connected Practice</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Provider-based device monitoring for fridges, -40°C freezers, rooms and future smart practice hardware.
          </p>
        </div>
        {canManageDevices && (
          <Button className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 px-5 font-semibold text-slate-950 shadow-lg shadow-emerald-500/30">
            <Router className="mr-2 h-4 w-4" /> Add Device
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          {error}. Showing provider fallback devices.
        </div>
      )}

      <div className="rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-slate-900/80 p-5 shadow-2xl shadow-emerald-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                {intelligence.critical.length ? "Cold Chain Requires Action" : intelligence.offline.length ? "Device Connectivity Issue" : "Connected Practice Operating Normally"}
              </h2>
              <p className="mt-1 text-sm text-slate-300">{intelligence.headline}</p>
              <p className="mt-1 text-xs text-slate-500">Active provider: {provider?.label || activeProvider}. {provider?.needsBackend ? "Live sync requires backend credentials." : "Local provider is ready."}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
              <p className="text-xs text-slate-400">Connect Score</p>
              <p className="text-2xl font-black text-white">{loading ? "—" : intelligence.healthScore}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
              <p className="text-xs text-slate-400">Devices</p>
              <p className="text-2xl font-black text-white">{loading ? "—" : devices.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
              <p className="text-xs text-slate-400">Alerts</p>
              <p className="text-2xl font-black text-white">{loading ? "—" : intelligence.critical.length + intelligence.offline.length}</p>
            </div>
          </div>
        </div>
      </div>

      <ConnectCloudPanel
        activeProvider={activeProvider}
        providerSettings={providerSettings}
        canManageDevices={canManageDevices}
      />

      <ProviderManager
        activeProvider={activeProvider}
        providerSettings={providerSettings}
        setActiveProvider={setActiveProvider}
        updateProviderSettings={updateProviderSettings}
        canManageDevices={canManageDevices}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Thermometer} label="Cold Chain" value={intelligence.coldChainOk ? "OK" : "Review"} caption={`${intelligence.coldChainDevices.length} fridge/freezer devices`} tone="emerald" />
        <StatTile icon={Wifi} label="Connectivity" value={intelligence.allOnline ? "Live" : "Issue"} caption={`${intelligence.offline.length} offline`} tone="teal" />
        <StatTile icon={Battery} label="Battery" value={`${intelligence.avgBattery || "—"}%`} caption="Average across devices" tone="amber" />
        <StatTile icon={Signal} label="Signal" value={`${intelligence.avgSignal || "—"}%`} caption="Average signal health" tone="sky" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Device Registry</h2>
            <span className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-xs text-slate-400">{devices.length} devices</span>
          </div>
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} selected={selectedDevice?.id === device.id} onSelect={(d) => setSelectedId(d.id)} />
          ))}
        </div>
        <DeviceDetail device={selectedDevice} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border border-white/10 bg-slate-900/70 p-5">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-teal-200" />
            <h2 className="text-lg font-bold text-white">MedAI Connect Brief</h2>
          </div>
          <div className="mt-4 space-y-3">
            {intelligence.dailyBrief.map((line) => (
              <div key={line} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300">{line}</div>
            ))}
          </div>
        </Card>

        <Card className="border border-white/10 bg-slate-900/70 p-5">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-amber-200" />
            <h2 className="text-lg font-bold text-white">MedAI Recommendations</h2>
          </div>
          <div className="mt-4 space-y-3">
            {intelligence.recommendations.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="rounded-full border border-teal-400/20 bg-teal-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-100">{item.priority}</span>
                    <h3 className="mt-2 font-semibold text-white">{item.title}</h3>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-center">
                    <p className="text-[10px] text-slate-500">Score</p>
                    <p className="font-black text-white">{item.score}</p>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-400">{item.reason}</p>
                <p className="mt-2 text-sm text-teal-100">{item.action}</p>
                <p className="mt-2 text-xs text-slate-500">Estimated time: {item.estimate}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="border border-white/10 bg-slate-900/70 p-5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-200" />
          <h2 className="text-lg font-bold text-white">Provider Security Model</h2>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          MedTrak+ reads device data from Firestore. External providers sync through backend services so API secrets never touch the React frontend. Tuya, ESP32, MQTT and Home Assistant can all feed the same device registry.
        </p>
      </Card>
    </div>
  );
}
