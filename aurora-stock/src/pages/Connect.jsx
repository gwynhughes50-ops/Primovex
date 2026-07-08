import React, { useMemo, useState } from "react";
import {
  Activity,
  Battery,
  CheckCircle2,
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
import useConnectedDevices from "@/hooks/useConnectedDevices";
import { useAuth } from "@/contexts/AuthContext";
import AccessDenied from "@/components/security/AccessDenied";
import { buildDeviceHistory, getDeviceStatus } from "@/services/connectService";

function ConnectBadge({ device }) {
  const status = getDeviceStatus(device);
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${status.className}`}>
      <span className={`h-2 w-2 rounded-full ${status.dotClassName}`} />
      {status.label}
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
        <span>24h temperature trend</span>
        <span>{device.min}-{device.max}{device.unit}</span>
      </div>
      <svg viewBox="0 0 100 44" className="h-24 w-full overflow-visible">
        <rect x="0" y={Math.min(rangeTop, rangeBottom)} width="100" height={Math.abs(rangeBottom - rangeTop)} rx="2" className="fill-emerald-400/10" />
        <polyline fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} className="text-teal-300" />
        {history.map((point, index) => {
          if (index % 5 !== 0 && index !== history.length - 1) return null;
          const x = (index / Math.max(1, history.length - 1)) * 100;
          const y = 42 - ((point.value - minValue) / spread) * 34;
          return <circle key={point.label} cx={x} cy={y} r="1.4" className="fill-teal-200" />;
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
        <div>
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-teal-400/20 bg-teal-500/10 text-teal-200">
              {device.type === "environment" ? <Activity className="h-5 w-5" /> : <Thermometer className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-semibold text-white">{device.name}</h3>
              <p className="text-xs text-slate-400">{device.room} • {device.site}</p>
            </div>
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
              <p className="text-sm text-slate-400">{device.provider} • {device.room}</p>
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
          <p className="mt-1 text-xs text-slate-500">Auto-captured by sensor</p>
        </div>
        <div className={`rounded-2xl border p-4 ${status.className}`}>
          <p className="text-xs uppercase tracking-wide opacity-75">Device health</p>
          <p className="mt-2 text-xl font-bold text-white">{status.label}</p>
          <p className="mt-1 text-xs opacity-75">Battery {device.battery}% • Signal {device.signal}%</p>
        </div>
      </div>

      <div className="mt-5">
        <MiniChart device={device} />
      </div>

      <div className="mt-5 rounded-2xl border border-teal-400/20 bg-teal-500/10 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-teal-200" />
          <div>
            <h3 className="font-semibold text-white">MedAI Cold Chain Note</h3>
            <p className="mt-1 text-sm text-slate-300">
              {status.key === "online"
                ? `${device.name} is reporting normally and remains within the configured safe range.`
                : status.key === "critical"
                  ? `${device.name} is outside range. Check the device and review affected stock if exposure continues.`
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
  const { devices, loading, error, intelligence } = useConnectedDevices();

  if (!canViewConnect) {
    return <AccessDenied title="MedTrak Connect access restricted" message="You do not currently have permission to view connected devices. Ask a System Admin or Practice Manager to grant the connect.view capability." />;
  }
  const [selectedId, setSelectedId] = useState(devices[0]?.id);
  const selectedDevice = devices.find((d) => d.id === selectedId) || devices[0];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-100">
            <RadioTower className="h-3.5 w-3.5" /> MedTrak Connect
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Connected Practice</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Live device monitoring for cold-chain, rooms and future smart practice hardware. This sprint uses simulated readings so the workflow is ready before physical sensors are selected.
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
          {error}. Showing simulated devices.
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
              <p className="mt-1 text-xs text-slate-500">Last refreshed from device stream. Simulated data mode enabled.</p>
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Thermometer} label="Cold Chain" value={intelligence.coldChainOk ? "OK" : "Review"} caption={`${intelligence.coldChainDevices.length} fridge devices`} tone="emerald" />
        <StatTile icon={Wifi} label="Connectivity" value={intelligence.allOnline ? "Live" : "Issue"} caption={`${intelligence.offline.length} offline`} tone="teal" />
        <StatTile icon={Battery} label="Battery" value={`${intelligence.avgBattery || "—"}%`} caption="Average across devices" tone="amber" />
        <StatTile icon={Signal} label="Signal" value={`${intelligence.avgSignal || "—"}%`} caption="Average signal health" tone="sky" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Connected Devices</h2>
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
            <h2 className="text-lg font-bold text-white">MedAI Cold Chain Brief</h2>
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
          <h2 className="text-lg font-bold text-white">Future Hardware Contract</h2>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Real devices will write into the <span className="font-mono text-slate-200">connected_devices</span> collection. Each reading can then feed Operations Centre, Practice Pulse, cold-chain compliance, MedAI and audit history from one source of truth.
        </p>
      </Card>
    </div>
  );
}
